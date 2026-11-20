import { apply, fromChange, SyncClient, type Operation } from '@aven/collab';
import { mergeText } from './block-merge.ts';

export type TextEvent = { blockId: string; revision: number; operation: Operation; clientId: string | null };
export type LiveTransport = {
  /** The block's current text and revision. Rejects with `{ status: 409 | 404 }` when the block can't be edited live. */
  get(blockId: string): Promise<{ text: string; revision: number }>;
  /** Sends one edit. The server's answer arrives as an event on the stream, in order with everyone else's edits. */
  post(blockId: string, body: { revision: number; operation: Operation; clientId: string }): Promise<void>;
  /** Tells the server that edits with this id must no longer be accepted. Once it succeeds, whatever the server had accepted is all it ever will. */
  fence(blockId: string, clientId: string): Promise<void>;
};
export type LiveHooks = {
  /** The text currently shown for a block, if it is shown. */
  readText(blockId: string): string | undefined;
  /** Show new text for a block. `operation` is the change someone else made, in the coordinates of the old text, for moving a caret. */
  writeText(blockId: string, text: string, operation?: Operation): void;
  /** Called after anything that changes whether typed text is still waiting for the server. */
  changed(): void;
  /** Called when a block's live text had to be replaced with the server's because two edits could not be reconciled. */
  reset(blockId: string): void;
};

type Entry = { client: SyncClient; confirmed: string; screen: string; token: string; sentAt: number };

/**
 * Keeps the text of several blocks in step with the server while people type. One `SyncClient` per block, joined when the block is first
 * focused or first heard about. It does no rendering: it asks `hooks` for the text on screen and tells it what to show. All of the
 * server's news about a block (others' edits and the confirmation of this tab's own) must reach `handle` in the order the server sent it.
 */
export class LiveTextEngine {
  private readonly entries = new Map<string, Entry>();
  private readonly joining = new Map<string, TextEvent[]>();
  private readonly unusable = new Set<string>();
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>();
  private generation = 0;
  private stopped = false;

  private readonly tab: string;
  private readonly transport: LiveTransport;
  private readonly hooks: LiveHooks;
  private readonly retryMs: number;
  private readonly patienceMs: number;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  /** `patienceMs`: how long typed text may wait for the server's confirmation before the block is reconciled from scratch (a lost message must never strand it). */
  constructor(tab: string, transport: LiveTransport, hooks: LiveHooks, retryMs = 1500, patienceMs = 8000) { this.tab = tab; this.transport = transport; this.hooks = hooks; this.retryMs = retryMs; this.patienceMs = patienceMs; }

  /** True while any typed text is still waiting to be confirmed by the server. */
  get unsettled() { return [...this.entries.values()].some((entry) => !entry.client.settled); }

  has(blockId: string) { return this.entries.has(blockId); }
  screen(blockId: string) { return this.entries.get(blockId)?.screen; }

  /**
   * Starts live editing of a block (call when it gets focus). Safe to call repeatedly. When the text on screen has edits the server
   * has never seen (a draft restored from an earlier visit), pass what the server's text was when they were started (`base`) and the
   * edited text (`mine`), so they are merged into the current text instead of being replaced by it.
   */
  async join(blockId: string, known?: { base: string; mine: string }) {
    if (this.stopped || this.entries.has(blockId) || this.joining.has(blockId) || this.unusable.has(blockId)) return;
    const queued: TextEvent[] = []; this.joining.set(blockId, queued);
    const before = known?.base ?? this.hooks.readText(blockId) ?? '';
    let served: { text: string; revision: number };
    try { served = await this.transport.get(blockId); }
    catch (error) { this.joining.delete(blockId); if (typeof error === 'object' && error && 'status' in error && ((error as { status: number }).status === 409 || (error as { status: number }).status === 404)) this.unusable.add(blockId); return; }
    if (this.stopped) return;
    const now = this.hooks.readText(blockId) ?? known?.mine ?? before; // may have been typed in meanwhile, the old way
    const text = before === served.text ? now : before === now ? served.text : mergeText(before, now, served.text) ?? served.text;
    this.start(blockId, served, text);
    this.joining.delete(blockId);
    for (const event of queued) if (event.revision > served.revision) this.handle(event);
  }

  /** Call for every change typed in a block. Returns false when the block is not live, so the caller can save the old way. */
  edit(blockId: string, text: string): boolean {
    const entry = this.entries.get(blockId);
    if (!entry) return false;
    const operation = fromChange(entry.screen, text);
    entry.screen = text;
    if (operation.every((part) => typeof part === 'number' && part > 0)) return true; // nothing actually changed
    const send = entry.client.local(operation);
    if (send) this.send(blockId, entry, send);
    this.hooks.changed();
    return true;
  }

  /** Call for each `text` event from the stream, in order. */
  handle(event: TextEvent) {
    const waiting = this.joining.get(event.blockId);
    if (waiting) { waiting.push(event); return; }
    const entry = this.entries.get(event.blockId);
    if (!entry) { if (this.unusable.has(event.blockId)) return; void this.join(event.blockId); this.joining.get(event.blockId)?.push(event); return; }
    if (event.revision <= entry.client.revision) return; // already part of what was fetched
    if (event.revision !== entry.client.revision + 1) { void this.resync(event.blockId); return; } // missed something
    entry.confirmed = apply(event.operation, entry.confirmed);
    if (event.clientId === entry.token) {
      const next = entry.client.acknowledge();
      if (next) this.send(event.blockId, entry, next);
    } else {
      const forScreen = entry.client.remote(event.operation);
      entry.screen = apply(forScreen, entry.screen);
      this.hooks.writeText(event.blockId, entry.screen, forScreen);
    }
    this.hooks.changed();
  }

  /** After the stream was lost and came back: fetch every live block again and reconcile with what was typed meanwhile. */
  resyncAll() { for (const blockId of this.entries.keys()) void this.resync(blockId); }

  /** Forgets blocks that no longer exist. */
  prune(keep: ReadonlySet<string>) { for (const blockId of [...this.entries.keys()]) if (!keep.has(blockId)) this.entries.delete(blockId); this.hooks.changed(); }

  /** Forgets everything, e.g. when the whole document was replaced. Blocks join again as they are used. */
  clear() { this.entries.clear(); this.unusable.clear(); this.hooks.changed(); }

  stop() { this.stopped = true; if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null; for (const timer of this.retries.values()) clearTimeout(timer); this.retries.clear(); }

  private start(blockId: string, served: { text: string; revision: number }, shown: string) {
    const entry: Entry = { client: new SyncClient(served.revision), confirmed: served.text, screen: shown, token: `${this.tab}-${++this.generation}`, sentAt: Date.now() };
    this.entries.set(blockId, entry);
    if (!this.watchdog) { this.watchdog = setInterval(() => this.check(), Math.max(10, Math.floor(this.patienceMs / 2))); (this.watchdog as { unref?: () => void }).unref?.(); } // unref: never keeps a Node process alive
    if (shown !== served.text) { const operation = fromChange(served.text, shown); const send = entry.client.local(operation); if (send) this.send(blockId, entry, send); }
    if (shown !== (this.hooks.readText(blockId) ?? shown)) this.hooks.writeText(blockId, shown);
    this.hooks.changed();
  }

  private send(blockId: string, entry: Entry, operation: Operation) {
    entry.sentAt = Date.now();
    this.transport.post(blockId, { revision: entry.client.revision, operation, clientId: entry.token }).catch(() => this.later(blockId));
  }

  /** Typed text that has waited too long without a confirmation is reconciled with the server again. */
  private check() {
    const now = Date.now();
    for (const [blockId, entry] of this.entries) if (!entry.client.settled && now - entry.sentAt > this.patienceMs && !this.retries.has(blockId)) { entry.sentAt = now; void this.resync(blockId); }
  }

  private later(blockId: string) {
    if (this.stopped || this.retries.has(blockId)) return;
    this.retries.set(blockId, setTimeout(() => { this.retries.delete(blockId); void this.resync(blockId); }, this.retryMs));
  }

  /** Replaces a block's session with a fresh one from the server, keeping what was typed here by merging it in word by word. */
  private async resync(blockId: string) {
    const old = this.entries.get(blockId);
    if (!old || this.stopped) return;
    // An edit already sent may still be on its way to the server. Stop the server accepting it before looking at the text, so what is
    // fetched is final: it either contains that edit or never will, and the merge below can tell which.
    if (!old.client.settled) { try { await this.transport.fence(blockId, old.token); } catch { this.later(blockId); return; } }
    let served: { text: string; revision: number };
    try { served = await this.transport.get(blockId); } catch { this.later(blockId); return; }
    const current = this.entries.get(blockId);
    if (!current || current !== old) return;
    const mine = current.screen;
    const merged = current.confirmed === served.text ? mine : mergeText(current.confirmed, mine, served.text);
    if (merged === null) { this.start(blockId, served, served.text); this.hooks.writeText(blockId, served.text); this.hooks.reset(blockId); return; }
    this.start(blockId, served, merged);
    if (merged !== mine) this.hooks.writeText(blockId, merged);
  }
}
