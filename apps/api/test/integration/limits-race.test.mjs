import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

const tally = (responses) => responses.reduce((counts, response) => ({ ...counts, [response.status]: (counts[response.status] ?? 0) + 1 }), {});

describe('security: plan limits hold when requests arrive at the same moment', { skip }, () => {
  let t; let W; let ws;
  before(async () => { t = await boot(); await t.user('rae'); W = await t.workspace('rae'); ws = `/workspaces/${W.id}`; });
  after(async () => { await t?.close(); });

  test('twelve parallel project and database creations stop at the Free limits (5 and 3)', async () => {
    const projects = await Promise.all(Array.from({ length: 12 }, (_, i) => t.call('rae', 'POST', `${ws}/projects`, { name: `P${i}` })));
    assert.deepEqual(tally(projects), { 201: 5, 402: 7 });
    const databases = await Promise.all(Array.from({ length: 10 }, (_, i) => t.call('rae', 'POST', `${ws}/databases`, { name: `D${i}` })));
    assert.deepEqual(tally(databases), { 201: 3, 402: 7 });
    assert.equal(await t.prisma.project.count({ where: { workspaceId: W.id } }), 5);
  });

  test('parallel invitations cannot take a Free workspace past its member limit, and one invitation joins only once', async () => {
    const invites = await Promise.all(Array.from({ length: 8 }, (_, i) => t.call('rae', 'POST', `${ws}/members/invitations`, { email: `inv${i}-${t.run}@integration.test`, role: 'MEMBER' })));
    assert.deepEqual(tally(invites), { 201: 2, 402: 6 }, 'three seats: the owner and two invitations');
    const token = invites.find((response) => response.status === 201).body.token;
    const email = invites.find((response) => response.status === 201).body.invitation.email;
    const name = email.split('@')[0]; await t.prisma.user.create({ data: { email, displayName: name, identityIssuer: 'https://integration.test', identitySubject: name } });
    const accepts = await Promise.all(Array.from({ length: 5 }, () => fetch(`${t.base}/invitations/${token}/accept`, { method: 'POST', headers: { 'x-test-user': name, 'content-type': 'application/json' } })));
    const counts = tally(accepts);
    assert.equal(counts[201], 1, JSON.stringify(counts));
    assert.equal(await t.prisma.workspaceMember.count({ where: { workspaceId: W.id, user: { email } } }), 1);
  });
});
