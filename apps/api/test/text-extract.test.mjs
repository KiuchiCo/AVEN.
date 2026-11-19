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
