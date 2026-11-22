import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('databases: records are paged, searched and sorted on the server', { skip }, () => {
  let t; let W; let ws; let db; let qty; let doubled; let stage; let nameId;
  const N = 1200;
  before(async () => {
    t = await boot(); await t.user('pat'); await t.user('out'); W = await t.workspace('pat'); ws = `/workspaces/${W.id}`; await t.plan(W.id, 'PRO');
    db = (await t.call('pat', 'POST', `${ws}/databases`, { name: 'Orders' })).body; nameId = db.properties[0].id;
    qty = (await t.call('pat', 'PATCH', `${ws}/databases/${db.id}/properties`, { name: 'Qty', type: 'number' })).body.properties.at(-1).id;
    doubled = (await t.call('pat', 'PATCH', `${ws}/databases/${db.id}/properties`, { name: 'Double', type: 'formula', formula: '[Qty] * 2' })).body.properties.at(-1).id;
    stage = (await t.call('pat', 'PATCH', `${ws}/databases/${db.id}/properties`, { name: 'Stage', type: 'status' })).body.properties.at(-1).id;
    for (let from = 0; from < N; from += 400) {
      const rows = Array.from({ length: 400 }, (_, i) => { const n = from + i; return { [nameId]: `Row ${n}${n % 100 === 0 ? ' 100%_special' : ''}`, [qty]: (n * 37) % 1000, [stage]: n % 2 ? 'Open' : 'Done' }; });
      assert.equal((await t.call('pat', 'POST', `${ws}/databases/${db.id}/records/import`, { rows })).status, 201);
    }
  });
  after(async () => { await t?.close(); });
  const page = (query, who = 'pat', id = db.id) => t.call(who, 'GET', `${ws}/databases/${id}/records?${query}`);

  test('the plain list says how many records there are, and a limit of 0 sends none', async () => {
    const list = (await t.call('pat', 'GET', `${ws}/databases`)).body.find((d) => d.id === db.id);
    assert.equal(list.recordTotal, N); assert.equal(list.records.length, N); assert.equal(list.hasMore, false);
    const bare = (await t.call('pat', 'GET', `${ws}/databases?recordLimit=0`)).body.find((d) => d.id === db.id);
    assert.equal(bare.records.length, 0); assert.equal(bare.recordTotal, N); assert.equal(bare.hasMore, true, 'records exist that were not sent, and the answer says so');
    assert.equal((await t.call('pat', 'GET', `${ws}/databases?recordLimit=-1`)).status, 400);
  });

  test('pages are stable, do not overlap, cover every record once, and report the true total', async () => {
    const first = (await page('pageSize=100')).body;
    assert.equal(first.total, N); assert.equal(first.pageCount, 12); assert.equal(first.records.length, 100);
    assert.deepEqual((await page('pageSize=100')).body.records.map((r) => r.id), first.records.map((r) => r.id), 'the same request gives the same page');
    const seen = new Set();
    for (let p = 1; p <= 12; p += 1) for (const record of (await page(`pageSize=100&page=${p}`)).body.records) { assert.ok(!seen.has(record.id), 'no record twice'); seen.add(record.id); }
    assert.equal(seen.size, N);
    assert.equal((await page('pageSize=100&page=13')).body.records.length, 0);
  });

  test('sorting works across all records, not within a page', async () => {
    const up = (await page(`pageSize=25&sort=${qty}&dir=asc`)).body.records.map((r) => r.values[qty]);
    const down = (await page(`pageSize=25&sort=${qty}&dir=desc`)).body.records.map((r) => r.values[qty]);
    const all = Array.from({ length: N }, (_, n) => (n * 37) % 1000).sort((a, b) => a - b);
    assert.deepEqual(up, all.slice(0, 25)); assert.deepEqual(down, all.slice(-25).reverse());
    const lastPage = (await page(`pageSize=25&sort=${qty}&dir=asc&page=${Math.ceil(N / 25)}`)).body.records.map((r) => r.values[qty]);
    assert.deepEqual(lastPage, all.slice(-25), 'the end of the sorted list is on the last page');
  });

  test('search runs over every record, treats % and _ as plain characters, and totals count all matches', async () => {
    const expected = Array.from({ length: N }, (_, n) => `Row ${n}`).filter((name) => name.includes('Row 77')).length;
    const found = (await page(`pageSize=500&q=${encodeURIComponent('row 77')}`)).body;
    assert.equal(found.total, expected); assert.ok(found.records.every((r) => String(r.values[nameId]).toLowerCase().includes('row 77')));
    const special = (await page(`pageSize=500&q=${encodeURIComponent('100%_special')}`)).body;
    assert.equal(special.total, Math.ceil(N / 100), 'only the rows that really contain 100%_special'); assert.equal((await page(`q=${encodeURIComponent('%')}`)).body.total, special.total, 'a bare % is not a wildcard');
    assert.equal((await page(`q=${encodeURIComponent('zzzz-nothing')}`)).body.total, 0);
    assert.equal((await page(`q=${'x'.repeat(201)}`)).status, 400);
  });

  test('formulas and rollups on a page are right because they are worked out per record on the server', async () => {
    const records = (await page(`pageSize=50&page=7&sort=${qty}&dir=asc`)).body.records;
    assert.ok(records.every((r) => r.values[doubled] === r.values[qty] * 2), 'every formula value on a page that is not the first');
    const people = (await t.call('pat', 'POST', `${ws}/databases`, { name: 'Customers' })).body; const pname = people.properties[0].id;
    const link = (await t.call('pat', 'PATCH', `${ws}/databases/${people.id}/properties`, { name: 'Orders', type: 'relation', relatedDatabaseId: db.id })).body.properties.at(-1).id;
    const total = (await t.call('pat', 'PATCH', `${ws}/databases/${people.id}/properties`, { name: 'Total qty', type: 'rollup', rollupRelationId: link, rollupFunction: 'sum', rollupPropertyId: qty })).body.properties.at(-1).id;
    const targets = (await page('pageSize=500&page=3')).body.records.slice(0, 5);
    const customer = (await t.call('pat', 'POST', `${ws}/databases/${people.id}/records`, { values: { [pname]: 'Acme', [link]: targets.map((r) => r.id) } })).body;
    const shown = (await t.call('pat', 'GET', `${ws}/databases/${people.id}/records`)).body.records[0];
    assert.equal(shown.values[total], targets.reduce((sum, r) => sum + r.values[qty], 0), 'the rollup adds up records that are on a different page');
    assert.deepEqual(Object.keys(shown.linkNames).sort(), targets.map((r) => r.id).sort(), 'linked records come with their names, whichever page they are on');
    assert.ok(Object.values(shown.linkNames).every((name) => name.startsWith('Row ')));
    assert.equal(customer.id, shown.id);
  });

  test('bad paging, sorting and ids are refused, and nobody outside the workspace can page through', async () => {
    for (const bad of ['pageSize=7', 'page=0', 'page=abc', 'dir=sideways', `sort=${nameId}x`, `sort=${doubled}`]) assert.equal((await page(bad)).status, 400, bad);
    assert.equal((await page('', 'out')).status, 404);
    const other = await t.workspace('out'); const theirs = (await t.call('out', 'POST', `/workspaces/${other.id}/databases`, { name: 'Theirs' })).body;
    assert.equal((await page('', 'pat', theirs.id)).status, 404, 'another workspace\'s database through this workspace\'s address');
  });
});
