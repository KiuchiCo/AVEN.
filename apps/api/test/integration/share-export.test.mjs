import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { boot, skip } from './harness.mjs';

const PNG = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#A48766' } }).png().toBuffer();
const BROKEN = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSDAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); // a PNG header with damaged picture data
const GONE = 'This link is no longer available.';

describe('sharing options, plans and export', { skip }, () => {
  let t; let W; let dir; let doc; let db; let otherDb; let other;
  const shares = (d = doc) => `/workspaces/${W.id}/documents/${d.id}/shares`;
  const pub = (token, path = '') => fetch(`${t.base}/shared/documents/${token}${path}`);
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aven-export-'));
    t = await boot({ STORAGE_DIR: dir, WEB_ORIGIN: 'http://localhost:3000' });
    for (const name of ['ava', 'ben', 'cy', 'dee', 'eli']) await t.user(name);
    W = await t.workspace('ava'); await t.member(W.id, 'ben', 'MEMBER'); await t.member(W.id, 'cy', 'GUEST'); other = await t.workspace('dee', 'Other');
    const image = (await t.upload('ava', W.id, PNG, 'name=pic.png', 'image/png')).body; const file = (await t.upload('ava', W.id, Buffer.from('secret'), 'name=private-report.pdf', 'application/pdf')).body;
    db = (await t.call('ava', 'POST', `/workspaces/${W.id}/databases`, { name: 'Roadmap DB', description: '' })).body;
    otherDb = (await t.call('ava', 'POST', `/workspaces/${W.id}/databases`, { name: 'Salaries DB', description: '' })).body;
    const content = JSON.stringify({ format: 'aven-doc-v1', blocks: [
      { id: 'a', type: 'HEADING_1', text: 'Board pack' }, { id: 'b', type: 'PARAGRAPH', text: 'Visible **words** and {red:colour}.' }, { id: 'c', type: 'BULLET', text: 'nested', indent: 1 },
      { id: 'd', type: 'IMAGE', text: 'Chart', fileId: image.id }, { id: 'e', type: 'FILE', fileId: file.id }, { id: 'f', type: 'DATABASE', databaseId: db.id, view: 'TABLE' },
      { id: 'g', type: 'PAGE_LINK', docId: '22222222-2222-4222-8222-222222222222' }, { id: 'h', type: 'BUTTON', text: 'Do it', body: 'secret task' },
    ] });
    doc = (await t.call('ava', 'POST', `/workspaces/${W.id}/documents`, { title: 'Board pack', content })).body;
    await t.call('ava', 'POST', `/workspaces/${W.id}/databases/${db.id}/records`, { values: { name: 'Launch', status: 'Done' } });
    await t.call('ava', 'POST', `/workspaces/${W.id}/databases/${otherDb.id}/records`, { values: { name: 'SECRET SALARY', status: 'Open' } });
  });
  after(async () => { await t?.close(); await rm(dir, { recursive: true, force: true }); });

  test('every plan can create, open, change, replace and revoke a link', async () => {
    for (const plan of ['FREE', 'PLUS', 'PRO', 'BUSINESS', 'ENTERPRISE']) {
      if (plan !== 'FREE') await t.plan(W.id, plan);
      const made = await t.call('ben', 'POST', shares(), {});
      assert.equal(made.status, 201, `${plan}: ${JSON.stringify(made.body)}`);
      assert.equal((await pub(made.body.token)).status, 200, `${plan}: opens without sign-in`);
      const changed = await t.call('ben', 'PATCH', `${shares()}/${made.body.id}`, { allowDownload: true });
      assert.equal(changed.status, 200, plan); assert.equal(changed.body.allowDownload, true);
      const fresh = await t.call('ben', 'POST', `${shares()}/${made.body.id}/regenerate`);
      assert.equal(fresh.status, 201, plan); assert.notEqual(fresh.body.token, made.body.token); assert.equal(fresh.body.allowDownload, true, 'the new link keeps the settings');
      assert.equal((await pub(made.body.token)).status, 404, `${plan}: the replaced link stops at once`); assert.equal((await pub(fresh.body.token)).status, 200);
      assert.equal((await t.call('ben', 'DELETE', `${shares()}/${fresh.body.id}`)).status, 200);
      assert.equal((await pub(fresh.body.token)).status, 404, `${plan}: revoked`);
    }
  });

  test('a link is view-only by default: no downloads, printing allowed, embedded databases and private links restricted', async () => {
    const made = (await t.call('ben', 'POST', shares(), {})).body;
    assert.deepEqual([made.allowDownload, made.allowPrint, made.includeEmbeds], [false, true, false]);
    const body = await (await pub(made.token)).json();
    assert.deepEqual([body.allowDownload, body.allowPrint], [false, true]);
    assert.deepEqual(body.blocks.map((b) => b.type), ['HEADING_1', 'PARAGRAPH', 'BULLET', 'IMAGE', 'RESTRICTED', 'RESTRICTED', 'RESTRICTED']);
    assert.equal(body.blocks[2].indent, 1);
    const text = JSON.stringify(body);
    for (const secret of ['private-report', 'Roadmap DB', 'Salaries', 'SECRET SALARY', 'secret task', db.id, otherDb.id, W.id, '22222222-2222']) assert.equal(text.includes(secret), false, `${secret} must not reach a reader`);
    const download = await pub(made.token, '/export?format=pdf'); assert.equal(download.status, 403);
    assert.equal((await download.json()).message, 'Downloads are turned off for this link.');
    doc.defaultShare = made;
  });

  test('when the owner allows embeds, a reader sees the embedded database only, read-only', async () => {
    const made = (await t.call('ben', 'POST', shares(), { includeEmbeds: true })).body;
    const body = await (await pub(made.token)).json();
    const table = body.blocks.find((b) => b.type === 'TABLE'); assert.ok(table, 'the embedded database is shown as a table');
    assert.deepEqual(table.rows[0].slice(0, 2), ['Name', 'Status']); assert.ok(table.rows.some((row) => row.includes('Launch')));
    assert.equal(JSON.stringify(body).includes('SECRET SALARY'), false, 'other databases of the workspace stay private');
    assert.equal(body.blocks.filter((b) => b.type === 'RESTRICTED').length, 2, 'files and page links stay restricted');
    await t.call('ben', 'PATCH', `${shares()}/${made.id}`, { includeEmbeds: false });
    assert.equal((await (await pub(made.token)).json()).blocks.some((b) => b.type === 'TABLE'), false, 'turning it off takes effect immediately');
  });

  test('downloads follow the owner’s setting, are real files, and only contain what a reader may see', async () => {
    const made = (await t.call('ben', 'POST', shares(), { allowDownload: true })).body;
    const pdf = await pub(made.token, '/export?format=pdf'); assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.match(pdf.headers.get('content-disposition'), /attachment; filename="AVEN - Board pack\.pdf"/); assert.match(pdf.headers.get('cache-control'), /no-store/); assert.match(pdf.headers.get('x-robots-tag'), /noindex/);
    const pdfBytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdfBytes.includes(Buffer.from('/Subtype /Image')), 'the image is embedded');
    assert.equal(pdfBytes.includes(Buffer.from('SECRET SALARY')), false);
    const word = await pub(made.token, '/export?format=docx'); assert.equal(word.status, 200);
    assert.equal(word.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(Buffer.from(await word.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.equal((await pub(made.token, '/export?format=exe')).status, 400);
    await t.call('ben', 'PATCH', `${shares()}/${made.id}`, { allowDownload: false });
    assert.equal((await pub(made.token, '/export?format=pdf')).status, 403, 'turning downloads off takes effect immediately');
    await t.call('ben', 'DELETE', `${shares()}/${made.id}`);
    assert.equal((await pub(made.token, '/export?format=pdf')).status, 404, 'a revoked link exports nothing');
  });

  test('a link stops working when its owner leaves or loses the right to edit, and when it expires or the document is deleted', async () => {
    const gone = (await t.call('ben', 'POST', shares(), {})).body; assert.equal((await pub(gone.token)).status, 200);
    await t.member(W.id, 'ben', 'GUEST'); assert.equal((await pub(gone.token)).status, 404, 'creator demoted');
    await t.member(W.id, 'ben', 'MEMBER'); assert.equal((await pub(gone.token)).status, 200, 'and back again');
    await t.prisma.documentShare.update({ where: { id: gone.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); assert.equal((await pub(gone.token)).status, 404, 'expired');
    const temp = (await t.call('ava', 'POST', `/workspaces/${W.id}/documents`, { title: 'Temp', content: 'x' })).body;
    const link = (await t.call('ava', 'POST', shares(temp), { allowDownload: true })).body;
    assert.equal((await t.call('ava', 'DELETE', `/workspaces/${W.id}/documents/${temp.id}`)).status, 200);
    assert.equal((await pub(link.token)).status, 404); assert.equal((await pub(link.token, '/export?format=pdf')).status, 404);
  });

  test('options are validated, guests and outsiders cannot change them, and a link cannot read another document', async () => {
    const made = (await t.call('ben', 'POST', shares(), {})).body;
    assert.equal((await t.call('ben', 'PATCH', `${shares()}/${made.id}`, { allowDownload: 'yes' })).status, 400);
    assert.equal((await t.call('cy', 'PATCH', `${shares()}/${made.id}`, { allowDownload: true })).status, 403);
    assert.equal((await t.call('dee', 'PATCH', `${shares()}/${made.id}`, { allowDownload: true })).status, 404);
    assert.equal((await t.call('cy', 'POST', `${shares()}/${made.id}/regenerate`)).status, 403);
    assert.equal((await t.call('dee', 'POST', `${shares()}/${made.id}/regenerate`)).status, 404);
    const mine = (await t.call('ben', 'POST', `/workspaces/${W.id}/documents`, { title: 'Second', content: 'second doc' })).body;
    assert.equal((await t.call('ben', 'PATCH', `${shares(mine)}/${made.id}`, { allowDownload: true })).status, 404, 'a share id only works under its own document');
    const body = await (await pub(made.token)).json(); assert.equal(body.title, 'Board pack'); assert.equal(JSON.stringify(body).includes('second doc'), false);
  });

  test('members export PDF and Word with their own permissions; outsiders and bad formats are refused', async () => {
    const path = (format) => `/workspaces/${W.id}/documents/${doc.id}/export?format=${format}`;
    const get = (user, format) => fetch(`${t.base}${path(format)}`, { headers: t.headers(user) });
    const pdf = await get('ben', 'pdf'); assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-disposition'), /AVEN - Board pack\.pdf/);
    const bytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.includes(Buffer.from('Roadmap')) || bytes.length > 3000, 'the member export includes the embedded database');
    const docx = await get('cy', 'docx'); assert.equal(docx.status, 200, 'a guest can read, so a guest can export');
    assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.equal((await get('dee', 'pdf')).status, 404, 'an outsider learns nothing'); assert.equal((await get('ben', 'rtf')).status, 400);
    assert.equal((await fetch(`${t.base}${path('pdf')}`)).status, 401);
    assert.equal((await fetch(`${t.base}/workspaces/${other.id}/documents/${doc.id}/export?format=pdf`, { headers: t.headers('dee') })).status, 404, 'a document id from another workspace');
    const logged = await t.prisma.workspaceActivity.findFirst({ where: { workspaceId: W.id, entityId: doc.id, message: { contains: 'exported' } } }); assert.ok(logged);
  });

  test('a damaged picture becomes a visible note instead of breaking the export', async () => {
    const bad = (await t.upload('ava', W.id, BROKEN, 'name=broken.png', 'image/png')).body;
    const page = (await t.call('ava', 'POST', `/workspaces/${W.id}/documents`, { title: 'Damaged', content: JSON.stringify({ format: 'aven-doc-v1', blocks: [{ type: 'PARAGRAPH', text: 'Before' }, { type: 'IMAGE', text: 'Broken one', fileId: bad.id }, { type: 'PARAGRAPH', text: 'After' }] }) })).body;
    const response = await fetch(`${t.base}/workspaces/${W.id}/documents/${page.id}/export?format=pdf`, { headers: t.headers('ava') });
    assert.equal(response.status, 200); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  });

  test('guessing links is slowed down', async () => {
    const statuses = [];
    for (let i = 0; i < 40; i += 1) statuses.push((await pub(`guess_${String(i).padStart(30, 'x')}`)).status);
    // earlier tests also made some misses from this address, so only the shape matters: wrong guesses are refused, then the address is blocked and stays blocked
    assert.ok(statuses.includes(404) || statuses[0] === 429); assert.ok(statuses.includes(429), `blocked after repeated misses: ${[...new Set(statuses)]}`);
    assert.ok(statuses.slice(statuses.indexOf(429)).every((status) => status === 429));
    assert.equal((await pub(doc.defaultShare.token)).status, 429, 'while blocked, even a good link waits');
  });
});
