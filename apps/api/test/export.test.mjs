import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { buildExportDocument, contentDisposition, exportFilename, parseBlocks } from '../dist/export/document-model.js';
import { renderDocx } from '../dist/export/docx.js';
import { renderPdf } from '../dist/export/pdf.js';
import { parseRuns } from '../dist/export/inline.js';
import { publicBlocks } from '../dist/sharing/share-rules.js';

const ID = '11111111-1111-4111-8111-111111111111';
const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#A48766' } }).png().toBuffer();
const none = { image: async () => null, file: async () => null, database: async () => null, page: async () => null };
const rich = { image: async () => ({ data: png, mime: 'image/png', width: 300, height: 200 }), file: async () => ({ name: 'report.pdf' }), page: async () => ({ title: 'Roadmap' }),
  database: async () => ({ name: 'Roadmap DB', properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 's', name: 'Status', type: 'status' }], records: [{ values: { name: 'A', s: 'Done' } }, { values: { name: 'B', s: 'Open' } }, { values: { name: 'C', s: 'Done' } }] }) };
const b = (type, text, extra = {}) => ({ type, text, ...extra });
const build = (blocks, resolver = rich, title = 'Plan') => buildExportDocument({ title, content: JSON.stringify({ format: 'aven-doc-v1', blocks }), updatedAt: new Date('2026-11-21') }, resolver);

test('inline marks become runs: bold, italic, underline, colour, highlight, code and only safe links', () => {
  const runs = parseRuns('a **b** *i* ++u++ {red:r} {bg-blue:h} `c` [ok](https://x.io) [bad](javascript:alert(1)) C++ and C++');
  assert.deepEqual(runs.filter((run) => run.bold || run.italic || run.underline || run.colour || run.highlight || run.code || run.href).map((run) => run.text), ['b', 'i', 'u', 'r', 'h', 'c', 'ok']);
  assert.equal(runs.find((run) => run.href).href, 'https://x.io');
  assert.ok(runs.map((run) => run.text).join('').includes('[bad](javascript:alert(1))'), 'an unsafe link stays plain text');
  assert.ok(runs.map((run) => run.text).join('').endsWith('C++ and C++'));
});

test('every block type is exported or shows a visible fallback; nothing disappears silently', async () => {
  const doc = await build([b('HEADING_1', 'T'), b('BULLET', 'x'), b('NUMBERED', 'n'), b('TODO', 't', { checked: true }), b('QUOTE', 'q'), b('CALLOUT', 'c'), b('CODE', 'a\nb'), b('DIVIDER', ''), b('TABLE', '', { rows: [['a', 'b']] }),
    b('IMAGE', 'cap', { fileId: ID }), b('EQUATION', 'x^2'), b('MERMAID', 'graph TD;'), b('FILE', '', { fileId: ID }), b('PAGE_LINK', '', { docId: ID }), b('DATABASE', '', { databaseId: ID, view: 'TABLE' }), b('DATABASE', '', { databaseId: ID, view: 'DONUT' }),
    b('BOOKMARK', 'site', { url: 'https://example.com' }), b('BUTTON', 'Go'), b('MYSTERY', 'some words'), b('MYSTERY', '')]);
  const kinds = doc.nodes.map((node) => node.kind);
  for (const kind of ['heading', 'item', 'quote', 'callout', 'code', 'divider', 'table', 'image', 'equation', 'note', 'paragraph']) assert.ok(kinds.includes(kind), kind);
  assert.ok(doc.nodes.some((node) => node.kind === 'note' && node.text === '(mystery block)'), 'an unknown empty block says it is there');
  assert.ok(doc.nodes.some((node) => node.kind === 'paragraph' && node.runs[0].text === 'some words'), 'an unknown block keeps its text');
  const donut = doc.nodes.find((node) => node.kind === 'table' && node.caption?.includes('by Status'));
  assert.deepEqual(donut.rows, [['Status', 'Records'], ['Done', '2'], ['Open', '1']]);
});

test('what a reader may not see becomes a visible fallback, never the private content', async () => {
  const doc = await build([b('FILE', '', { fileId: ID }), b('PAGE_LINK', '', { docId: ID }), b('DATABASE', '', { databaseId: ID }), b('IMAGE', 'cap', { fileId: ID })], none);
  assert.deepEqual(doc.nodes.map((node) => node.kind), ['note', 'note', 'note', 'note']);
  assert.ok(doc.nodes.every((node) => !JSON.stringify(node).includes('report.pdf') && !JSON.stringify(node).includes('Roadmap')));
});

test('toggles, tabs and meeting notes export their content in order, old and new storage alike', async () => {
  const doc = await build([b('TOGGLE', 'More', { body: 'old line' }), b('TABS', '', { tabs: [{ title: 'Plan' }, { title: 'Notes' }] }), b('PARAGRAPH', 'p0', { indent: 1, tab: 0 }), b('PARAGRAPH', 'p1', { indent: 1, tab: 1 }), b('MEETING', 'Sync', { date: '2026-11-21', attendees: 'Ann' }), b('TODO', 'act', { indent: 1 }), b('TOC', ''), b('HEADING_2', 'Late heading')]);
  const text = doc.nodes.map((node) => (node.runs ? node.runs.map((run) => run.text).join('') : node.text ?? '')).join('|');
  assert.ok(text.indexOf('More') < text.indexOf('old line') && text.indexOf('Plan') < text.indexOf('p0') && text.indexOf('Notes') < text.indexOf('p1'));
  assert.ok(text.includes('Date: 2026-11-21 · Attendees: Ann') && text.includes('Contents') && text.includes('Late heading'));
});

test('plain-text documents and empty documents export too', async () => {
  assert.equal(parseBlocks('first\n\nsecond').length, 2);
  const doc = await buildExportDocument({ title: '', content: '', updatedAt: new Date() }, none);
  assert.equal(doc.nodes.length, 0);
  assert.ok((await renderPdf(doc)).subarray(0, 5).toString() === '%PDF-');
});

test('filenames are safe on every system and the header carries the real name', () => {
  assert.equal(exportFilename('Plan / Q4: "draft"?', 'pdf'), 'AVEN - Plan Q4 draft.pdf');
  assert.equal(exportFilename('', 'docx'), 'AVEN - Untitled.docx');
  assert.equal(exportFilename('../../etc/passwd', 'pdf'), 'AVEN - etc passwd.pdf');
  assert.equal(exportFilename('x'.repeat(300), 'pdf').length, 'AVEN - .pdf'.length + 100);
  assert.equal(exportFilename('...hidden. ', 'pdf'), 'AVEN - hidden.pdf');
  const header = contentDisposition('AVEN - Café “plan”.pdf');
  assert.ok(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/.test(header)); assert.ok(header.includes('Caf%C3%A9'));
  assert.ok(!/[\r\n]/.test(contentDisposition('AVEN - a\r\nSet-Cookie: x.pdf')));
});

test('the Word file is a real .docx: valid package, real styles, lists, a table, an image, links and editable text', async () => {
  const doc = await build([b('HEADING_1', 'Launch & <plan>'), b('PARAGRAPH', 'See [site](https://example.com) and **bold**'), b('BULLET', 'one'), b('BULLET', 'two', { indent: 1 }), b('NUMBERED', 'step'), b('TABLE', '', { rows: [['a', 'b'], ['c', 'd']] }), b('IMAGE', 'cap', { fileId: ID }), b('CODE', 'let x = 1;')]);
  const file = await renderDocx(doc);
  assert.equal(file.subarray(0, 2).toString(), 'PK');
  const zip = unzipSync(new Uint8Array(file));
  for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', '_rels/.rels']) assert.ok(zip[part], part);
  assert.ok(Object.keys(zip).some((name) => name.startsWith('word/media/')), 'the image is embedded');
  const xml = strFromU8(zip['word/document.xml']);
  assert.ok(xml.includes('w:pStyle w:val="Heading1"') && xml.includes('Launch &amp; &lt;plan&gt;'), 'heading style, text escaped');
  assert.ok(xml.includes('<w:hyperlink') && xml.includes('<w:numPr>') && xml.includes('<w:tbl>') && xml.includes('<w:drawing>'));
  assert.ok(xml.includes('w:ascii="Consolas"') || strFromU8(zip['word/styles.xml']).length > 0);
  assert.ok(xml.includes('>bold<') && xml.includes('<w:b/>'));
  assert.ok(strFromU8(zip['word/_rels/document.xml.rels']).includes('https://example.com'));
});

test('the PDF is a real PDF: A4 pages, embedded fonts, an image, clickable links, page numbers; long documents run over several pages', async () => {
  const many = Array.from({ length: 80 }, (_, i) => b('PARAGRAPH', `Paragraph ${i} with a [link](https://example.com/${i}) and enough words to wrap onto a second line of the page, again and again, so the document is long.`));
  const doc = await build([b('HEADING_1', 'Long'), b('IMAGE', 'cap', { fileId: ID }), b('TABLE', '', { rows: [['a', 'b'], ['c', 'd']] }), b('CODE', Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n')), ...many]);
  const file = await renderPdf(doc);
  const raw = file.toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.') && raw.trimEnd().endsWith('%%EOF'));
  const pages = (raw.match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 4, `several pages (${pages})`);
  assert.ok(raw.includes('/MediaBox [0 0 595.28 841.89]'), 'A4');
  assert.ok(raw.includes('/FontFile2') || raw.includes('/FontFile3'), 'fonts are embedded');
  assert.ok(raw.includes('/Subtype /Image') && raw.includes('/URI (https://example.com/0)') && raw.includes('/Title'));
  const small = await renderPdf(await build([b('PARAGRAPH', 'Hi')]));
  assert.equal((small.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1);
});

test('request logs never contain the secret of a share link or an invitation', async () => {
  const { redactPath } = await import('../dist/common/request-logging.js');
  assert.equal(redactPath('/api/v1/shared/documents/abcSECRETtoken123/images/11111111-1111-4111-8111-111111111111'), '/api/v1/shared/documents/:token/images/11111111-1111-4111-8111-111111111111');
  assert.equal(redactPath('/api/v1/shared/documents/abcSECRETtoken123/export'), '/api/v1/shared/documents/:token/export');
  assert.equal(redactPath('/api/v1/invitations/inviteSECRET'), '/api/v1/invitations/:token');
  assert.equal(redactPath('/api/v1/workspaces/1/documents'), '/api/v1/workspaces/1/documents');
});

test('bold and italic together, and the layout an author set, reach the Word file, the PDF and the public view', async () => {
  assert.deepEqual(parseRuns('x ***both*** y').map((run) => [run.text, Boolean(run.bold), Boolean(run.italic)]), [['x ', false, false], ['both', true, true], [' y', false, false]]);
  const doc = await build([b('PARAGRAPH', 'Centred ***text***', { align: 'center', spacing: 2, font: 'serif', size: 20 }), b('HEADING_2', 'Right', { align: 'right' }), b('PARAGRAPH', 'bad', { align: 'sideways', spacing: 9, font: 'comic', size: 3 })]);
  assert.deepEqual(doc.nodes[0].layout, { align: 'center', spacing: 2, font: 'serif', size: 20 }); assert.deepEqual(doc.nodes[1].layout, { align: 'right' }); assert.equal(doc.nodes[2].layout, undefined, 'unusable values are dropped');
  const xml = strFromU8(unzipSync(new Uint8Array(await renderDocx(doc)))['word/document.xml']);
  assert.ok(xml.includes('<w:jc w:val="center"/>') && xml.includes('<w:jc w:val="right"/>'), 'alignment');
  assert.ok(xml.includes('w:line="480"') && xml.includes('<w:sz w:val="30"/>'), 'line spacing, and the editor\'s 20px as 15pt in half points');
  assert.ok(xml.includes('Georgia') && xml.includes('<w:b/>') && xml.includes('<w:i/>'));
  const pdf = await renderPdf(doc); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const shown = publicBlocks(JSON.stringify({ format: 'aven-doc-v1', blocks: [{ type: 'PARAGRAPH', text: 'a', align: 'center', size: 18 }, { type: 'CODE', text: 'c', align: 'center' }] }), () => '');
  assert.deepEqual(shown[0].layout, { align: 'center', size: 18 }); assert.equal(shown[1].layout, undefined, 'code keeps its own look');
});

test('inline styles nest: bold + colour + font + size in one run, and mixed fonts and sizes within one paragraph', () => {
  const runs = parseRuns('{font-serif,size-30:Welcome to AVEN}. Your **{red:entire}** world, {size-12:organised}.');
  assert.deepEqual(runs.map((run) => run.text), ['Welcome to AVEN', '. Your ', 'entire', ' world, ', 'organised', '.']);
  assert.deepEqual([runs[0].font, runs[0].size], ['serif', 30]);
  assert.ok(runs[2].bold && runs[2].colour === 'C0392B');
  assert.equal(runs[4].size, 12);
  assert.equal(parseRuns('{size-3:x}')[0].text, '{size-3:x}');
});

test('Word and PDF keep inline fonts, sizes and combined marks from the same text', async () => {
  const blocks = [b('PARAGRAPH', '{font-serif,size-32:Big serif} then **{red:bold red}** and {font-mono,size-10:small mono}')];
  const doc = await build(blocks);
  const xml = strFromU8(unzipSync(new Uint8Array(await renderDocx(doc)))['word/document.xml']);
  assert.ok(xml.includes('w:ascii="Georgia"') && xml.includes('<w:sz w:val="48"/>'), 'serif at 32px is 24pt');
  assert.ok(/<w:b\/>[\s\S]*?<w:color w:val="C0392B"\/>|<w:color w:val="C0392B"\/>[\s\S]*?<w:b\/>/.test(xml), 'bold and colour on the same run');
  assert.ok(xml.includes('w:ascii="Consolas"') && xml.includes('<w:sz w:val="15"/>'));
  assert.ok((await renderPdf(doc)).subarray(0, 5).toString() === '%PDF-');
});

test('security: hostile formatting text cannot make an export cost seconds or overflow the stack', () => {
  const N = 100_000;
  const cases = { 'thousands of unclosed spans': '{red,bg-blue:'.repeat(N / 13), 'thousands of unclosed links': '[a](b'.repeat(N / 5), 'five thousand nested spans': '{red:'.repeat(5000) + 'x' + '}'.repeat(5000), 'one long unclosed span': `{red:${'a'.repeat(N)}` };
  for (const [name, text] of Object.entries(cases)) {
    const started = Date.now(); const runs = parseRuns(text);
    assert.ok(Date.now() - started < 1200, `${name} took ${Date.now() - started} ms`);
    assert.equal(runs.map((run) => run.text).join('').length > 0, true, name);
  }
  assert.equal(parseRuns('{red:ok}')[0].colour, 'C0392B', 'ordinary spans still work');
  assert.equal(parseRuns('[a link](https://x.io)')[0].href, 'https://x.io', 'and ordinary links');
});
