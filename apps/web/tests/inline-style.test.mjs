import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStyle, cellsOf, restyle, setValue, styleAt, styledRuns, toggleFlag, visibleText, wordAt, writeCells } from '../app/workspace/documents/[documentId]/inline-style.ts';
import { clearSelectionFormatting, inlineRanges, setColour, toggleMark } from '../app/workspace/documents/[documentId]/editor-model.ts';

const S = 'Welcome to AVEN. Your entire world, organised.';

test('font and size apply to the selected words only, so one paragraph can mix them', () => {
  const a = setValue(S, 0, 15, 'font', 'serif'); assert.equal(a.text, '{font-serif:Welcome to AVEN}. Your entire world, organised.');
  const b = setValue(a.text, a.start, a.end, 'size', 30); assert.equal(b.text, '{font-serif,size-30:Welcome to AVEN}. Your entire world, organised.');
  const runs = styledRuns(b.text);
  assert.deepEqual(runs.map((r) => r.text), ['Welcome to AVEN', '. Your entire world, organised.']);
  assert.deepEqual(runs[0].style, { font: 'serif', size: 30 }); assert.deepEqual(runs[1].style, {});
  const c = setValue(b.text, b.text.indexOf('world'), b.text.indexOf('world') + 5, 'size', 12);
  assert.equal(styledRuns(c.text).filter((r) => r.style.size).length, 2);
  assert.equal(visibleText(c.text), S);
});

test('colour, bold, italic, underline, highlight, font and size combine and survive each other', () => {
  let t = 'hello brave world'; const [a, b] = [6, 11];
  let r = toggleFlag(t, a, b, 'bold'); t = r.text;
  r = setValue(t, r.start, r.end, 'tone', 'red'); t = r.text;
  r = toggleFlag(t, r.start, r.end, 'italic'); t = r.text;
  r = toggleFlag(t, r.start, r.end, 'underline'); t = r.text;
  r = setValue(t, r.start, r.end, 'bg', 'blue'); t = r.text;
  r = setValue(t, r.start, r.end, 'size', 24); t = r.text;
  const s = styleAt(t, r.start, r.end);
  assert.deepEqual(s, { bold: true, italic: true, underline: true, tone: 'red', bg: 'blue', size: 24 });
  assert.equal(visibleText(t), 'hello brave world');
  // taking one away keeps every other attribute
  r = toggleFlag(t, r.start, r.end, 'bold'); assert.deepEqual(styleAt(r.text, r.start, r.end), { italic: true, underline: true, tone: 'red', bg: 'blue', size: 24 });
  r = setValue(r.text, r.start, r.end, 'tone', null); assert.deepEqual(styleAt(r.text, r.start, r.end), { italic: true, underline: true, bg: 'blue', size: 24 });
  r = setValue(r.text, r.start, r.end, 'size', null); assert.deepEqual(styleAt(r.text, r.start, r.end), { italic: true, underline: true, bg: 'blue' });
});

test('the written text reads back to the same styles (round trip)', () => {
  const samples = ['plain', '**b** *i* ***bi*** ~~s~~ ++u++ ==h== `c` [l](https://a.test)', '{red:**x**} and **{blue:y}**', '{size-20:big **bold {red:red}** end}', '[{red,size-18:link}](https://a.test)', 'a {font-mono,size-9:mono}\nb *two*'];
  for (const text of samples) {
    const again = writeCells(cellsOf(text)).text;
    assert.deepEqual(styledRuns(again), styledRuns(text), text);
  }
});

test('spaces at the edge of an underline stay outside it and the words stay', () => {
  const r = toggleFlag('one two three', 3, 8, 'underline'); // " two "
  assert.equal(visibleText(r.text), 'one two three');
  assert.equal(styledRuns(r.text).filter((run) => run.style.underline).map((run) => run.text).join(''), 'two');
});

test('clear formatting removes everything on the selection and nothing outside it, links stay', () => {
  const text = '**bold** and {red,size-20:big} and [site](https://a.test) end';
  const sel = [0, text.length];
  const cleared = clearStyle(text, sel[0], sel[1]);
  assert.equal(visibleText(cleared.text), 'bold and big and site end');
  assert.deepEqual(styledRuns(cleared.text).filter((r) => Object.keys(r.style).length).map((r) => r.style), [{ href: 'https://a.test' }]);
  const partial = clearStyle('**one two three**', 6, 9); // "two" with markers offset
  assert.equal(visibleText(partial.text), 'one two three');
  const runs = styledRuns(partial.text); assert.deepEqual(runs.map((r) => [r.text, !!r.style.bold]), [['one ', true], ['two', false], [' three', true]]);
});

test('a caret clears just the word it is in; nothing happens between words', () => {
  const text = '**one** **two**';
  const out = clearSelectionFormatting(text, 11, 11);
  assert.deepEqual(styledRuns(out.text).map((r) => [r.text, !!r.style.bold]), [['one', true], [' two', false]]);
  assert.equal(wordAt('a  b', 2), null);
});

test('colour no longer removes bold or italic, and bold no longer removes colour', () => {
  const bold = toggleMark('make this red', 5, 9, 'bold');
  const red = setColour(bold.text, bold.start, bold.end, 'red');
  assert.deepEqual(styleAt(red.text, red.start, red.end), { bold: true, tone: 'red' });
  const again = toggleMark(red.text, red.start, red.end, 'bold');
  assert.deepEqual(styleAt(again.text, again.start, again.end), { tone: 'red' });
  const plain = setColour(red.text, red.start, red.end, null);
  assert.deepEqual(styleAt(plain.text, plain.start, plain.end), { bold: true });
});

test('old documents read the same: single colours, bold, and unknown braces stay as written', () => {
  assert.deepEqual(styledRuns('a {red:warm} b {nope:x}').map((r) => r.text), ['a ', 'warm', ' b {nope:x}']);
  assert.equal(styledRuns('a {red:warm} b')[1].style.tone, 'red');
  assert.equal(visibleText('{size-3:x}'), '{size-3:x}'); // out-of-range size is not a span
});

test('decoration ranges cover nested styles', () => {
  const kinds = inlineRanges('{red,size-20:a **b**}').filter((r) => r.kind !== 'mark').map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['bold', 'colour', 'size']);
});

test('restyle with a collapsed selection does nothing', () => { assert.equal(restyle('abc', 1, 1, (s) => s), null); });

test('security: hostile formatting text is read in bounded time without overflowing the stack', () => {
  const N = 100_000;
  const cases = { 'unclosed spans': '{red,bg-blue:'.repeat(N / 13), 'unclosed links': '[a](b'.repeat(N / 5), 'nested spans': '{red:'.repeat(5000) + 'x' + '}'.repeat(5000), 'one long unclosed span': `{red:${'a'.repeat(N)}` };
  for (const [name, text] of Object.entries(cases)) {
    const started = Date.now();
    const cells = cellsOf(text);
    assert.ok(Date.now() - started < 1200, `${name} took ${Date.now() - started} ms`);
    assert.ok(cells.length > 0, name);
  }
  assert.equal(visibleText('{red:ok}'), 'ok');
});
