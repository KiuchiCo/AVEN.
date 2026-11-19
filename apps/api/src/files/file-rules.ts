import { BadRequestException } from '@nestjs/common';

/** Validates a file or folder name. Names are labels only; storage keys never contain them, so this is about sane display and downloads. */
export function cleanFileName(value: unknown, label = 'Name'): string {
  const name = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  if (!name || name.length > 255) throw new BadRequestException(`${label} must be between 1 and 255 characters.`);
  if (/[\\/\u0000-\u001f\u007f]/.test(name)) throw new BadRequestException(`${label} cannot contain slashes or control characters.`);
  if (name === '.' || name === '..') throw new BadRequestException(`${label} is not allowed.`);
  return name;
}

/** "report.pdf" → "report (1).pdf" when the name is taken. Comparison is case-insensitive. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLocaleLowerCase()));
  if (!used.has(name.toLocaleLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${stem.slice(0, 255 - extension.length - String(n).length - 3)} (${n})${extension}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new BadRequestException('Too many files share that name.');
}

/** Keeps only a plausible type/subtype; anything else is stored as a generic binary. */
export function normalizeMimeType(header: unknown): string {
  const value = typeof header === 'string' ? header.split(';')[0].trim().toLocaleLowerCase() : '';
  return value.length <= 127 && /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/.test(value) ? value : 'application/octet-stream';
}

/** Only these are ever served inline. Everything else (including SVG and HTML) is forced to download. */
const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);

export function downloadHeaders(name: string, mimeType: string, inline: boolean) {
  const safeInline = inline && inlineTypes.has(mimeType);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return {
    'Content-Type': safeInline ? mimeType : 'application/octet-stream',
    'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
}
