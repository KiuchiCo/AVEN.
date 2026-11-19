import { createServer } from 'node:http';

/**
 * A small stand-in for Google Calendar and Microsoft Graph: OAuth token endpoints plus the event calls AVEN uses,
 * with real version markers (ETags), If-Match checks, paging and deletions. Tests drive it through `google` and `graph`.
 */
export async function startStub() {
  const make = (kind) => ({ kind, events: new Map(), counter: 0, tokens: 0, refuseRefresh: false, calls: [], email: `${kind}@calendar.test` });
  const google = make('google'); const graph = make('graph');
  const clock = () => new Date().toISOString();

  const body = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });
  const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
  const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub'); const raw = await body(req); const path = url.pathname;
    const side = path.startsWith('/google') ? google : path.startsWith('/graph') ? graph : null;
    if (!side) return json(res, 404, {});
    side.calls.push(`${req.method} ${path}${url.search ? '?…' : ''}`);
    const rest = path.replace(/^\/(google|graph)/, '');

    // ---- OAuth ----
    if (rest === '/token') {
      const form = new URLSearchParams(raw);
      if (form.get('grant_type') === 'refresh_token' && side.refuseRefresh) return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been revoked.' });
      side.tokens += 1;
      return json(res, 200, { access_token: `${side.kind}-access-${side.tokens}`, refresh_token: form.get('grant_type') === 'authorization_code' ? `${side.kind}-refresh` : undefined, expires_in: side.shortLived ? 1 : 3600, id_token: side.kind === 'google' ? idToken(side.email) : undefined });
    }
    if (!(req.headers.authorization ?? '').startsWith('Bearer ')) return json(res, 401, { error: { message: 'no token' } });

    if (side.kind === 'google') {
      if (rest === '/calendars/primary/events' && req.method === 'GET') {
        const items = [...side.events.values()]; const size = 2; const start = Number(url.searchParams.get('pageToken') ?? 0);
        const page = items.slice(start, start + size);
        return json(res, 200, { items: page, ...(start + size < items.length ? { nextPageToken: String(start + size) } : {}) });
      }
      if (rest === '/calendars/primary/events' && req.method === 'POST') { const e = JSON.parse(raw); const id = `new-g${++side.counter}`; const item = { id, etag: `"1-${id}"`, updated: clock(), status: 'confirmed', ...e }; side.events.set(id, item); return json(res, 200, item); }
      const match = /^\/calendars\/primary\/events\/(.+)$/.exec(rest);
      if (match) {
        const id = decodeURIComponent(match[1]); const item = side.events.get(id);
        if (req.method === 'DELETE') { side.events.delete(id); return json(res, item ? 204 : 410); }
        if (!item) return json(res, 404, { error: { message: 'gone' } });
        if (req.method === 'PUT') {
          if (req.headers['if-match'] && req.headers['if-match'] !== item.etag) return json(res, 412, { error: { message: 'etag mismatch' } });
          const next = { ...JSON.parse(raw), id, etag: `"${Number(item.etag.split('-')[0].slice(1)) + 1}-${id}"`, updated: clock(), status: 'confirmed' }; side.events.set(id, next); return json(res, 200, next);
        }
      }
    } else {
      if (rest === '/me' && req.method === 'GET') return json(res, 200, { mail: side.email });
      if (rest === '/me/calendarView' && req.method === 'GET') {
        const items = [...side.events.values()]; const size = 2; const start = Number(url.searchParams.get('skip') ?? 0);
        const page = items.slice(start, start + size);
        return json(res, 200, { value: page, ...(start + size < items.length ? { '@odata.nextLink': `http://${req.headers.host}/graph/me/calendarView?skip=${start + size}` } : {}) });
      }
      if (rest === '/me/events' && req.method === 'POST') { const e = JSON.parse(raw); const id = `new-m${++side.counter}`; const item = { id, '@odata.etag': `W/"1-${id}"`, lastModifiedDateTime: clock(), isCancelled: false, bodyPreview: e.body?.content ?? '', ...e }; side.events.set(id, item); return json(res, 201, item); }
      const match = /^\/me\/events\/(.+)$/.exec(rest);
      if (match) {
        const id = decodeURIComponent(match[1]); const item = side.events.get(id);
        if (req.method === 'DELETE') { side.events.delete(id); return json(res, item ? 204 : 404); }
        if (!item) return json(res, 404, { error: { message: 'gone' } });
        if (req.method === 'PATCH') {
          if (req.headers['if-match'] && req.headers['if-match'] !== item['@odata.etag']) return json(res, 412, { error: { message: 'etag mismatch' } });
          const e = JSON.parse(raw); const next = { ...item, ...e, bodyPreview: e.body?.content ?? item.bodyPreview, '@odata.etag': `W/"${Number(item['@odata.etag'].match(/"(\d+)-/)[1]) + 1}-${id}"`, lastModifiedDateTime: clock() }; side.events.set(id, next); return json(res, 200, next);
        }
      }
    }
    return json(res, 404, { error: { message: `stub has no ${req.method} ${rest}` } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Edits an event on the "provider" side, the way someone using Google Calendar would. */
  const edit = (side, id, changes) => {
    const item = side.events.get(id);
    if (side.kind === 'google') { const n = Number(item.etag.split('-')[0].slice(1)) + 1; side.events.set(id, { ...item, ...changes, etag: `"${n}-${id}"`, updated: clock() }); }
    else { const n = Number(item['@odata.etag'].match(/"(\d+)-/)[1]) + 1; side.events.set(id, { ...item, ...changes, '@odata.etag': `W/"${n}-${id}"`, lastModifiedDateTime: clock() }); }
  };
  const addGoogle = (id, summary, start, end, extra = {}) => google.events.set(id, { id, etag: `"1-${id}"`, updated: clock(), status: 'confirmed', summary, start: { dateTime: start }, end: { dateTime: end }, ...extra });
  const addGraph = (id, subject, start, end, extra = {}) => graph.events.set(id, { id, '@odata.etag': `W/"1-${id}"`, lastModifiedDateTime: clock(), isCancelled: false, subject, start: { dateTime: start.replace('Z', ''), timeZone: 'UTC' }, end: { dateTime: end.replace('Z', ''), timeZone: 'UTC' }, isAllDay: false, ...extra });
  return { base, google, graph, edit, addGoogle, addGraph, close: () => new Promise((resolve) => server.close(resolve)) };
}
