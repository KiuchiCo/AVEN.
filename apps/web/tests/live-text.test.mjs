import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncDocument } from '@aven/collab';
import { LiveTextEngine } from '../app/workspace/documents/[documentId]/live-text.ts';

function mulberry(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A server with messages that travel one at a time, in order, so tests can interleave typing, sending and receiving. */
function world(blocks, count, seed, retryMs = 5, patienceMs = 8000) {
  const random = mulberry(seed); const rand = (n) => Math.floor(random() * n);
  const docs = new Map(Object.entries(blocks).map(([id, text]) => [id, new SyncDocument(text)]));
  const peers = Array.from({ length: count }, (_, index) => {
    const peer = { index, screens: new Map(Object.entries(blocks)), outbox: [], inbox: [], resets: [], offline: false, remote: [] };
    peer.engine = new LiveTextEngine(`tab${index}`, {
      get: async (id) => { if (peer.offline) throw new Error('offline'); const doc = docs.get(id); if (!doc) throw { status: 409 }; return { text: doc.text, revision: doc.revision }; },
      post: async (id, body) => { if (peer.offline) throw new Error('offline'); peer.outbox.push({ id, body }); },
    }, {
      readText: (id) => peer.screens.get(id),
      writeText: (id, text, operation) => { peer.screens.set(id, text); if (operation) peer.remote.push(operation); },
      changed() {}, reset: (id) => peer.resets.push(id),
    }, retryMs, patienceMs);
    return peer;
  });
  const accept = (peer) => {
    const { id, body } = peer.outbox.shift();
    let accepted; try { accepted = docs.get(id).receive(body.revision, body.operation); } catch { return; }
    for (const other of peers) other.inbox.push({ blockId: id, revision: accepted.revision, operation: accepted.operation, clientId: body.clientId });
  };
  const deliver = (peer) => { const event = peer.inbox.shift(); if (!peer.offline) peer.engine.handle(event); };
  const type = (peer, id) => {
    const text = peer.screens.get(id); const at = rand(text.length + 1); const kind = rand(3);
    const letters = 'abcdefgh ';
    const next = kind === 0 || !text.length ? text.slice(0, at) + letters[rand(letters.length)] + text.slice(at) : kind === 1 ? text.slice(0, Math.min(at, text.length - 1)) + text.slice(Math.min(at, text.length - 1) + 1) : text.slice(0, Math.min(at, text.length - 1)) + letters[rand(letters.length)] + text.slice(Math.min(at, text.length - 1) + 1);
    peer.screens.set(id, next); assert.equal(peer.engine.edit(id, next), true);
  };
  const settle = async () => {
    for (let guard = 0; guard < 5000; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      let moved = false;
      for (const peer of peers) { if (peer.outbox.length) { accept(peer); moved = true; } if (peer.inbox.length) { deliver(peer); moved = true; } }
      if (!moved && peers.every((peer) => !peer.engine.unsettled)) return;
    }
    assert.fail('did not settle');
  };
  return { docs, peers, rand, accept, deliver, type, settle };
}

test('several tabs typing in the same block at once end with identical text (random check)', async () => {
  for (let round = 0; round < 60; round += 1) {
    const w = world({ a: 'one two three', b: 'other block' }, 3, 1000 + round);
    for (const peer of w.peers) for (const id of ['a', 'b']) await peer.engine.join(id);
    for (let step = 0; step < 80; step += 1) {
      const peer = w.peers[w.rand(3)]; const id = w.rand(4) === 0 ? 'b' : 'a'; const choice = w.rand(3);
      if (choice === 0) w.type(peer, id);
      else if (choice === 1 && peer.outbox.length) w.accept(peer);
      else if (peer.inbox.length) w.deliver(peer);
    }
    await w.settle();
    for (const id of ['a', 'b']) for (const peer of w.peers) assert.equal(peer.screens.get(id), w.docs.get(id).text, `round ${round} block ${id}`);
  }
});

test('a tab that loses its connection keeps typing, then merges with what others did when it returns (random check)', async () => {
  for (let round = 0; round < 40; round += 1) {
    const w = world({ a: 'alpha beta gamma delta epsilon zeta' }, 2, 5000 + round);
    for (const peer of w.peers) await peer.engine.join('a');
    const [online, away] = w.peers;
    away.offline = true;
    // far-apart words so the merge has no real clash
    online.screens.set('a', online.screens.get('a').replace('alpha', 'ALPHA')); online.engine.edit('a', online.screens.get('a'));
    away.screens.set('a', away.screens.get('a').replace('zeta', 'ZETA')); away.engine.edit('a', away.screens.get('a'));
    while (online.outbox.length) w.accept(online);
    away.outbox.length = 0; // whatever it sent while offline never arrived
    for (const peer of w.peers) while (peer.inbox.length) w.deliver(peer);
    away.offline = false; away.engine.resyncAll();
    await w.settle();
    for (const peer of w.peers) assert.equal(peer.screens.get('a'), 'ALPHA beta gamma delta epsilon ZETA', `round ${round}`);
    assert.deepEqual(away.resets, []);
  }
});

test('edits to the same words that cannot be reconciled after a reconnect fall back to the server’s text, and say so', async () => {
  const w = world({ a: 'hello world' }, 2, 1);
  for (const peer of w.peers) await peer.engine.join('a');
  const [online, away] = w.peers; away.offline = true;
  online.screens.set('a', 'hello brave'); online.engine.edit('a', 'hello brave');
  away.screens.set('a', 'hello there'); away.engine.edit('a', 'hello there');
  while (online.outbox.length) w.accept(online); away.outbox.length = 0;
  for (const peer of w.peers) while (peer.inbox.length) w.deliver(peer);
  away.offline = false; away.engine.resyncAll(); await w.settle();
  assert.equal(away.screens.get('a'), 'hello brave'); assert.deepEqual(away.resets, ['a']);
});

test('blocks that are not live text stay on the old save path, and unknown events join lazily', async () => {
  const w = world({ a: 'text' }, 2, 3);
  const [one, two] = w.peers;
  assert.equal(one.engine.edit('a', 'text!'), false, 'not joined yet: the caller saves the old way');
  await one.engine.join('nope'); assert.equal(one.engine.has('nope'), false);
  assert.equal(one.engine.edit('nope', 'x'), false);
  await two.engine.join('a'); one.screens.set('a', 'text');
  two.screens.set('a', 'text?'); two.engine.edit('a', 'text?'); w.accept(two);
  for (const peer of w.peers) while (peer.inbox.length) w.deliver(peer);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(one.engine.has('a'), true, 'it joined when it heard about the block'); assert.equal(one.screens.get('a'), 'text?');
});

test('the caret of a remote edit is reported in the coordinates of the old text', async () => {
  const w = world({ a: 'hello' }, 2, 4);
  for (const peer of w.peers) await peer.engine.join('a');
  const [a, b] = w.peers; b.screens.set('a', 'oh hello'); b.engine.edit('a', 'oh hello'); w.accept(b);
  for (const peer of w.peers) while (peer.inbox.length) w.deliver(peer);
  assert.equal(a.screens.get('a'), 'oh hello'); assert.deepEqual(a.remote, [['oh ', 5]]);
});

test('a tab whose sending fails, while the stream still delivers, catches up and sends what it typed', async () => {
  const w = world({ a: 'one two three' }, 2, 7);
  for (const peer of w.peers) await peer.engine.join('a');
  const [online, away] = w.peers;
  away.blockSending = true;
  const realPost = away.engine.transport.post; away.engine.transport.post = async (id, body) => { if (away.blockSending) throw new Error('offline'); return realPost(id, body); };
  const realGet = away.engine.transport.get; away.engine.transport.get = async (id) => { if (away.blockSending) throw new Error('offline'); return realGet(id); };
  away.screens.set('a', 'one two three ABC'); away.engine.edit('a', 'one two three ABC');
  online.screens.set('a', 'Earlier: one two three'); online.engine.edit('a', 'Earlier: one two three'); w.accept(online);
  for (const peer of w.peers) while (peer.inbox.length) w.deliver(peer); // the stream still works
  await new Promise((resolve) => setTimeout(resolve, 30));
  away.blockSending = false;
  await w.settle();
  assert.equal(w.docs.get('a').text, 'Earlier: one two three ABC');
  for (const peer of w.peers) assert.equal(peer.screens.get('a'), 'Earlier: one two three ABC');
});

test('typed text is never stranded: if the confirmation is lost, the block is reconciled and the text still arrives', async () => {
  const w = world({ a: 'abc' }, 2, 9, 5, 40);
  for (const peer of w.peers) await peer.engine.join('a');
  const [typist, other] = w.peers;
  typist.screens.set('a', 'abcd'); typist.engine.edit('a', 'abcd');
  w.accept(typist); // the server accepted it ...
  typist.inbox.length = 0; // ... but the typist never hears the confirmation
  while (other.inbox.length) w.deliver(other);
  assert.equal(typist.engine.unsettled, true);
  await w.settle();
  assert.equal(w.docs.get('a').text, 'abcd'); assert.equal(typist.screens.get('a'), 'abcd'); assert.equal(other.screens.get('a'), 'abcd', 'and the edit was not applied twice');
  typist.engine.stop(); other.engine.stop();
});
