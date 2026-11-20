import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('PDF files become Knowledge entries', { skip }, () => {
  let t; let W;
  before(async () => { t = await boot(); await t.user('pia'); W = await t.workspace('pia'); });
  after(async () => { await t?.close(); });

  test('a text-based PDF is read into a Knowledge entry; an image-only one is refused clearly', async () => {
    const pdf = readFileSync(new URL('../fixtures/quartz-text.pdf', import.meta.url));
    const saved = (await t.upload('pia', W.id, pdf, 'name=plan.pdf', 'application/pdf')).body;
    const made = await t.call('pia', 'POST', `/workspaces/${W.id}/files/${saved.id}/knowledge`, {});
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.title, 'plan');
    const found = (await t.call('pia', 'GET', `/workspaces/${W.id}/knowledge?q=Alpha`)).body;
    const item = (found.items ?? found).find((entry) => entry.id === made.body.id);
    assert.ok(item, 'the new entry is searchable'); assert.match(item.content, /Revenue grew by 12 percent/);
    const scan = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF');
    const empty = (await t.upload('pia', W.id, scan, 'name=scan.pdf', 'application/pdf')).body;
    const refused = await t.call('pia', 'POST', `/workspaces/${W.id}/files/${empty.id}/knowledge`, {});
    assert.equal(refused.status, 400); assert.match(refused.body.message, /no readable text in that PDF/);
  });
});
