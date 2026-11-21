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
  assert.throws(() => extractText('legacy.doc', 'application/msword', buf('x')), /can read text files/);
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

import { deflateRawSync, deflateSync } from 'node:zlib';
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

import { readFileSync } from 'node:fs';
import { pdfToText } from '../dist/files/pdf-text.js';

/** Builds a PDF from numbered objects. The reader scans objects, so no cross-reference table is needed. */
const pdf = (objects, trailer = '') => Buffer.concat([Buffer.from('%PDF-1.7\n'), ...Object.entries(objects).map(([id, body]) => Buffer.concat([Buffer.from(`${id} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from('\nendobj\n')])), Buffer.from(`trailer\n<< /Root 1 0 R ${trailer} >>\n%%EOF`)]);
const stream = (dict, content, compress = false) => { const data = compress ? deflateSync(Buffer.from(content)) : Buffer.from(content); return Buffer.concat([Buffer.from(`<< ${dict}${compress ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')]); };

test('a real macOS-made PDF is read, with accents and escaped parentheses', () => {
  const text = pdfToText(readFileSync(new URL('./fixtures/quartz-text.pdf', import.meta.url)));
  assert.match(text, /^Quarterly plan\n\nRevenue grew by 12 percent \(up from 9\)\. Ship the "Alpha" release/);
  assert.match(text, /ops@example\.com\.\nSecond line with accents: café déjà vu\.$/);
  assert.equal(extractText('plan.pdf', 'application/pdf', readFileSync(new URL('./fixtures/quartz-text.pdf', import.meta.url))).truncated, false);
});

test('pages come out in page-tree order, kerning gaps become spaces and Td moves start new lines', () => {
  const content = (text) => stream('', `BT /F1 12 Tf 72 700 Td [(Hel) 20 (lo) -300 (world)] TJ 0 -14 Td (${text}) Tj ET`);
  const file = pdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [4 0 R 3 0 R] /Count 2 /Resources << /Font << /F1 7 0 R >> >> >>',
    3: '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    4: '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
    5: content('second page'), 6: content('first page'),
    7: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  });
  assert.equal(pdfToText(file), 'Hello world\nfirst page\n\nHello world\nsecond page');
});

test('compressed streams, CID fonts with ToUnicode maps, and objects packed in object streams', () => {
  const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <0048> <0002> <00E9> endbfchar 1 beginbfrange <0003> <0005> <0061> endbfrange endcmap';
  // The page (object 5) and its font (object 6) live inside object stream 3; "object number offset" pairs come first.
  const page = '<< /Type /Page /Parent 2 0 R /Resources << /Font << /C1 6 0 R >> >> /Contents 4 0 R >>';
  const font = '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 7 0 R >>';
  const header = `5 0 6 ${page.length + 1} `;
  const objStm = stream(`/Type /ObjStm /N 2 /First ${header.length}`, `${header}${page} ${font}`, true);
  const file = pdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    3: objStm, 4: stream('', 'BT /C1 12 Tf <0001000200030004> Tj ET', true), 7: stream('', cmap, true),
  });
  assert.equal(pdfToText(file), 'Héab', 'codes 1 and 2 come from bfchar, 3 and 4 from the bfrange starting at "a"');
});

test('encrypted, non-PDF and image-only files are refused with a clear reason', () => {
  assert.throws(() => pdfToText(Buffer.from('hello')), /isn’t a PDF/);
  assert.throws(() => pdfToText(pdf({ 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 3: '<< /Type /Page /Parent 2 0 R >>' }, '/Encrypt 9 0 R')), /password-protected/);
  const scan = pdf({ 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 3: '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>', 4: stream('', 'q 612 0 0 792 0 0 cm /Im0 Do Q') });
  assert.throws(() => extractText('scan.pdf', 'application/pdf', scan), /no readable text in that PDF/);
});

test('security: many small parts that each unpack to the per-part cap are refused as a whole, not read one after another', () => {
  const zeros = (mb) => Buffer.alloc(mb * 1024 * 1024);
  const slides = Array.from({ length: 6 }, (_, i) => [`ppt/slides/slide${i + 1}.xml`, zeros(15)]);
  const file = zip(slides);
  assert.ok(file.length < 200_000, `the file is small (${file.length} bytes) though it unpacks to ${6 * 15} MB`);
  assert.throws(() => extractText('bomb.pptx', '', file), /couldn’t be read/);
  assert.match(extractText('ok.pptx', '', zip([['ppt/slides/slide1.xml', '<a:p><a:t>Hello</a:t></a:p>']])).text, /Hello/);
});

test('security: a PDF whose many small streams each unpack to the cap is refused as a whole', () => {
  const pages = 6;
  const objects = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${10 + i} 0 R`).join(' ')}] /Count ${pages} >>` };
  for (let i = 0; i < pages; i += 1) { objects[10 + i] = `<< /Type /Page /Parent 2 0 R /Contents ${30 + i} 0 R >>`; objects[30 + i] = stream('', Buffer.alloc(15 * 1024 * 1024), true); }
  const file = pdf(objects);
  assert.ok(file.length < 200_000, 'the file is small');
  assert.throws(() => pdfToText(file), /too large or complex/);
});
