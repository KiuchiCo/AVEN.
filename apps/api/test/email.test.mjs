import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { MailError, ResendMailer } from '../dist/email/mailer.js';
import { notificationHref, renderInvitationEmail, renderNotificationEmail } from '../dist/email/email-templates.js';
import { parseProfileUpdate } from '../dist/auth/profile.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

async function emailService(handler, run) {
  const requests = [];
  const server = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { requests.push({ method: req.method, url: req.url, headers: req.headers, body: b ? JSON.parse(b) : null }); handler(req, res); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`, requests); } finally { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
}
const email = { to: 'sam@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

test('the mailer posts the message in the email service’s format', async () => {
  await emailService((req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"1"}'), async (baseUrl, requests) => {
    await new ResendMailer({ apiKey: 're_key', from: 'AVEN <hello@example.com>', baseUrl }).send(email);
    assert.deepEqual([requests[0].method, requests[0].url, requests[0].headers.authorization], ['POST', '/emails', 'Bearer re_key']);
    assert.deepEqual(requests[0].body, { from: 'AVEN <hello@example.com>', to: ['sam@example.com'], subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' });
  });
});

test('mail failures say whether retrying could help, without leaking the key', async () => {
  for (const [status, retry, pattern] of [[401, false, /API key/], [403, false, /refused/], [422, false, /refused/], [400, false, /refused/], [429, true, /busy/], [500, true, /busy/], [503, true, /busy/]]) {
    await emailService((req, res) => res.writeHead(status, { 'content-type': 'application/json' }).end('{"message":"bad address"}'), async (baseUrl) => {
      await assert.rejects(new ResendMailer({ apiKey: 're_secret', from: 'a@b.co', baseUrl }).send(email), (e) => e instanceof MailError && e.retry === retry && pattern.test(e.message) && !e.message.includes('re_secret'), String(status));
    });
  }
  await assert.rejects(new ResendMailer({ apiKey: 'k', from: 'a@b.co', baseUrl: 'http://127.0.0.1:1' }).send(email), (e) => e instanceof MailError && e.retry === true);
});

const item = (over = {}) => ({ workspaceName: 'Acme', actorName: 'Dana', message: 'mentioned you in “Plan”', href: '/workspace/tasks/abc', createdAt: new Date(), ...over });

test('a notification email lists updates with working links and a way to turn it off', () => {
  const mail = renderNotificationEmail({ recipientName: 'Sam', items: [item(), item({ actorName: 'Lee', message: 'assigned you “Ship”', href: '/workspace/tasks/xyz' })], webBaseUrl: 'https://app.example.com/' });
  assert.equal(mail.subject, 'AVEN: 2 new updates in Acme');
  assert.match(mail.text, /Hi Sam,/);
  assert.match(mail.text, /Dana mentioned you in “Plan” \(Acme\)\n  https:\/\/app\.example\.com\/workspace\/tasks\/abc/);
  assert.match(mail.text, /Turn them off in Settings: https:\/\/app\.example\.com\/workspace\/settings/);
  assert.match(mail.html, /href="https:\/\/app\.example\.com\/workspace\/tasks\/xyz"/);
  assert.equal(renderNotificationEmail({ recipientName: 'S', items: [item()], webBaseUrl: 'http://x' }).subject, 'AVEN: 1 new update in Acme');
  assert.equal(renderNotificationEmail({ recipientName: 'S', items: [item(), item({ workspaceName: 'Other' })], webBaseUrl: 'http://x' }).subject, 'AVEN: 2 new updates');
});

test('anything a member typed is escaped in the HTML, so it cannot inject markup or links', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)> "quoted" & \'single\'';
  const mail = renderNotificationEmail({ recipientName: evil, items: [item({ actorName: evil, message: evil, workspaceName: evil, href: '/workspace/tasks/"><script>x</script>' })], webBaseUrl: 'https://app.example.com' });
  assert.equal(/<script|<img[\s>]/i.test(mail.html), false);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.equal(mail.html.includes('"><script'), false);
  const invite = renderInvitationEmail({ inviterName: evil, workspaceName: evil, role: 'MEMBER', link: 'https://app.example.com/invite?token=a"b', expiresAt: new Date('2026-12-01') });
  assert.equal(/<script|<img[\s>]/i.test(invite.html), false);
  assert.equal(invite.html.includes('token=a"b'), false);
});

test('long lists are capped and long text is trimmed', () => {
  const mail = renderNotificationEmail({ recipientName: 'S', items: Array.from({ length: 35 }, (_, i) => item({ message: `did thing ${i} ${'x'.repeat(400)}` })), webBaseUrl: 'http://x' });
  assert.equal((mail.html.match(/<li /g) ?? []).length, 20);
  assert.match(mail.text, /…and 15 more in your Inbox/);
  assert.ok(mail.text.split('\n').every((line) => line.length < 260));
});

test('notifications open the right page', () => {
  assert.equal(notificationHref('TASK_COMMENT', 't1'), '/workspace/tasks/t1');
  assert.equal(notificationHref('TASK', 't1'), '/workspace/tasks/t1');
  assert.equal(notificationHref('DOCUMENT', 'd1'), '/workspace/documents/d1');
  assert.equal(notificationHref('WORKFLOW', 'w1'), '/workspace/automations');
  assert.equal(notificationHref('SOMETHING', 'x'), '/workspace/inbox');
  assert.equal(notificationHref('TASK', 'a/b?c'), '/workspace/tasks/a%2Fb%3Fc');
});

test('an invitation email names who invited you, to what, and when the link expires', () => {
  const mail = renderInvitationEmail({ inviterName: 'Dana', workspaceName: 'Acme', role: 'ADMINISTRATOR', link: 'https://app.example.com/invite?token=abc', expiresAt: new Date('2026-12-01T00:00:00Z') });
  assert.equal(mail.subject, 'Dana invited you to Acme on AVEN');
  assert.match(mail.text, /as an administrator/);
  assert.match(mail.text, /https:\/\/app\.example\.com\/invite\?token=abc/);
  assert.match(mail.text, /expires on 2026-12-01/);
  assert.match(renderInvitationEmail({ inviterName: '', workspaceName: 'A', role: 'GUEST', link: 'x', expiresAt: new Date() }).text, /A teammate invited you .* as a guest/);
});

test('the email preference is a real boolean', () => {
  assert.deepEqual(parseProfileUpdate({ emailNotifications: true }), { emailNotifications: true });
  for (const value of ['yes', 1, null]) assert.throws(() => parseProfileUpdate({ emailNotifications: value }), BadRequestException);
});

test('email settings are validated and default to off', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const defaults = readApiEnvironment(base);
  assert.deepEqual([defaults.emailApiKey, defaults.emailFrom, defaults.emailBaseUrl, defaults.webBaseUrl], [undefined, undefined, 'https://api.resend.com', 'http://localhost:3000']);
  assert.equal(readApiEnvironment({ ...base, EMAIL_API_KEY: 'k', EMAIL_FROM: 'AVEN <hello@example.com>', WEB_ORIGIN: 'https://app.example.com' }).webBaseUrl, 'https://app.example.com');
  for (const bad of [{ EMAIL_API_KEY: 'k' }, { EMAIL_FROM: 'not an address' }, { EMAIL_FROM: 'a@b.co\r\nBcc: x@y.z' }, { EMAIL_BASE_URL: 'http://example.com' }, { EMAIL_BASE_URL: 'nonsense' }]) assert.throws(() => readApiEnvironment({ ...base, ...bad }), /Invalid API environment/, JSON.stringify(bad));
  assert.doesNotThrow(() => readApiEnvironment({ ...base, EMAIL_API_KEY: 'k', EMAIL_FROM: 'hello@example.com', EMAIL_BASE_URL: 'http://localhost:9999' }));
});

test('Resend answers a bad key and an unverified sender differently, and AVEN says which one it is without putting addresses in the message', async () => {
  const send = (status, body) => emailService((req, res) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)), (baseUrl) => new ResendMailer({ apiKey: 're_secret', from: 'AVEN <me@gmail.com>', baseUrl }).send(email).then(() => null, (e) => e));
  const key = await send(401, { statusCode: 401, name: 'validation_error', message: 'API key is invalid' });
  assert.match(key.message, /EMAIL_API_KEY/); assert.equal(key.retry, false);
  const sender = await send(403, { statusCode: 403, name: 'validation_error', message: 'The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains' });
  assert.match(sender.message, /domain is not verified/); assert.match(sender.message, /onboarding@resend\.dev/); assert.doesNotMatch(sender.message, /API key/); assert.equal(sender.retry, false);
  const other = await send(403, { message: 'Forbidden for jo@example.com' });
  assert.doesNotMatch(other.message, /jo@example\.com/, 'an address in the provider’s message is removed'); assert.equal(other.retry, false);
  const bad = await send(422, { name: 'validation_error', message: 'Invalid `to` field for dana@example.com' });
  assert.doesNotMatch(bad.message, /dana@example\.com/);
});

test('a free-mail sender is flagged at startup, because Resend cannot send from it', async () => {
  const { emailSenderWarning } = await import('../dist/config/api-environment.js');
  assert.match(emailSenderWarning('AVEN <someone@gmail.com>'), /gmail\.com.*cannot send from/);
  assert.match(emailSenderWarning('someone@outlook.com'), /outlook\.com/);
  assert.equal(emailSenderWarning('AVEN <hello@aven.example>'), undefined);
  assert.equal(emailSenderWarning('AVEN <onboarding@resend.dev>'), undefined);
  assert.equal(emailSenderWarning(undefined), undefined);
});

test('sender kinds are told apart: missing, invalid, free mailbox, Resend testing sender, own domain', async () => {
  const { emailSenderKind, integrationStatus } = await import('../dist/config/api-environment.js');
  assert.deepEqual(['', 'nonsense', 'AVEN <me@gmail.com>', 'AVEN <onboarding@resend.dev>', 'AVEN <hello@aven.example>'].map(emailSenderKind), ['missing', 'invalid', 'free_mail', 'sandbox', 'custom']);
  const on = (from, key = 're_x') => integrationStatus({ ...readApiEnvironment({ DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }), emailApiKey: key, emailFrom: from }).find((i) => i.name === 'Email').on;
  assert.deepEqual([on('AVEN <onboarding@resend.dev>'), on('AVEN <hello@aven.example>'), on('AVEN <me@gmail.com>'), on('nonsense'), on('AVEN <hello@aven.example>', '')], [true, true, false, false, false], 'email only counts as available when it can really send');
});

test('Resend’s testing-sender restriction, an invalid sender and an invalid recipient each get their own plain message', async () => {
  const fail = (status, message) => emailService((req, res) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ message })), async (baseUrl) => {
    try { await new ResendMailer({ apiKey: 're_key', from: 'AVEN <onboarding@resend.dev>', baseUrl }).send(email); } catch (e) { return e; }
  });
  const sandbox = await fail(403, 'You can only send testing emails to your own email address (me@example.com). To send emails to other recipients, please verify a domain at resend.com/domains');
  assert.match(sandbox.message, /testing sender.*your own Resend account/); assert.equal(sandbox.retry, false); assert.equal(sandbox.message.includes('example.com'), false);
  assert.match((await fail(422, 'Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.')).message, /EMAIL_FROM is not a valid sender/);
  assert.match((await fail(422, 'Invalid `to` field.')).message, /refused as invalid/);
});

test('a repeated send carries the same idempotency key, so a retry cannot email twice; the key is not part of the message', async () => {
  await emailService((req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"1"}'), async (baseUrl, requests) => {
    const mailer = new ResendMailer({ apiKey: 're_key', from: 'AVEN <hello@example.com>', baseUrl });
    await mailer.send({ ...email, idempotencyKey: 'invitation-1' }); await mailer.send({ ...email, idempotencyKey: 'invitation-1' }); await mailer.send(email);
    assert.deepEqual(requests.map((r) => r.headers['idempotency-key']), ['invitation-1', 'invitation-1', undefined]);
    assert.equal('idempotencyKey' in requests[0].body, false);
  });
});
