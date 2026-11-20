import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkText, cosine, rankChunks } from '../dist/semantic/semantic-rules.js';
import { OpenAiCompatibleEmbeddings } from '../dist/semantic/embeddings.js';

test('short text is one chunk, long text overlaps and stops at the cap', () => {
  assert.deepEqual(chunkText('  Hello   world. '), ['Hello world.']);
  const long = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(long);
  assert.equal(chunks.length, 8); assert.ok(chunks.every((c) => c.length <= 1200));
  assert.ok(chunks[0].includes(chunks[1].split(' ')[0]), 'neighbouring chunks overlap');
  assert.deepEqual(chunkText(''), []);
});

test('cosine and ranking keep the best chunk per item and drop weak matches', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1); assert.equal(cosine([1, 0], [0, 1]), 0); assert.equal(cosine([1], [1, 2]), 0);
  const chunks = [
    { entityType: 'DOCUMENT', entityId: 'a', vector: [1, 0] }, { entityType: 'DOCUMENT', entityId: 'a', vector: [0.9, 0.1] },
    { entityType: 'DOCUMENT', entityId: 'b', vector: [0, 1] }, { entityType: 'KNOWLEDGE', entityId: 'a', vector: [0.8, 0.6] },
  ];
  const ranked = rankChunks(chunks, [1, 0], 5);
  assert.deepEqual(ranked.map((r) => `${r.chunk.entityType}:${r.chunk.entityId}`), ['DOCUMENT:a', 'KNOWLEDGE:a']);
});

test('the provider adapter checks what comes back', async () => {
  const ok = (data) => async () => new Response(JSON.stringify({ data }), { status: 200 });
  const make = (fetcher) => new OpenAiCompatibleEmbeddings({ apiKey: 'k', baseUrl: 'https://x.test/v1', model: 'm' }, fetcher);
  assert.deepEqual(await make(ok([{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }])).embed(['a', 'b']), [[1, 2], [3, 4]]);
  await assert.rejects(make(ok([{ index: 0, embedding: [1, 2] }])).embed(['a', 'b']), /unexpected reply/);
  await assert.rejects(make(ok([{ index: 0, embedding: [1, 2] }, { index: 1, embedding: [1] }])).embed(['a', 'b']), /unusable/);
  await assert.rejects(make(async () => new Response('no', { status: 401 })).embed(['a']), /401/);
});
