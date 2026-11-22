import { randomUUID } from 'node:crypto';
import { metrics } from './metrics.js';
import { scrub } from './scrub.js';

export type ErrorContext = { area: string; requestId?: string; method?: string; route?: string; status?: number; extra?: Record<string, string | number | boolean> };

type Sender = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean }>;

/**
 * Sends errors to a Sentry-compatible tracker when `ERROR_TRACKING_DSN` is set, and does nothing but count them otherwise: AVEN never depends on a tracker being configured.
 * What is sent is the error's type, a scrubbed message and stack, and a few tags (area, route pattern, status). Never request bodies, headers, cookies, tokens or user content.
 */
export class ErrorReporter {
  private target: { url: string; auth: string; dsn: string } | null = null;
  private environment = 'production'; private release: string | undefined;
  private window: number[] = [];
  constructor(private readonly send: Sender = (url, init) => fetch(url, init)) {}

  configure(options: { dsn?: string; environment: string; release?: string }) {
    this.environment = options.environment; this.release = options.release; this.target = null;
    if (!options.dsn) return;
    try {
      const dsn = new URL(options.dsn); const project = dsn.pathname.replace(/^\//, '');
      if (!dsn.username || !project || !/^https?:$/.test(dsn.protocol)) return;
      this.target = { url: `${dsn.protocol}//${dsn.host}/api/${project}/envelope/`, auth: `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=aven/1`, dsn: `${dsn.protocol}//${dsn.username}@${dsn.host}/${project}` };
    } catch { /* an unusable DSN means no tracker */ }
  }

  get enabled() { return this.target !== null; }

  /** Never throws and never waits: a broken tracker must not break the request that failed. */
  capture(error: unknown, context: ErrorContext, level: 'error' | 'warning' = 'error') {
    metrics.inc('error_reports_total', { area: context.area, sent: this.target ? 'yes' : 'no' });
    const target = this.target; if (!target) return;
    const now = Date.now(); this.window = this.window.filter((at) => now - at < 60_000);
    if (this.window.length >= 30) { metrics.inc('error_reports_total', { area: context.area, sent: 'dropped' }); return; } // an outage must not turn into a flood of reports
    this.window.push(now);
    const type = error instanceof Error ? error.name : 'Error';
    const message = scrub(error instanceof Error ? error.message : String(error), 500);
    const stack = error instanceof Error && error.stack ? scrub(error.stack, 6000) : '';
    const eventId = randomUUID().replace(/-/g, '');
    const event = {
      event_id: eventId, timestamp: now / 1000, platform: 'node', level, environment: this.environment, release: this.release,
      exception: { values: [{ type, value: message, stacktrace: stack ? { frames: stack.split('\n').slice(1, 40).reverse().map((line) => ({ function: line.trim().slice(0, 200) })) } : undefined }] },
      tags: { area: context.area, route: context.route, method: context.method, status: context.status === undefined ? undefined : String(context.status), request_id: context.requestId, ...Object.fromEntries(Object.entries(context.extra ?? {}).map(([key, value]) => [key, scrub(String(value), 100)])) },
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString(), dsn: target.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    void this.send(target.url, { method: 'POST', headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': target.auth }, body, signal: AbortSignal.timeout(3000) })
      .then((response) => { if (!response.ok) metrics.inc('error_reports_total', { area: context.area, sent: 'failed' }); })
      .catch(() => metrics.inc('error_reports_total', { area: context.area, sent: 'failed' }));
  }
}

export const reporter = new ErrorReporter();

/** Records and reports a failure of a background job (a timer-driven run), so it is visible in metrics and the tracker as well as the log. */
export function reportJobFailure(job: string, error: unknown) {
  metrics.inc('background_job_failures_total', { job });
  reporter.capture(error, { area: `job:${job}` });
}

/** The same for a call to an outside service (Stripe, the AI provider, email, calendars). */
export function reportIntegrationFailure(integration: string, error: unknown, extra?: Record<string, string | number | boolean>) {
  metrics.inc('integration_failures_total', { integration });
  reporter.capture(error, { area: `integration:${integration}`, extra }, 'warning');
}
