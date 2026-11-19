import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditCsv, csvCell, cursorFor, parseAuditQuery } from '../dist/audit/audit-rules.js';

const id = '11111111-1111-4111-8111-111111111111';
test('filters are read and checked; a whole end date covers the whole day', () => {
  const q = parseAuditQuery({ entityType: 'TASK', actorId: id, from: '2026-03-01', to: '2026-03-31', q: ' moved ' });
  assert.deepEqual([q.entityType, q.actorId, q.q], ['TASK', id, 'moved']);
  assert.equal(q.from.toISOString(), '2026-03-01T00:00:00.000Z'); assert.equal(q.to.toISOString(), '2026-03-31T23:59:59.999Z');
  assert.deepEqual(parseAuditQuery({}), { from: undefined, to: undefined });
});
test('bad filters are refused rather than ignored', () => {
  for (const bad of [{ entityType: 'task' }, { entityType: 'A'.repeat(40) }, { actorId: 'nope' }, { from: 'yesterday' }, { from: '2026-04-01', to: '2026-03-01' }, { q: 'a' }, { cursor: 'x' }, { cursor: `2026-01-01T00:00:00.000Z_bad` }]) assert.throws(() => parseAuditQuery(bad), /./, JSON.stringify(bad));
});
test('a cursor round-trips', () => {
  const row = { createdAt: new Date('2026-03-01T10:00:00.123Z'), id }; const q = parseAuditQuery({ cursor: cursorFor(row) });
  assert.equal(q.cursor.createdAt.getTime(), row.createdAt.getTime()); assert.equal(q.cursor.id, id);
});
test('csv cells are quoted when needed and cannot run as spreadsheet formulas', () => {
  assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  for (const attack of ['=1+1', '+cmd', '-2', '@SUM(A1)']) assert.equal(csvCell(attack), `'${attack}`);
  const csv = auditCsv([{ createdAt: new Date('2026-03-01T10:00:00Z'), actor: { displayName: '=Evil', email: 'e@x.test' }, entityType: 'TASK', entityId: id, message: 'moved “A, B”' }]);
  assert.match(csv, /^When \(UTC\),Person,Email,Area,Item id,What happened\r\n2026-03-01T10:00:00.000Z,'=Evil,e@x\.test,TASK,/); assert.ok(csv.endsWith('\r\n'));
});
