import { spawn } from 'node:child_process';

export class OcrUnavailableError extends Error {}
export class OcrFailedError extends Error {}

export type OcrOptions = { command?: string; languages?: string; timeoutMs?: number };

/** What the OCR engine may print before it is cut off: a page of text is far smaller. */
const MAX_OUTPUT = 2 * 1024 * 1024;

/**
 * Reads the text in one picture with a local Tesseract program. The picture goes in on standard input and the text comes out on standard output: nothing is written to disk
 * and nothing leaves this machine (no OCR service is called). The program runs without a shell, with a minimal environment, one thread, and is killed if it takes too long.
 * Set OCR_COMMAND for another path, OCR_LANGUAGES (for example "eng+fra") for installed language data, OCR_DISABLED=true to turn OCR off.
 */
export function ocrImage(image: Buffer, options: OcrOptions = {}): Promise<string> {
  const command = options.command ?? process.env.OCR_COMMAND?.trim() ?? 'tesseract';
  const languages = options.languages ?? process.env.OCR_LANGUAGES?.trim() ?? 'eng';
  if (process.env.OCR_DISABLED === 'true') return Promise.reject(new OcrUnavailableError('Reading scanned documents is switched off on this server.'));
  if (!/^[A-Za-z0-9_+-]{2,40}$/.test(languages)) return Promise.reject(new OcrFailedError('OCR_LANGUAGES is not valid.'));
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['stdin', 'stdout', '-l', languages, '--psm', '3'], { stdio: ['pipe', 'pipe', 'ignore'], shell: false, env: { PATH: process.env.PATH ?? '', OMP_THREAD_LIMIT: '1', ...(process.env.TESSDATA_PREFIX ? { TESSDATA_PREFIX: process.env.TESSDATA_PREFIX } : {}), LC_ALL: 'C' } });
    const chunks: Buffer[] = []; let size = 0; let done = false;
    const finish = (error: Error | null, text = '') => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(text); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new OcrFailedError('Reading this page took too long.')); }, options.timeoutMs ?? 60_000);
    child.on('error', (error) => finish((error as NodeJS.ErrnoException).code === 'ENOENT' ? new OcrUnavailableError('Reading scanned documents needs the Tesseract OCR program, which is not installed on this server.') : new OcrFailedError('The OCR program could not be started.')));
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_OUTPUT) { child.kill('SIGKILL'); finish(new OcrFailedError('The OCR result was too large.')); return; } chunks.push(chunk); });
    child.on('close', (code) => finish(code === 0 ? null : new OcrFailedError('That page could not be read.'), Buffer.concat(chunks).toString('utf8')));
    child.stdin.on('error', () => undefined); // the program may stop reading early
    child.stdin.end(image);
  });
}
