import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('two people editing at once', { skip }, () => {
  let t; let W;
  before(async () => { t = await boot(); await t.user('ann'); await t.user('ben'); W = await t.workspace('ann'); await t.member(W.id, 'ben', 'MEMBER'); });
  after(async () => { await t?.close(); });
  const ws = () => `/workspaces/${W.id}`;

  /** Shared checks: a stale save is refused with the current copy, a missing token is refused, and simultaneous saves have one winner. */
  async function behavesLikeOptimisticLocking(path, field, makeBody, currentOf) {
    const loaded = (await t.call('ann', 'GET', ws() + path.list)).body;
    const base = path.baseOf(loaded);
    const first = await t.call('ann', 'PATCH', ws() + path.item, { ...makeBody('Ann'), baseUpdatedAt: base });
    assert.equal(first.status, 200, `first save: ${JSON.stringify(first.body)}`);
    const stale = await t.call('ben', 'PATCH', ws() + path.item, { ...makeBody('Ben'), baseUpdatedAt: base });
    assert.equal(stale.status, 409);
    assert.match(stale.body.message, /changed by someone else/);
    assert.equal(currentOf(stale.body.current), 'Ann', 'the refusal carries the winner’s copy');
    assert.equal((await t.call('ben', 'PATCH', ws() + path.item, makeBody('NoToken'))).status, 400);
    const latest = path.baseOf((await t.call('ann', 'GET', ws() + path.list)).body);
    const [one, two] = await Promise.all(['One', 'Two'].map((who, i) => t.call(i ? 'ben' : 'ann', 'PATCH', ws() + path.item, { ...makeBody(who), baseUpdatedAt: latest })));
    assert.deepEqual([one.status, two.status].sort(), [200, 409], 'exactly one simultaneous save wins');
  }

  test('documents', async () => {
    const doc = (await t.call('ann', 'POST', `${ws()}/documents`, { title: 'Doc', content: 'v0' })).body;
    await behavesLikeOptimisticLocking({ list: `/documents/${doc.id}`, item: `/documents/${doc.id}`, baseOf: (body) => body.updatedAt }, 'content', (who) => ({ content: who }), (current) => current.content);
  });

  test('database records', async () => {
    const database = (await t.call('ann', 'POST', `${ws()}/databases`, { name: 'Table' })).body;
    const record = (await t.call('ann', 'POST', `${ws()}/databases/${database.id}/records`, { values: { name: 'row' } })).body;
    await behavesLikeOptimisticLocking({ list: '/databases', item: `/databases/${database.id}/records/${record.id}`, baseOf: (body) => body.find((d) => d.id === database.id).records[0].updatedAt }, 'name', (who) => ({ values: { name: who } }), (current) => current.values.name);
  });

  test('calendar events', async () => {
    const event = (await t.call('ann', 'POST', `${ws()}/events`, { title: 'Meeting', startsAt: '2027-02-01T10:00:00Z' })).body;
    await behavesLikeOptimisticLocking({ list: '/events', item: `/events/${event.id}`, baseOf: (body) => body.find((e) => e.id === event.id).updatedAt }, 'title', (who) => ({ title: who }), (current) => current.title);
  });

  test('a repeated save with the up-to-date token always works', async () => {
    const doc = (await t.call('ann', 'POST', `${ws()}/documents`, { title: 'Sequential', content: 'a' })).body;
    let base = doc.updatedAt;
    for (const content of ['b', 'c', 'd']) {
      const saved = await t.call('ann', 'PATCH', `${ws()}/documents/${doc.id}`, { content, baseUpdatedAt: base });
      assert.equal(saved.status, 200); base = saved.body.updatedAt;
    }
    assert.equal((await t.call('ann', 'GET', `${ws()}/documents/${doc.id}`)).body.content, 'd');
  });
  test('the calendar form can save a one-off event it opened for editing (it always sends recurrenceTimeZone: null)', async () => {
    const made = (await t.call('ann', 'POST', `${ws()}/events`, { title: 'One-off', startsAt: '2027-03-01T09:00:00Z', endsAt: '2027-03-01T10:00:00Z', recurrence: null, recurrenceTimeZone: null })).body;
    const form = { baseUpdatedAt: made.updatedAt, title: 'One-off moved', startsAt: '2027-03-02T11:00:00Z', endsAt: '2027-03-02T12:00:00Z', description: null, location: null, type: 'MEETING', isAllDay: false, recurrence: null, recurrenceInterval: 1, recurrenceUntil: null, recurrenceTimeZone: null };
    const saved = await t.call('ann', 'PATCH', `${ws()}/events/${made.id}`, form);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.title, 'One-off moved'); assert.equal(saved.body.startsAt, '2027-03-02T11:00:00.000Z');
    const series = await t.call('ann', 'PATCH', `${ws()}/events/${made.id}`, { ...form, baseUpdatedAt: saved.body.updatedAt, recurrence: 'WEEKLY', recurrenceUntil: '2027-04-01T00:00:00Z', recurrenceTimeZone: null });
    assert.equal(series.status, 400, 'a series still needs a time zone');
  });
});
