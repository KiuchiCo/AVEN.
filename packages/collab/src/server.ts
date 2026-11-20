import { apply, baseLength, transform, transformPosition, type Operation } from './operation.ts';

/**
 * The authoritative copy of one shared text. Every edit is written against some revision; if others were accepted since, the edit is
 * moved past them first, so everyone ends with the same text. No I/O: the caller delivers what `receive` returns to every client.
 */
export class SyncDocument {
  text: string;
  /** The accepted edits, oldest first, starting at revision `first`. */
  private history: Operation[] = [];
  private first = 0;

  constructor(text = '', revision = 0) { this.text = text; this.first = revision; }

  /** The number of edits accepted so far (counting from the revision this document was created at). */
  get revision() { return this.first + this.history.length; }

  /**
   * Accepts an edit written against `revision`. Returns the edit as it was actually applied (to send to everyone else, and to the
   * author as the confirmation). Throws when the edit can't be made sense of: from the future, from before the kept history, or
   * not matching the text it claims to start from.
   */
  receive(revision: number, operation: Operation): { operation: Operation; revision: number } {
    if (!Number.isInteger(revision) || revision > this.revision) throw new Error('The edit is from a revision this document has not reached.');
    if (revision < this.first) throw new Error('The edit is older than the history that is kept; reload the text and try again.');
    let current = operation;
    for (let index = revision - this.first; index < this.history.length; index += 1) {
      if (baseLength(current) !== baseLength(this.history[index])) throw new Error('The edit does not match the text it was written against.');
      current = transform(this.history[index], current)[1];
    }
    this.text = apply(current, this.text); // throws if it still does not fit
    this.history.push(current);
    return { operation: current, revision: this.revision };
  }

  /**
   * Where a position given in the text as it was at `fromRevision` sits now, or null when that revision is no longer kept (or not
   * reached yet). For carets: a person reports where their caret is in the text they last saw.
   */
  rebase(position: number, fromRevision: number): number | null {
    if (!Number.isInteger(fromRevision) || fromRevision > this.revision || fromRevision < this.first) return null;
    let moved = position;
    for (let index = fromRevision - this.first; index < this.history.length; index += 1) moved = transformPosition(this.history[index], moved);
    return moved;
  }

  /** Forgets edits older than `revision` (when every connected client has moved past it). Later edits written against older ones are refused. */
  forgetBefore(revision: number) {
    const drop = Math.min(Math.max(0, revision - this.first), this.history.length);
    this.history = this.history.slice(drop); this.first += drop;
  }
}
