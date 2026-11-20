import { inflateRawSync } from 'node:zlib';

/** Most a single unpacked part may be, so a zip bomb can't exhaust memory. */
const MAX_PART_BYTES = 20 * 1024 * 1024;

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

/** Lists the entries of a zip from its central directory. Returns null if `bytes` isn't a readable zip. */
function zipEntries(bytes: Buffer): ZipEntry[] | null {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i -= 1) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) return null;
  const count = bytes.readUInt16LE(end + 10);
  let pos = bytes.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50) return null;
    const nameLength = bytes.readUInt16LE(pos + 28), extraLength = bytes.readUInt16LE(pos + 30), commentLength = bytes.readUInt16LE(pos + 32);
    entries.push({ name: bytes.toString('utf8', pos + 46, pos + 46 + nameLength), method: bytes.readUInt16LE(pos + 10), compressedSize: bytes.readUInt32LE(pos + 20), offset: bytes.readUInt32LE(pos + 42) });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(bytes: Buffer, entry: ZipEntry): string {
  const o = entry.offset;
  if (o + 30 > bytes.length || bytes.readUInt32LE(o) !== 0x04034b50) throw new Error('Corrupt zip entry.');
  const start = o + 30 + bytes.readUInt16LE(o + 26) + bytes.readUInt16LE(o + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString('utf8');
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString('utf8');
  throw new Error('Unsupported zip compression.');
}

const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
  if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''; }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()] ?? '';
});
const textRuns = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => decode(m[1])).join('');
const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1]);

function wordText(xml: string) {
  return xml.split(/<\/w:p>/).map((paragraph) => decode([...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<\/w:tc>/g)].map((m) => (m[1] !== undefined ? m[1] : m[0].startsWith('<w:br') ? '\n' : '\t')).join(''))).join('\n');
}
const slideText = (xml: string) => xml.split(/<\/a:p>/).map((paragraph) => textRuns(paragraph, 'a:t')).filter(Boolean).join('\n');

function sheetText(xml: string, shared: string[]) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = new Map<number, string>();
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cell[1])?.[1]; if (!ref || cell[2] === undefined) continue;
      const column = [...ref].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const type = /t="(\w+)"/.exec(cell[1])?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1];
      const text = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? textRuns(cell[2], 't') : value === undefined ? '' : decode(value);
      if (text) cells.set(column, text);
    }
    if (!cells.size) return '';
    const last = Math.max(...cells.keys());
    return Array.from({ length: last }, (_, i) => cells.get(i + 1) ?? '').join('\t');
  }).filter(Boolean).join('\n');
}

export const OFFICE_EXTENSIONS = ['docx', 'pptx', 'xlsx'] as const;

/** Plain text of a .docx, .pptx or .xlsx file, or null when it isn't a readable Office zip. Macros, images and formatting are ignored. */
export function officeToText(extension: string, bytes: Buffer): string | null {
  try {
    const entries = zipEntries(bytes);
    if (!entries) return null;
    const read = (name: string) => { const entry = entries.find((item) => item.name === name); return entry ? readEntry(bytes, entry) : null; };
    if (extension === 'docx') { const xml = read('word/document.xml'); return xml === null ? null : wordText(xml); }
    if (extension === 'pptx') {
      const slides = entries.map((entry) => entry.name).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(byNumber);
      return slides.length ? slides.map((name, i) => `Slide ${i + 1}\n${slideText(read(name)!)}`).join('\n\n') : null;
    }
    if (extension === 'xlsx') {
      const sharedXml = read('xl/sharedStrings.xml');
      const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1], 't')) : [];
      const sheets = entries.map((entry) => entry.name).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(byNumber);
      return sheets.length ? sheets.map((name, i) => [`Sheet ${i + 1}`, sheetText(read(name)!, shared)]).filter(([, rows]) => rows).map(([title, rows]) => `${title}\n${rows}`).join('\n\n') : null;
    }
  } catch { return null; }
  return null;
}
