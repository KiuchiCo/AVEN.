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

  test('a scanned PDF (pictures only) is read with OCR into a Knowledge entry, in page order, when Tesseract is installed; otherwise the answer says so', async () => {
    const { createRequire } = await import('node:module'); const { spawnSync } = await import('node:child_process');
    const sharp = createRequire(import.meta.url)('sharp'); const have = spawnSync('tesseract', ['--version']).status === 0;
    const page = async (line) => { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><rect width="100%" height="100%" fill="white"/><text x="40" y="120" font-family="Helvetica, Arial, sans-serif" font-size="64" fill="black">${line}</text></svg>`; const { data, info } = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }); return { data, ...info }; };
    const pictures = [await page('Scanned contract alpha'), await page('Second page bravo')];
    const objects = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: `<< /Type /Pages /Kids [10 0 R 11 0 R] /Count 2 >>` };
    pictures.forEach((p, i) => { objects[10 + i] = `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im${i} ${30 + i} 0 R >> >> >>`; objects[30 + i] = Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`), p.data, Buffer.from('\nendstream')]); });
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), ...Object.entries(objects).map(([id, body]) => Buffer.concat([Buffer.from(`${id} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from('\nendobj\n')]))]);
    const saved = (await t.upload('pia', W.id, pdf, 'name=scanned.pdf', 'application/pdf')).body;
    const made = await t.call('pia', 'POST', `/workspaces/${W.id}/files/${saved.id}/knowledge`, {});
    if (!have) { assert.equal(made.status, 503); assert.match(made.body.message, /Tesseract/); return; }
    assert.equal(made.status, 201, JSON.stringify(made.body)); assert.equal(made.body.ocrPages, 2);
    const entry = ((await t.call('pia', 'GET', `/workspaces/${W.id}/knowledge?q=bravo`)).body.items).find((item) => item.id === made.body.id);
    assert.ok(entry, 'the scanned text is searchable'); assert.match(entry.content, /Scanned contract alpha/i); assert.ok(entry.content.toLowerCase().indexOf('alpha') < entry.content.toLowerCase().indexOf('bravo'));
  });
});
