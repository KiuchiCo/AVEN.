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

/** What the first bytes of a file say it is, for the types that may be shown inline. Null when they match none of them. */
export function sniffMime(head: Buffer): string | null {
  const starts = (...bytes: number[]) => bytes.every((byte, i) => head[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (head.subarray(0, 1024).includes('%PDF-')) return 'application/pdf';
  return null;
}

/**
 * The type to store for an upload. The browser's word for what a file is can be wrong or hostile, so the bytes decide for the types shown inline:
 * a file that says it is an image but is not one, or text that is really binary, is kept as a plain download.
 */
export function reconcileMime(declared: string, head: Buffer): string {
  const sniffed = sniffMime(head);
  if (sniffed) return sniffed;
  if (inlineTypes.has(declared) && declared !== 'text/plain') return 'application/octet-stream';
  if (declared === 'text/plain' && head.includes(0)) return 'application/octet-stream';
  return declared;
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
