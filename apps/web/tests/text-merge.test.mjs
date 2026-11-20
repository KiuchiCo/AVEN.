import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeBlocks, mergeText, moveCaret } from '../app/workspace/documents/[documentId]/block-merge.ts';

const base = 'The quick brown fox jumps over the lazy dog.';

test('edits to different words in one block both survive', () => {
  assert.equal(mergeText(base, 'The quick red fox jumps over the lazy dog.', 'The quick brown fox jumps over the sleepy dog.'), 'The quick red fox jumps over the sleepy dog.');
  assert.equal(mergeText(base, `Note: ${base}`, base.replace('.', ' today.')), `Note: ${base.replace('.', ' today.')}`);
});

test('one side unchanged, or both made the identical edit, is not a conflict', () => {
  assert.equal(mergeText(base, base, 'The quick brown cat jumps over the lazy dog.'), 'The quick brown cat jumps over the lazy dog.');
  assert.equal(mergeText(base, 'The quick brown cat jumps over the lazy dog.', 'The quick brown cat jumps over the lazy dog.'), 'The quick brown cat jumps over the lazy dog.');
  const same = 'The quick brown fox jumps over the lazy cat.';
  assert.equal(mergeText(base, same, same), same);
});

test('overlapping edits of the same words are a conflict', () => {
  assert.equal(mergeText(base, 'The quick red fox jumps over the lazy dog.', 'The quick black fox jumps over the lazy dog.'), null);
  assert.equal(mergeText('a b c', 'a X c', 'a Y c'), null);
  assert.equal(mergeText('ab', 'ab one', 'ab two'), null, 'both typing at the same spot');
  assert.equal(mergeText('one two three', 'one three', 'one TWO three'), null, 'one deleted what the other changed');
});

test('insertions and deletions in separate places combine, including at the very start and end', () => {
  assert.equal(mergeText('one two three four', 'zero one two three four', 'one two three four five'), 'zero one two three four five');
  assert.equal(mergeText('one two three four', 'one three four', 'one two three'), 'one three');
  assert.equal(mergeText('', 'mine', ''), 'mine'); assert.equal(mergeText('', '', 'theirs'), 'theirs');
  assert.equal(mergeText('héllo wörld 日本語 end', 'héllo wörld 日本語 finish', 'HÉLLO wörld 日本語 end'), 'HÉLLO wörld 日本語 finish');
});

test('the merge keeps every unrelated word, whatever the order of edits (random check)', () => {
  const words = Array.from({ length: 40 }, (_, i) => `w${i}`);
  let seed = 7; const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let round = 0; round < 200; round += 1) {
    const a = words.slice(), b = words.slice();
    const i = rand(20), j = 20 + rand(20);
    a[i] = `mine${round}`; b[j] = `theirs${round}`;
    const merged = mergeText(words.join(' '), a.join(' '), b.join(' '));
    const expected = words.slice(); expected[i] = `mine${round}`; expected[j] = `theirs${round}`;
    assert.equal(merged, expected.join(' '));
    assert.equal(mergeText(words.join(' '), b.join(' '), a.join(' ')), expected.join(' '), 'same result from the other side');
  }
});

test('a cursor stays among the same words when text changes around it', () => {
  const before = 'alpha beta gamma';
  assert.equal(moveCaret(before, 'NEW alpha beta gamma', 11), 15, 'text inserted before the cursor pushes it along');
  assert.equal(moveCaret(before, 'alpha beta gamma delta', 11), 11, 'text after the cursor leaves it alone');
  assert.equal(moveCaret(before, 'alpha beta gamma', 5), 5);
  assert.equal(moveCaret(before, 'alpha gamma', 8), 6, 'the cursor in a deleted word goes to where it was');
  assert.equal(moveCaret(before, 'alpha BETA gamma', 6), 6, 'a cursor right before a replaced word stays before it');
  assert.equal(moveCaret(before, '', 5), 0);
});

test('blocks: text edits merge, a checkbox and a text edit merge, and real clashes still report a conflict', () => {
  const todo = (text, checked = false) => ({ id: 'a', type: 'TODO', text, checked });
  const result = mergeBlocks([todo('buy milk and eggs')], [todo('buy oat milk and eggs')], [todo('buy milk and free-range eggs')]);
  assert.deepEqual(result.conflicts, []); assert.equal(result.blocks[0].text, 'buy oat milk and free-range eggs');
  const toggled = mergeBlocks([todo('buy milk')], [todo('buy milk', true)], [todo('buy milk today')]);
  assert.deepEqual(toggled.conflicts, []); assert.deepEqual(toggled.blocks[0], todo('buy milk today', true));
  const clash = mergeBlocks([todo('buy milk')], [todo('buy oat')], [todo('buy soy')]);
  assert.deepEqual(clash.conflicts, ['a']);
  const typeClash = mergeBlocks([{ id: 'a', type: 'PARAGRAPH', text: 'x' }], [{ id: 'a', type: 'HEADING_1', text: 'x' }], [{ id: 'a', type: 'QUOTE', text: 'x' }]);
  assert.deepEqual(typeClash.conflicts, ['a']);
});
