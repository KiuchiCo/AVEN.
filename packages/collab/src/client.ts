import { compose, transform, transformPosition, type Operation } from './operation.ts';

/**
 * One person's side of editing a shared text. The server decides the order of everyone's edits. This keeps at most one edit
 * "in flight" (sent, not yet confirmed) and folds anything typed meanwhile into one buffered edit, so the server only ever
 * sees one pending edit per person. It does no I/O: the caller sends what these methods return and feeds back what arrives.
 */
export class SyncClient {
  /** How many of the server's edits this client has taken in; sent along with each edit so the server knows what it was written against. */
  revision: number;
  private inFlight: Operation | null = null;
  private buffer: Operation | null = null;

  constructor(revision = 0) { this.revision = revision; }

  /** True when nothing typed here is waiting for the server. */
  get settled() { return this.inFlight === null; }

  /** The edit still waiting for the server's confirmation, if any. */
  get pending(): Operation | null { return this.inFlight; }

  /** Call for every change made here. Returns the edit to send now, or null when one is already in flight (this one is held back). */
  local(operation: Operation): Operation | null {
    if (this.inFlight === null) { this.inFlight = operation; return operation; }
    this.buffer = this.buffer ? compose(this.buffer, operation) : operation;
    return null;
  }

  /** Call when the server's edit from someone else arrives. Returns the edit to apply to what is on screen. */
  remote(operation: Operation): Operation {
    this.revision += 1;
    if (this.inFlight === null) return operation;
    const [theirs, mineInFlight] = transform(operation, this.inFlight);
    this.inFlight = mineInFlight;
    if (this.buffer === null) return theirs;
    const [onScreen, mineBuffered] = transform(theirs, this.buffer);
    this.buffer = mineBuffered;
    return onScreen;
  }

  /** Call when the server confirms the edit that was in flight. Returns the next edit to send, if one was held back. */
  acknowledge(): Operation | null {
    if (this.inFlight === null) throw new Error('The server confirmed an edit that was never sent.');
    this.revision += 1;
    this.inFlight = this.buffer;
    this.buffer = null;
    return this.inFlight;
  }

  /** Where another person's caret, given in the text as the server last confirmed it, sits in what is on screen now. */
  position(position: number): number {
    let moved = position;
    if (this.inFlight) moved = transformPosition(this.inFlight, moved);
    if (this.buffer) moved = transformPosition(this.buffer, moved);
    return moved;
  }
}
