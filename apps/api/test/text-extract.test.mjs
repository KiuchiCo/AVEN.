import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KNOWLEDGE_TEXT_LIMIT, extractText, htmlToText, titleFromFileName } from '../dist/files/text-extract.js';

const buf = (s) => Buffer.from(s, 'utf8');
test('plain text, markdown and csv are read as they are, with tidy line endings', () => {
  assert.deepEqual(extractText('notes.md', 'text/markdown', buf('﻿# Title\r\n\r\n\r\n\r\nBody  \r\n')), { text: '# Title\n\nBody', truncated: false });
  assert.equal(extractText('data.csv', 'application/octet-stream', buf('a,b\n1,2')).text, 'a,b\n1,2');
});
test('json is pretty-printed, and invalid json is kept as written', () => {
  assert.equal(extractText('x.json', 'application/json', buf('{"a":[1,2]}')).text, '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(extractText('x.json', 'application/json', buf('{oops')).text, '{oops');
});
test('html becomes text without scripts, styles or tags', () => {
  const text = extractText('page.html', 'text/html', buf('<style>p{}</style><h1>Hi &amp; bye</h1><p>One<br>Two</p><script>alert(1)</script><!-- c -->')).text;
  assert.equal(text.includes('alert'), false); assert.equal(text.includes('<'), false);
  assert.match(text, /Hi & bye/); assert.match(text, /One\s+Two/);
  assert.equal(htmlToText('a&lt;b'), 'a<b');
});
test('binary, unsupported and empty files are refused with a clear reason', () => {
  assert.throws(() => extractText('report.pdf', 'application/pdf', buf('%PDF')), /can read text files/);
  assert.throws(() => extractText('x.txt', 'text/plain', Buffer.from([65, 0, 66])), /binary/);
  assert.throws(() => extractText('x.txt', 'text/plain', buf('  \n ')), /no readable text/);
});
test('long text is cut to what a Knowledge entry holds and flagged', () => {
  const result = extractText('long.txt', 'text/plain', buf('word '.repeat(10_000)));
  assert.equal(result.truncated, true); assert.ok(result.text.length <= KNOWLEDGE_TEXT_LIMIT);
});
test('titles come from file names', () => {
  assert.equal(titleFromFileName('Quarterly_plan.v2.md'), 'Quarterly plan.v2'); assert.equal(titleFromFileName('.env'), '.env'); assert.equal(titleFromFileName('x'.repeat(300)).length, 200);
});

import { deflateRawSync } from 'node:zlib';
/** Builds a minimal zip (CRC left as zero: the reader doesn't check it). */
function zip(files) {
  const locals = []; const central = []; let offset = 0;
  for (const [name, content, stored] of files) {
    const raw = Buffer.from(content); const data = stored ? raw : deflateRawSync(raw); const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(stored ? 0 : 8, 10); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    locals.push(local, n, data); central.push(head, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('word documents give their paragraphs, tabs and entities', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Plan &amp; scope</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">A </w:t></w:r><w:r><w:t>B</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>C</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(extractText('Spec.docx', 'application/octet-stream', zip([['word/document.xml', xml]])).text, 'Plan & scope\nA B\nC');
});
test('powerpoint slides are read in order', () => {
  const slide = (t) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
  const text = extractText('d.pptx', '', zip([['ppt/slides/slide10.xml', slide('Ten')], ['ppt/slides/slide2.xml', slide('Two')], ['ppt/slides/slide1.xml', slide('One')]], true)).text;
  assert.equal(text, 'Slide 1\nOne\n\nSlide 2\nTwo\n\nSlide 3\nTen');
});
test('excel sheets give shared strings, inline text and numbers by column', () => {
  const shared = '<sst><si><t>Name</t></si><si><r><t>Qty</t></r></si><si><t>Pens</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>x</t></is></c><c r="C2"><v>12</v></c></row></sheetData></worksheet>';
  assert.equal(extractText('s.xlsx', '', zip([['xl/sharedStrings.xml', shared, true], ['xl/worksheets/sheet1.xml', sheet]])).text, 'Sheet 1\nName\t\tQty\nPens\tx\t12');
});
test('damaged or non-zip office files are refused with a clear reason', () => {
  assert.throws(() => extractText('x.docx', '', Buffer.from('not a zip')), /couldn’t be read/);
  assert.throws(() => extractText('x.docx', '', zip([['other.xml', '<a/>']])), /couldn’t be read/);
  assert.throws(() => extractText('x.xlsx', '', zip([['xl/worksheets/sheet1.xml', '<worksheet></worksheet>']])), /no readable text/);
});
