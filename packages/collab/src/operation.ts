/**
 * An edit to a piece of text, written as a walk along all of it: a positive number keeps that many characters, a negative
 * number deletes that many, and a string inserts it. `[3, 'x', -2, 1]` keeps three characters, adds "x", removes two, keeps
 * the last one (so it needs text 6 characters long). Operations are kept in one canonical shape (neighbours of the same kind
 * merged, an insert before a delete), so equal edits compare equal.
 */
export type Operation = readonly (number | string)[];

const isRetain = (part: number | string): part is number => typeof part === 'number' && part > 0;
const isDelete = (part: number | string): part is number => typeof part === 'number' && part < 0;
const isInsert = (part: number | string): part is string => typeof part === 'string';

/** Builds an operation, folding neighbouring parts together. */
export class OperationBuilder {
  private readonly parts: (number | string)[] = [];

  retain(count: number): this {
    if (count <= 0) return this;
    const last = this.parts[this.parts.length - 1];
    if (typeof last === 'number' && last > 0) this.parts[this.parts.length - 1] = last + count; else this.parts.push(count);
    return this;
  }

  insert(text: string): this {
    if (!text) return this;
    const last = this.parts[this.parts.length - 1];
    const beforeLast = this.parts[this.parts.length - 2];
    if (isInsert(last)) this.parts[this.parts.length - 1] = last + text;
    else if (typeof last === 'number' && last < 0) {
      // an insert goes before a delete that is already there
      if (isInsert(beforeLast)) this.parts[this.parts.length - 2] = beforeLast + text; else this.parts.splice(this.parts.length - 1, 0, text);
    } else this.parts.push(text);
    return this;
  }

  delete(count: number): this {
    if (count <= 0) return this;
    const last = this.parts[this.parts.length - 1];
    if (typeof last === 'number' && last < 0) this.parts[this.parts.length - 1] = last - count; else this.parts.push(-count);
    return this;
  }

  build(): Operation { return this.parts.slice(); }
}

/** How long the text must be for the operation to apply. */
export function baseLength(operation: Operation): number {
  let length = 0;
  for (const part of operation) if (isRetain(part)) length += part; else if (isDelete(part)) length -= part;
  return length;
}

/** How long the text is after the operation. */
export function targetLength(operation: Operation): number {
  let length = 0;
  for (const part of operation) if (isRetain(part)) length += part; else if (isInsert(part)) length += part.length;
  return length;
}

export function apply(operation: Operation, text: string): string {
  if (baseLength(operation) !== text.length) throw new Error(`The operation is for text ${baseLength(operation)} characters long, not ${text.length}.`);
  let at = 0, out = '';
  for (const part of operation) {
    if (isRetain(part)) { out += text.slice(at, at + part); at += part; }
    else if (isInsert(part)) out += part;
    else at -= part;
  }
  return out;
}

/** The operation that turns `before` into `after`, treating everything between the shared start and end as one replacement. */
export function fromChange(before: string, after: string): Operation {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
  return new OperationBuilder().retain(start).insert(after.slice(start, after.length - end)).delete(before.length - start - end).retain(end).build();
}

/** One walker over an operation, able to take part of a component. */
class Cursor {
  private index = 0;
  private offset = 0;
  private readonly parts: Operation;
  constructor(parts: Operation) { this.parts = parts; }
  done() { return this.index >= this.parts.length; }
  peek() { return this.parts[this.index]; }
  /** Takes up to `max` of the current retain, delete or insert, returning what was taken. */
  take(max = Infinity): number | string {
    const part = this.parts[this.index];
    const size = typeof part === 'string' ? part.length : Math.abs(part);
    const take = Math.min(max, size - this.offset);
    const piece = typeof part === 'string' ? part.slice(this.offset, this.offset + take) : part > 0 ? take : -take;
    this.offset += take;
    if (this.offset >= size) { this.index += 1; this.offset = 0; }
    return piece;
  }
  remaining() { const part = this.parts[this.index]; return typeof part === 'string' ? part.length - this.offset : Math.abs(part) - this.offset; }
}

/**
 * Two edits made to the same text at the same time. Returns [a', b'] such that applying a then b' gives the same text as
 * applying b then a'. When both insert at the same spot, `a`'s text comes first. Both must start from text of the same length.
 */
export function transform(a: Operation, b: Operation): [Operation, Operation] {
  if (baseLength(a) !== baseLength(b)) throw new Error('The two operations start from texts of different lengths.');
  const left = new Cursor(a), right = new Cursor(b);
  const outA = new OperationBuilder(), outB = new OperationBuilder();
  while (!left.done() || !right.done()) {
    const x = left.peek(), y = right.peek();
    if (x !== undefined && isInsert(x)) { const text = left.take() as string; outA.insert(text); outB.retain(text.length); continue; }
    if (y !== undefined && isInsert(y)) { const text = right.take() as string; outA.retain(text.length); outB.insert(text); continue; }
    if (x === undefined || y === undefined) throw new Error('The two operations start from texts of different lengths.');
    const size = Math.min(left.remaining(), right.remaining());
    const px = left.take(size) as number, py = right.take(size) as number;
    if (px > 0 && py > 0) { outA.retain(size); outB.retain(size); }
    else if (px < 0 && py < 0) { /* both removed it */ }
    else if (px < 0) outA.delete(size);
    else outB.delete(size);
  }
  return [outA.build(), outB.build()];
}

/** One operation equal to doing `a` and then `b`. */
export function compose(a: Operation, b: Operation): Operation {
  if (targetLength(a) !== baseLength(b)) throw new Error('The second operation does not start where the first one ends.');
  const left = new Cursor(a), right = new Cursor(b);
  const out = new OperationBuilder();
  while (!left.done() || !right.done()) {
    const x = left.peek(), y = right.peek();
    if (x !== undefined && isDelete(x)) { out.delete(-(left.take() as number)); continue; }
    if (y !== undefined && isInsert(y)) { out.insert(right.take() as string); continue; }
    if (x === undefined || y === undefined) throw new Error('The operations do not line up.');
    const size = Math.min(left.remaining(), right.remaining());
    const px = left.take(size), py = right.take(size) as number;
    if (isInsert(px)) { if (py > 0) out.insert(px); /* inserted then deleted: nothing remains */ }
    else if (py > 0) out.retain(size);
    else out.delete(size);
  }
  return out.build();
}

/**
 * Where a position in the old text sits after the operation, for carets and selections. A position exactly where text is
 * inserted stays before it unless `pushPast` is set (use that for the caret of the person who typed the insert).
 */
export function transformPosition(operation: Operation, position: number, pushPast = false): number {
  let at = 0, result = position;
  for (const part of operation) {
    if (isInsert(part)) { if (at < position || (at === position && pushPast)) result += part.length; continue; }
    if (isRetain(part)) { at += part; continue; }
    const removed = -part;
    if (at + removed <= position) result -= removed; else if (at < position) result -= position - at;
    at += removed;
  }
  return result;
}
