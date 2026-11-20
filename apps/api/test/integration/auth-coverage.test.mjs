import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** Routes that are meant to be reachable without signing in, and why. Anything else must answer 401. */
const publicRoutes = new Map([
  ['GET /api/v1/health', 'liveness probe'],
  ['GET /api/v1/health/ready', 'readiness probe'],
  ['POST /api/v1/billing/webhook', 'called by the payment provider; protected by its signature'],
  ['GET /api/v1/integrations/calendar/callback', 'the calendar provider sends the browser here after sign-in; the signed, expiring state proves who started it'],
  ['GET /api/v1/shared/documents/:token', 'a document share link: the secret in the address is the credential, and it is read-only for one document'],
  ['GET /api/v1/shared/documents/:token/images/:fileId', 'an image used by a shared document, served only if that document’s own image blocks use it'],
  ['GET /api/v1/invitations/:token', 'shows the invited person which workspace invited them; the unguessable token is the credential'],
]);

/** Bodies for the few routes that reject an empty body before anything else, so the access check is what gets tested. */
const bodies = new Map([
  ['PATCH /api/v1/workspaces/:workspaceId/activity/:activityId/read', { read: true }],
  ['POST /api/v1/workspaces/:workspaceId/tasks/:taskId/collaboration/checklist/:itemId/move', { direction: 'UP' }],
  ['POST /api/v1/workspaces/:workspaceId/ai/conversations/:conversationId/actions/:actionId', { decision: 'confirm' }],
]);
const bodyFor = (method, path) => (['GET', 'HEAD', 'DELETE'].includes(method) ? undefined : JSON.stringify(bodies.get(`${method} ${path}`) ?? {}));

/** Routes a guest may call even though they are not GET: they change only the guest's own state or read through POST. */
const guestAllowed = [
  'POST /api/v1/workspaces/:workspaceId/activity/read-all',
  'PATCH /api/v1/workspaces/:workspaceId/activity/',
  'POST /api/v1/workspaces/:workspaceId/ai/conversations',
  'POST /api/v1/workspaces/:workspaceId/channels/:channelId/read',
  'POST /api/v1/workspaces/:workspaceId/members/leave',
  'POST /api/v1/workspaces/:workspaceId/documents/:documentId/focus',
  'POST /api/v1/workspaces/:workspaceId/favourites',
  'DELETE /api/v1/workspaces/:workspaceId/favourites',
  'POST /api/v1/workspaces/:workspaceId/activity/:activityId/dismiss',
  'DELETE /api/v1/workspaces/:workspaceId/ai/conversations/:conversationId',
];

describe('every route requires sign-in unless listed as public', { skip }, () => {
  let t; let routes;
  before(async () => {
    t = await boot();
    const stack = t.app.getHttpAdapter().getInstance().router.stack;
    routes = stack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route.path })));
  });
  after(async () => { await t?.close(); });

  test('the route list was found', () => assert.ok(routes.length > 150, `found ${routes.length} routes`));

  test('no route answers an anonymous request with anything but 401, except the listed public ones', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const unexpected = [];
    for (const { method, path } of routes) {
      const key = `${method} ${path}`;
      const url = `${t.base.replace('/api/v1', '')}${path.replace(/:[A-Za-z]+/g, id)}`;
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: ['GET', 'DELETE'].includes(method) ? undefined : '{}' }).catch((error) => ({ status: `error ${error.message}` }));
      if (publicRoutes.has(key)) continue;
      if (response.status !== 401) unexpected.push(`${key} -> ${response.status}`);
    }
    assert.deepEqual(unexpected, [], 'these routes are reachable without signing in');
  });

  test('a signed-in outsider is refused on every workspace route', async () => {
    await t.user('outsider'); await t.user('owner'); const W = await t.workspace('owner');
    const unexpected = [];
    for (const { method, path } of routes.filter((route) => route.path.includes(':workspaceId'))) {
      const url = path.replace(':workspaceId', W.id).replace(/:[A-Za-z]+/g, '11111111-1111-4111-8111-111111111111');
      const response = await fetch(`${t.base.replace('/api/v1', '')}${url}`, { method, headers: t.headers('outsider', method === 'POST' && url.includes('/files/upload') ? { 'content-type': 'application/octet-stream' } : {}), body: bodyFor(method, path) });
      if (response.status !== 404) unexpected.push(`${method} ${path} -> ${response.status}`);
    }
    assert.deepEqual(unexpected, [], 'these workspace routes did not answer an outsider with 404');
  });

  test('guests are refused on every route that changes something', async () => {
    await t.user('gwen'); await t.user('olga'); const W = await t.workspace('olga'); await t.member(W.id, 'gwen', 'GUEST');
    const seen = [];
    // Leaving really removes the guest, so that route is called last.
    const leaves = (route) => route.path.endsWith('/members/leave');
    for (const { method, path } of routes.filter((route) => route.path.includes(':workspaceId') && !['GET', 'HEAD'].includes(route.method)).sort((a, b) => Number(leaves(a)) - Number(leaves(b)))) {
      const url = path.replace(':workspaceId', W.id).replace(/:[A-Za-z]+/g, '11111111-1111-4111-8111-111111111111');
      const response = await fetch(`${t.base.replace('/api/v1', '')}${url}`, { method, headers: t.headers('gwen', url.includes('/files/upload') ? { 'content-type': 'application/octet-stream' } : {}), body: bodyFor(method, path) });
      if (response.status !== 403) seen.push(`${method} ${path} -> ${response.status}`);
    }
    assert.deepEqual(seen.filter((line) => !guestAllowed.some((allowed) => line.startsWith(allowed))), [], 'these routes let a guest through to the action');
  });
});
