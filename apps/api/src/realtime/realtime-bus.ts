import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { metrics } from '../observability/metrics.js';

/** What travels between API instances. `scope` is the workspace or the document the event belongs to; `audience` limits it to those people. */
export type BusMessage = { topic: 'channel' | 'document'; scope: string; event: unknown; audience?: string[] };
type Envelope = BusMessage & { id: string; origin: string; oversize?: boolean };

const CHANNEL = 'aven_realtime';
/** PostgreSQL refuses a notification payload of 8,000 bytes or more. */
const MAX_PAYLOAD = 7500;

/**
 * Carries live events from one API instance to the others over PostgreSQL LISTEN/NOTIFY, so people connected to different instances hear each other.
 * It only distributes: each instance still checks, for every stream it holds open, that the person may be there (membership is re-checked while a stream is open).
 * Off unless REALTIME_BUS=postgres. It needs a direct connection to the database (not a transaction-mode pooler such as PgBouncer, which does not keep LISTEN).
 * Delivery is best effort and never blocks or fails the request that caused an event: if the bus is down, people on the same instance still hear it, and clients resynchronise when they reconnect.
 */
@Injectable()
export class RealtimeBus implements OnModuleInit, OnModuleDestroy {
  readonly instanceId = randomUUID();
  private readonly logger = new Logger('RealtimeBus');
  private readonly handlers = new Map<BusMessage['topic'], (message: BusMessage & { oversize?: boolean }) => void>();
  private readonly seen = new Set<string>();
  private client: pg.Client | null = null;
  private stopped = false;
  private retry: NodeJS.Timeout | undefined;
  private delay = 1000;

  constructor(private readonly connectionString?: string) {}

  get enabled() { return Boolean(this.connectionString); }

  /** Registers what to do with an event that came from another instance. */
  on(topic: BusMessage['topic'], handler: (message: BusMessage & { oversize?: boolean }) => void) { this.handlers.set(topic, handler); }

  async onModuleInit() { if (this.enabled) await this.connect(); }
  async onModuleDestroy() { this.stopped = true; clearTimeout(this.retry); const client = this.client; this.client = null; await client?.end().catch(() => undefined); }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.connectionString });
    client.on('notification', (note) => this.receive(note.payload ?? ''));
    const lost = (error?: Error) => {
      if (this.client !== client) return;
      this.client = null; metrics.set('realtime_bus_connected', 0);
      this.logger.warn(`Realtime bus connection lost${error ? `: ${error.message}` : ''}; retrying`);
      this.schedule();
    };
    client.on('error', lost); client.on('end', () => lost());
    try {
      await client.connect(); await client.query(`LISTEN ${CHANNEL}`);
      this.client = client; this.delay = 1000; metrics.set('realtime_bus_connected', 1);
    } catch (error) {
      await client.end().catch(() => undefined);
      metrics.inc('realtime_bus_reconnects_total'); this.logger.warn(`Realtime bus could not connect: ${error instanceof Error ? error.message : 'unknown error'}`);
      this.schedule();
    }
  }

  private schedule() {
    if (this.stopped || this.retry) return;
    metrics.inc('realtime_bus_reconnects_total');
    this.retry = setTimeout(() => { this.retry = undefined; void this.connect(); }, this.delay);
    this.retry.unref?.(); this.delay = Math.min(this.delay * 2, 30_000);
  }

  /** Tells the other instances. Never throws. */
  async publish(message: BusMessage): Promise<void> {
    const client = this.client;
    if (!this.enabled || !client) { if (this.enabled) metrics.inc('realtime_publish_failures_total', { reason: 'not-connected' }); return; }
    let envelope: Envelope = { ...message, id: `${this.instanceId}:${randomUUID()}`, origin: this.instanceId };
    let payload = JSON.stringify(envelope);
    if (Buffer.byteLength(payload) > MAX_PAYLOAD) { envelope = { ...envelope, event: null, oversize: true }; payload = JSON.stringify(envelope); metrics.inc('realtime_oversize_events_total'); }
    try { await client.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]); metrics.inc('realtime_events_published_total', { topic: message.topic }); }
    catch { metrics.inc('realtime_publish_failures_total', { reason: 'send' }); }
  }

  private receive(raw: string) {
    let envelope: Envelope;
    try { envelope = JSON.parse(raw) as Envelope; } catch { metrics.inc('realtime_receive_failures_total', { reason: 'malformed' }); return; }
    if (!envelope || envelope.origin === this.instanceId || typeof envelope.id !== 'string' || typeof envelope.scope !== 'string') return;
    if (this.seen.has(envelope.id)) { metrics.inc('realtime_duplicates_total'); return; } // a notification can arrive twice after a reconnect
    this.seen.add(envelope.id); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value as string);
    const handler = this.handlers.get(envelope.topic);
    if (!handler) return;
    try { handler({ topic: envelope.topic, scope: envelope.scope, event: envelope.event, audience: envelope.audience, oversize: envelope.oversize }); metrics.inc('realtime_events_received_total', { topic: envelope.topic }); }
    catch { metrics.inc('realtime_receive_failures_total', { reason: 'handler' }); }
  }
}
