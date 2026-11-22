import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { createRequire } from 'node:module';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { extractTextWithOcr } from '../dist/files/text-extract.js';
import { OcrFailedError, OcrUnavailableError, ocrImage } from '../dist/files/ocr.js';
import { pdfScanImages } from '../dist/files/pdf-text.js';

const sharp = createRequire(import.meta.url)('sharp');
const haveTesseract = spawnSync('tesseract', ['--version']).status === 0;

/** A PDF whose pages are only pictures, the way a scanner makes one. */
function scannedPdf(pictures, { filter = '/DCTDecode', extra = '', color = '/DeviceRGB' } = {}) {
  const objects = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: `<< /Type /Pages /Kids [${pictures.map((_, i) => `${10 + i} 0 R`).join(' ')}] /Count ${pictures.length} >>` };
  pictures.forEach((picture, i) => {
    objects[10 + i] = `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im${i} ${30 + i} 0 R >> >> >>`;
    objects[30 + i] = Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${picture.width} /Height ${picture.height} /ColorSpace ${color} /BitsPerComponent 8 /Filter ${filter} ${extra} /Length ${picture.data.length} >>\nstream\n`), picture.data, Buffer.from('\nendstream')]);
  });
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), ...Object.entries(objects).map(([id, body]) => Buffer.concat([Buffer.from(`${id} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from('\nendobj\n')]))]);
}
const textJpeg = async (lines) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${100 + lines.length * 100}"><rect width="100%" height="100%" fill="white"/>${lines.map((line, i) => `<text x="40" y="${100 + i * 100}" font-family="Helvetica, Arial, sans-serif" font-size="64" fill="black">${line}</text>`).join('')}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

test('page pictures are found in page order, and kinds that cannot be read are counted rather than guessed', async () => {
  const one = await textJpeg(['First page']); const two = await textJpeg(['Second page']);
  const found = pdfScanImages(scannedPdf([one, two]));
  assert.deepEqual(found.images.map((image) => [image.page, image.format]), [[1, 'jpeg'], [2, 'jpeg']]); assert.equal(found.unsupported, 0);
  assert.ok(found.images[0].data.equals(one.data), 'the picture is passed on as it is');
  assert.equal(pdfScanImages(scannedPdf([one], { filter: '/CCITTFaxDecode' })).unsupported, 1, 'fax-style scans are not supported, and say so');
  const grey = { data: deflateSync(Buffer.alloc(40 * 30, 200)), width: 40, height: 30 };
  const wrapped = pdfScanImages(scannedPdf([grey], { filter: '/FlateDecode', color: '/DeviceGray' })).images[0];
  assert.equal(wrapped.format, 'png'); assert.deepEqual([...wrapped.data.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal((await sharp(wrapped.data).metadata()).width, 40, 'the wrapped picture is a valid PNG');
  assert.deepEqual(pdfScanImages(Buffer.from('%PDF-1.4\n')).images, []);
  assert.throws(() => pdfScanImages(Buffer.from('not a pdf')), /isn’t a PDF/);
});

test('a scanned PDF is read page by page in order through the OCR function, and the page count is reported', async () => {
  const pictures = [await textJpeg(['one']), await textJpeg(['two']), await textJpeg(['three'])];
  const seen = []; const result = await extractTextWithOcr('scan.pdf', 'application/pdf', scannedPdf(pictures), async (image) => { seen.push(image.length); return `page text ${seen.length}\n`; });
  assert.equal(result.text, 'page text 1\n\npage text 2\n\npage text 3'); assert.equal(result.ocrPages, 3); assert.deepEqual(seen, pictures.map((p) => p.data.length));
  const plain = await extractTextWithOcr('notes.txt', 'text/plain', Buffer.from('hello'), async () => assert.fail('no OCR for text'));
  assert.deepEqual([plain.text, plain.ocrPages], ['hello', 0]);
});

test('OCR problems become clear answers: unavailable is 503, unreadable and over-time are 400, nothing to read is 400', async () => {
  const pdf = scannedPdf([await textJpeg(['x'])]);
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', pdf, async () => { throw new OcrUnavailableError('needs Tesseract'); }), (error) => error instanceof ServiceUnavailableException && /needs Tesseract/.test(error.message));
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', pdf, async () => { throw new OcrFailedError('That page could not be read.'); }), (error) => error instanceof BadRequestException);
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', pdf, async () => '   \n'), /No text could be read/);
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', scannedPdf([await textJpeg(['a']), await textJpeg(['b'])]), async () => { await new Promise((r) => setTimeout(r, 30)); return 'text'; }, 10), /took too long/);
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', scannedPdf([await textJpeg(['x'])], { filter: '/JBIG2Decode' }), async () => 'x'), /cannot read yet/);
  await assert.rejects(extractTextWithOcr('s.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'), async () => 'x'), /no scanned page|no readable text/i);
});

test('security: the OCR program is run without a shell, a bad language setting is refused, and a missing program is reported', async () => {
  await assert.rejects(ocrImage(Buffer.from('x'), { languages: 'eng; rm -rf /' }), OcrFailedError);
  await assert.rejects(ocrImage(Buffer.from('x'), { command: '/definitely/not/installed' }), OcrUnavailableError);
  process.env.OCR_DISABLED = 'true'; try { await assert.rejects(ocrImage(Buffer.from('x')), OcrUnavailableError); } finally { delete process.env.OCR_DISABLED; }
  await assert.rejects(ocrImage(Buffer.from('not a picture'), { command: 'sleep', languages: 'eng', timeoutMs: 100 }), OcrFailedError);
});

test('with Tesseract installed, a scanned PDF is really read', { skip: haveTesseract ? false : 'Tesseract is not installed on this machine' }, async () => {
  const result = await extractTextWithOcr('scan.pdf', 'application/pdf', scannedPdf([await textJpeg(['Quarterly invoice summary', 'Total due 4210 dollars']), await textJpeg(['Second page about gardens'])]));
  assert.equal(result.ocrPages, 2);
  assert.match(result.text, /Quarterly invoice summary/i); assert.match(result.text, /Total due 4210/i); assert.match(result.text, /Second page about gardens/i);
  assert.ok(result.text.indexOf('Quarterly') < result.text.indexOf('gardens'), 'pages stay in order');
  assert.rejects(ocrImage(Buffer.from('garbage bytes that are not an image')), OcrFailedError);
});
