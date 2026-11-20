import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { Decorations, baseExtensions, emptyLive } from '../app/workspace/documents/[documentId]/editor-extensions.ts';
import { blocksToDoc } from '../app/workspace/documents/[documentId]/editor-convert.ts';
import { normalizeBlock } from '../app/workspace/documents/[documentId]/editor-model.ts';

const schema = getSchema(baseExtensions);
const b = (id, text, type = 'PARAGRAPH', extra = {}) => normalizeBlock({ id, type, text, ...extra });

/** The decorations the editor would draw for these blocks and live state, as plain descriptions. */
function drawn(blocks, patch = {}) {
  const live = { ...emptyLive(), ...patch };
  const plugin = Decorations.config.addProseMirrorPlugins.call({ options: { live: () => live } })[0];
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(blocksToDoc('Title', blocks)), plugins: [plugin] });
  return plugin.props.decorations.call(plugin, state).find().map((d) => ({ from: d.from, to: d.to, cls: d.type.attrs?.class ?? '', attrs: d.type.attrs ?? {}, widget: !d.type.attrs && Boolean(d.type.toDOM) }));
}

test("another person's presence marks their block, and their caret is drawn at the right place in the text", () => {
  const out = drawn([b('a', 'hello world'), b('c', 'two')], { others: { a: { name: 'Sam', colour: '#6B5746' } }, cursors: { a: [{ userId: 'u', name: 'Sam', start: 5, end: 5, colour: '#6B5746' }] } });
  assert.ok(out.some((d) => d.cls.includes('has-others') && d.attrs['data-others'] === 'Sam'));
  assert.equal(out.filter((d) => d.widget).length, 1);
  assert.ok(!out.some((d) => d.attrs['data-others'] && d.cls.includes('has-others') && d.from > 20), 'only the block they are in');
});

test('find matches, picked blocks, folded content and colours each get their own marking', () => {
  const blocks = [b('t', 'Toggle', 'TOGGLE'), b('k', 'inside needle', 'PARAGRAPH', { indent: 1 }), b('z', 'a {red:warm} word')];
  const out = drawn(blocks, { find: { query: 'needle', current: 0 }, picked: new Set(['z']), folded: new Set(['t']) });
  assert.ok(out.some((d) => d.cls.includes('aven-find--current')), 'the current match');
  assert.ok(out.some((d) => d.cls.includes('is-picked')), 'the picked block');
  assert.ok(out.filter((d) => d.cls.includes('is-folded')).length === 1, 'only the content of the closed toggle');
  assert.ok(out.some((d) => d.cls.includes('md-c-red')), 'the colour');
});
