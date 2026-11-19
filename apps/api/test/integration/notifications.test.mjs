import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('email notifications and invitations', { skip }, () => {
  let t; let W; let service; let sent; let mode; let emailer; let users; let t0;
  const ws = () => `/workspaces/${W.id}`;
  const minutes = (n) => new Date(Date.now() + n * 60_000);
  const assign = (title, who, by = 'ann') => t.call(by, 'POST', `${ws()}/tasks`, { title, assigneeId: users[who].id });
  const emailsTo = (address) => sent.filter((mail) => mail.to[0] === address);

  before(async () => {
    sent = []; mode = 'ok';
    service = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      if (mode === 'down') return res.writeHead(503).end('{}');
      sent.push({ ...JSON.parse(b), auth: req.headers.authorization }); res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"msg"}');
    }); });
    await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
    t = await boot({ EMAIL_API_KEY: 're_test_key', EMAIL_FROM: 'AVEN <hello@aven.test>', EMAIL_BASE_URL: `http://127.0.0.1:${service.address().port}`, WEB_ORIGIN: 'https://app.aven.test' });
    users = {};
    for (const name of ['ann', 'bob', 'cat', 'dan']) users[name] = await t.user(name);
    W = await t.workspace('ann'); await t.plan(W.id, 'ENTERPRISE');
    for (const name of ['bob', 'cat', 'dan']) await t.member(W.id, name, 'MEMBER');
    const { NotificationEmailer } = await import('../../dist/email/notification-emailer.service.js');
    emailer = t.get(NotificationEmailer);
    await assign('Old task', 'bob');                       // before bob turns email on
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  after(async () => { await t?.close(); await new Promise((resolve) => service.close(resolve)); });

  const address = (name) => users[name].email;

  test('turning email on is an explicit choice that never sends a backlog', async () => {
    const on = await t.call('bob', 'PATCH', '/session/me', { emailNotifications: true });
    assert.deepEqual([on.status, on.body.emailNotifications, on.body.emailAvailable], [200, true, true]);
    t0 = (await t.prisma.user.findUniqueOrThrow({ where: { id: users.bob.id } })).emailEnabledAt;
    assert.ok(t0, 'the moment email was turned on is recorded');
    await t.call('bob', 'PATCH', '/session/me', { emailNotifications: true });
    assert.deepEqual((await t.prisma.user.findUniqueOrThrow({ where: { id: users.bob.id } })).emailEnabledAt, t0, 'turning it on again changes nothing');
    assert.equal((await t.call('bob', 'PATCH', '/session/me', { emailNotifications: 'yes' })).status, 400);
  });

  test('one summary email covers only unread notifications addressed to the person, after a short wait', async () => {
    await assign('New task A', 'bob'); await assign('New task B', 'bob');
    await assign('Read task', 'bob'); await assign('Mine', 'ann', 'ann'); await assign('For cat', 'cat');
    const readReceipt = await t.prisma.activityReceipt.findFirstOrThrow({ where: { userId: users.bob.id, activity: { message: { contains: 'Read task' } } } });
    assert.equal((await t.call('bob', 'PATCH', `${ws()}/activity/${readReceipt.activityId}/read`, { read: true })).status, 200);

    assert.deepEqual(await emailer.tick(new Date()), { emails: 0, skipped: 0 }, 'too fresh: people get time to read things in the app first');
    const result = await emailer.tick(minutes(6));
    assert.equal(result.emails, 1);
    assert.equal(emailsTo(address('cat')).length, 0, 'someone who has not opted in gets nothing');
    const [mail] = emailsTo(address('bob'));
    assert.equal(mail.auth, 'Bearer re_test_key');
    assert.equal(mail.from, 'AVEN <hello@aven.test>');
    assert.match(mail.subject, /^AVEN: 2 new updates in Workspace /);
    for (const title of ['New task A', 'New task B']) assert.match(mail.text, new RegExp(title));
    for (const title of ['Old task', 'Read task', 'Mine']) assert.doesNotMatch(mail.text, new RegExp(title), `${title} must not be emailed`);
    assert.match(mail.text, /https:\/\/app\.aven\.test\/workspace\/tasks\/[0-9a-f-]{36}/);
    assert.match(mail.html, /Open your Inbox/);

    const again = await emailer.tick(minutes(7));
    assert.equal(again.emails, 0, 'nothing is sent twice');
    assert.equal(emailsTo(address('bob')).length, 1);
    const old = await t.prisma.activityReceipt.findFirstOrThrow({ where: { userId: users.bob.id, activity: { message: { contains: 'Old task' } } } });
    assert.ok(old.emailedAt, 'the pre-existing notification was marked handled, not sent');
  });

  test('a failed send is undone and retried later, not repeated in a loop', async () => {
    await assign('Retry task', 'bob');
    mode = 'down';
    assert.equal((await emailer.tick(minutes(6))).emails, 0);
    const receipt = await t.prisma.activityReceipt.findFirstOrThrow({ where: { userId: users.bob.id, activity: { message: { contains: 'Retry task' } } } });
    assert.equal(receipt.emailedAt, null, 'still waiting to be sent');
    const hitsBefore = sent.length;
    mode = 'ok';
    assert.equal((await emailer.tick(minutes(8))).emails, 0, 'backing off for a while after a failure');
    assert.equal(sent.length, hitsBefore);
    assert.equal((await emailer.tick(minutes(25))).emails, 1);
    assert.match(emailsTo(address('bob')).at(-1).text, /Retry task/);
  });

  test('notifications for someone who has left the workspace are not emailed', async () => {
    await t.call('bob', 'PATCH', '/session/me', { emailNotifications: true });
    await assign('Too late', 'bob');
    await t.prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: W.id, userId: users.bob.id } } });
    const before = sent.length;
    const result = await emailer.tick(minutes(40));
    assert.equal(sent.length, before);
    assert.ok(result.skipped >= 1);
  });

  test('turning email off stops it, and a person who turned it on later still gets no old items', async () => {
    assert.equal((await t.call('dan', 'PATCH', '/session/me', { emailNotifications: true })).status, 200);
    assert.equal((await t.call('dan', 'PATCH', '/session/me', { emailNotifications: false })).status, 200);
    assert.equal((await t.prisma.user.findUniqueOrThrow({ where: { id: users.dan.id } })).emailEnabledAt, null);
    await assign('For dan', 'dan');
    await emailer.tick(minutes(60));
    assert.equal(emailsTo(address('dan')).length, 0);
  });

  test('inviting someone sends them the link, and a failed email never blocks the invitation', async () => {
    const ok = await t.call('ann', 'POST', `${ws()}/members/invitations`, { email: `newbie-${t.run}@aven.test`, role: 'MEMBER' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.email, 'sent');
    const [mail] = emailsTo(`newbie-${t.run}@aven.test`);
    assert.match(mail.subject, /^ann invited you to Workspace /);
    assert.ok(mail.text.includes(`https://app.aven.test/invite?token=${encodeURIComponent(ok.body.token)}`), 'the email carries the working link');
    mode = 'down';
    const failed = await t.call('ann', 'POST', `${ws()}/members/invitations`, { email: `second-${t.run}@aven.test`, role: 'GUEST' });
    assert.deepEqual([failed.status, failed.body.email, typeof failed.body.token], [201, 'failed', 'string']);
    mode = 'ok';
    assert.equal((await t.call('cat', 'POST', `${ws()}/members/invitations`, { email: `third-${t.run}@aven.test`, role: 'MEMBER' })).status, 403, 'only administrators can invite');
  });
});
