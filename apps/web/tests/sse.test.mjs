import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readEvents } from '../app/workspace/messages/sse.ts';

const stream = (chunks) => new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close(); } });
const collect = async (chunks) => { const out = []; for await (const e of readEvents(stream(chunks))) out.push(e); return out; };

test('events split across chunks are reassembled, comments and junk are skipped', async () => {
  const events = await collect([': connected\n\ndata: {"a":', '1}\n\ndata: not json\n\n: keep-alive\n\ndata: {"b":2}\n\n']);
  assert.deepEqual(events, [{ a: 1 }, { b: 2 }]);
});
test('a trailing partial event is not emitted', async () => assert.deepEqual(await collect(['data: {"a":1}\n\ndata: {"b"']), [{ a: 1 }]));
