import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('business role permissions', { skip }, () => {
  let t; let W; let doc;
  const base = () => `/workspaces/${W.id}`;
  const setPolicy = (who, body) => t.call(who, 'PUT', `${base()}/billing/permissions`, body);
  const makeProject = (who) => t.call(who, 'POST', `${base()}/projects`, { name: `P-${who}-${Math.random()}` });
  const makeRule = (who) => t.call(who, 'POST', `${base()}/automations`, { name: `R-${who}-${Math.random()}`, toStatus: 'COMPLETED', action: 'ADD_ACTIVITY_NOTE', activityMessage: 'done' });
  const share = (who) => t.call(who, 'POST', `${base()}/documents/${doc.id}/shares`, {});

  before(async () => {
    t = await boot();
    for (const n of ['ola', 'max', 'meg', 'gus']) await t.user(n);
    W = await t.workspace('ola'); await t.member(W.id, 'max', 'ADMINISTRATOR'); await t.member(W.id, 'meg', 'MANAGER'); await t.member(W.id, 'gus', 'MEMBER');
    doc = (await t.call('ola', 'POST', `${base()}/documents`, { title: 'Doc', content: '' })).body;
  });
  after(async () => { await t?.close(); });

  test('lower plans cannot set a policy, and everyone can act as before', async () => {
    assert.equal((await setPolicy('ola', { projects: 'ADMINS' })).status, 402);
    const read = (await t.call('gus', 'GET', `${base()}/billing/permissions`)).body;
    assert.equal(read.available, false);
    assert.equal((await makeProject('gus')).status, 201);
  });

  test('on Business, only owners and administrators change the policy', async () => {
    await t.plan(W.id, 'BUSINESS');
    assert.equal((await setPolicy('gus', { projects: 'ADMINS' })).status, 403);
    assert.equal((await setPolicy('meg', { projects: 'ADMINS' })).status, 403);
    assert.equal((await setPolicy('ola', { projects: 'nope' })).status, 400);
    const ok = await setPolicy('max', { projects: 'ADMINS', automations: 'MANAGERS', sharing: 'MANAGERS' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual((await t.call('gus', 'GET', `${base()}/billing/permissions`)).body.policy, { projects: 'ADMINS', automations: 'MANAGERS', sharing: 'MANAGERS' });
  });

  test('the policy is enforced on projects, automations and share links', async () => {
    assert.equal((await makeProject('gus')).status, 403);
    assert.equal((await makeProject('meg')).status, 403);
    assert.equal((await makeProject('max')).status, 201);
    assert.equal((await makeProject('ola')).status, 201);
    assert.equal((await makeRule('gus')).status, 403);
    assert.equal((await makeRule('meg')).status, 201);
    assert.equal((await share('gus')).status, 403);
    assert.equal((await share('meg')).status, 201);
    assert.equal((await t.call('gus', 'POST', `${base()}/workflows`, { name: 'w', trigger: { type: 'manual' }, steps: [] })).status, 403);
  });

  test('dropping to a lower plan keeps the saved policy but stops enforcing it', async () => {
    await t.plan(W.id, 'PRO');
    const read = (await t.call('gus', 'GET', `${base()}/billing/permissions`)).body;
    assert.equal(read.available, false); assert.equal(read.policy.projects, 'ADMINS'); assert.equal(read.enforced.projects, 'MEMBERS');
    assert.equal((await makeProject('gus')).status, 201);
    await t.plan(W.id, 'BUSINESS');
    assert.equal((await makeProject('gus')).status, 403);
  });
});
