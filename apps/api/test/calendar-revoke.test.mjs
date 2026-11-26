import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { GoogleCalendar, MicrosoftCalendar } from '../dist/calendar-sync/providers.js';

test('disconnecting Google asks Google to revoke the grant, ignores a failure, and Microsoft has no revoke call', async () => {
  const seen = [];
  const server = createServer((req, res) => { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { seen.push({ method: req.method, url: req.url, body }); res.writeHead(seen.length === 1 ? 200 : 500); res.end(); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const google = new GoogleCalendar({ clientId: 'c', clientSecret: 's', authUrl: `${base}/auth`, tokenUrl: `${base}/token` });
    await google.revoke('refresh-1');
    assert.deepEqual([seen[0].method, seen[0].url, seen[0].body], ['POST', '/revoke', 'token=refresh-1']);
    await google.revoke('refresh-2'); // a failing provider must not throw
    assert.equal(seen.length, 2);
    assert.equal(new MicrosoftCalendar({ clientId: 'c', clientSecret: 's', authUrl: `${base}/a`, tokenUrl: `${base}/t` }).revoke, undefined);
  } finally { server.closeAllConnections?.(); server.close(); }
});
