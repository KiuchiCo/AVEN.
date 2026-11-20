import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, fromChange, SyncClient, SyncDocument, transformPosition } from '../src/index.ts';

function mulberry(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = mulberry(99);
const rand = (n) => Math.floor(random() * n);
const letters = 'abcdefgh ';
const typed = (text) => {
  const at = rand(text.length + 1);
  const kind = rand(3);
  if (kind === 0 || !text.length) return text.slice(0, at) + letters[rand(letters.length)] + text.slice(at);
  const from = Math.min(at, text.length - 1);
  return kind === 1 ? text.slice(0, from) + text.slice(from + 1) : text.slice(0, from) + letters[rand(letters.length)] + text.slice(from + 1);
};

/** A client with the text on its screen, and a channel to and from the server that delivers in order. */
function makeClient(initial, revision) {
  const client = new SyncClient(revision);
  return { client, screen: initial, toServer: [], fromServer: [],
    edit() { const next = typed(this.screen); const op = fromChange(this.screen, next); this.screen = next; const send = client.local(op); if (send) this.toServer.push({ revision: client.revision, operation: send }); } };
}

function run(clientCount, steps) {
  const server = new SyncDocument('start text');
  const clients = Array.from({ length: clientCount }, () => makeClient(server.text, server.revision));
  const deliverToServer = (c) => {
    const message = c.toServer.shift();
    const { operation, revision } = server.receive(message.revision, message.operation);
    for (const other of clients) other.fromServer.push(other === c ? { ack: true } : { operation, revision });
  };
  const deliverFromServer = (c) => {
    const message = c.fromServer.shift();
    if (message.ack) { const next = c.client.acknowledge(); if (next) c.toServer.push({ revision: c.client.revision, operation: next }); }
    else c.screen = apply(c.client.remote(message.operation), c.screen);
  };
  for (let step = 0; step < steps; step += 1) {
    const c = clients[rand(clients.length)];
    const choice = rand(3);
    if (choice === 0) c.edit();
    else if (choice === 1 && c.toServer.length) deliverToServer(c);
    else if (c.fromServer.length) deliverFromServer(c);
  }
  // let everything settle
  for (let guard = 0; guard < 100000 && clients.some((c) => c.toServer.length || c.fromServer.length); guard += 1) {
    for (const c of clients) { if (c.toServer.length) deliverToServer(c); if (c.fromServer.length) deliverFromServer(c); }
  }
  return { server, clients };
}

test('everyone ends with the same text however the messages interleave (random check)', () => {
  for (let round = 0; round < 3000; round += 1) {
    const { server, clients } = run(2 + rand(3), 60 + rand(80));
    for (const c of clients) { assert.equal(c.screen, server.text, `round ${round}`); assert.equal(c.client.settled, true); assert.equal(c.client.revision, server.revision); }
  }
});

test('a client that types while waiting holds the edits back and sends them together', () => {
  const server = new SyncDocument('abc');
  const c = new SyncClient(0);
  const first = c.local(fromChange('abc', 'abcd')); assert.ok(first);
  assert.equal(c.local(fromChange('abcd', 'abcde')), null); assert.equal(c.local(fromChange('abcde', 'abcdef')), null);
  const { operation } = server.receive(0, first); assert.equal(server.text, 'abcd');
  const next = c.acknowledge(); assert.ok(next); assert.equal(c.revision, 1);
  server.receive(c.revision, next); assert.equal(server.text, 'abcdef');
  assert.equal(c.acknowledge(), null); assert.equal(c.settled, true); assert.equal(operation.length > 0, true);
});

test('the server refuses edits it can’t trust', () => {
  const server = new SyncDocument('hello');
  assert.throws(() => server.receive(3, [5]), /not reached/);
  assert.throws(() => server.receive(0, [9]), /does not|characters/);
  server.receive(0, [5, '!']); server.receive(1, [6, '?']); server.forgetBefore(2);
  assert.throws(() => server.receive(0, [5]), /older than/);
  assert.equal(server.text, 'hello!?'); assert.equal(server.revision, 2);
  assert.equal(server.receive(2, [7, 'x']).revision, 3);
});

test('another person’s caret is mapped through what is still waiting here', () => {
  const c = new SyncClient(0);
  c.local(fromChange('hello', 'oh hello')); // inserts "oh " at the start, not yet confirmed
  assert.equal(c.position(2), 5);
  assert.equal(transformPosition(fromChange('hello', 'oh hello'), 2), 5);
});

test('nobody\u2019s typing is lost: markers typed at once by several people all end up in the text, once each', () => {
  for (let round = 0; round < 200; round += 1) {
    const server = new SyncDocument('one two three four five six');
    const clients = Array.from({ length: 4 }, () => makeClient(server.text, server.revision));
    clients.forEach((c, index) => { // each types a unique marker somewhere, before any message is delivered
      const at = rand(c.screen.length + 1); const next = `${c.screen.slice(0, at)}<${index}>${c.screen.slice(at)}`;
      const send = c.client.local(fromChange(c.screen, next)); c.screen = next; c.toServer.push({ revision: c.client.revision, operation: send });
    });
    const order = clients.map((_, i) => i).sort(() => random() - 0.5);
    for (const i of order) { const m = clients[i].toServer.shift(); const { operation, revision } = server.receive(m.revision, m.operation); clients.forEach((c, j) => c.fromServer.push(j === i ? { ack: true } : { operation, revision })); }
    for (const c of clients) while (c.fromServer.length) { const m = c.fromServer.shift(); if (m.ack) c.client.acknowledge(); else c.screen = apply(c.client.remote(m.operation), c.screen); }
    for (const c of clients) assert.equal(c.screen, server.text);
    for (let i = 0; i < 4; i += 1) assert.equal(server.text.split(`<${i}>`).length - 1, 1, `marker ${i} in ${server.text}`);
    assert.equal(server.text.replace(/<\d>/g, ''), 'one two three four five six');
  }
});
