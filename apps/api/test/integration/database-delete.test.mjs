import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('databases: deleting a database', { skip }, () => {
  let t; let W; let O; let ws;
  before(async () => {
    t = await boot(); for (const n of ['dee', 'gil', 'oz']) await t.user(n);
    W = await t.workspace('dee'); await t.member(W.id, 'gil', 'GUEST'); O = await t.workspace('oz'); ws = `/workspaces/${W.id}`;
  });
  after(async () => { await t?.close(); });

  test('removes the database with its records; guests, outsiders and databases still linked to are refused', async () => {
    const target = (await t.call('dee', 'POST', `${ws}/databases`, { name: `Target ${t.run}` })).body;
    const linker = (await t.call('dee', 'POST', `${ws}/databases`, { name: `Linker ${t.run}` })).body;
    const nameId = target.properties[0].id;
    assert.equal((await t.call('dee', 'POST', `${ws}/databases/${target.id}/records`, { values: { [nameId]: 'Row' } })).status, 201);
    assert.equal((await t.call('dee', 'PATCH', `${ws}/databases/${linker.id}/properties`, { name: 'Target link', type: 'relation', relatedDatabaseId: target.id })).status, 200);

    assert.equal((await t.call('gil', 'DELETE', `${ws}/databases/${target.id}`)).status, 403, 'guests cannot delete');
    assert.equal((await t.call('oz', 'DELETE', `/workspaces/${O.id}/databases/${target.id}`)).status, 404, 'another workspace cannot reach it');
    const blocked = await t.call('dee', 'DELETE', `${ws}/databases/${target.id}`);
    assert.equal(blocked.status, 409); assert.match(blocked.body.message, /Target link/);

    assert.equal((await t.call('dee', 'DELETE', `${ws}/databases/${linker.id}`)).status, 200);
    const done = await t.call('dee', 'DELETE', `${ws}/databases/${target.id}`);
    assert.equal(done.status, 200); assert.deepEqual(done.body, { id: target.id, deleted: true });
    assert.equal(await t.prisma.databaseRecord.count({ where: { databaseId: target.id } }), 0, 'its records went with it');
    assert.equal((await t.call('dee', 'DELETE', `${ws}/databases/${target.id}`)).status, 404, 'a second delete finds nothing');
    assert.ok(await t.prisma.workspaceActivity.findFirst({ where: { workspaceId: W.id, entityType: 'DATABASE', entityId: target.id } }), 'the deletion is in the activity log');
  });
});
