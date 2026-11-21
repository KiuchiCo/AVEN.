import { inflateSync } from 'node:zlib';

/** What can't be read from a PDF is reported with a plain reason. */
export class PdfError extends Error {}

type Obj = { dict: string; stream?: Buffer };
const MAX_STREAM = 20 * 1024 * 1024;
const MAX_PAGES = 500;
/** Most a whole PDF may unpack to. Each stream is capped, but hundreds of small streams that each unpack to the cap would otherwise add up to gigabytes. */
const MAX_UNPACKED = 64 * 1024 * 1024;
let unpacked = 0; // reset at the start of each read; the reader is synchronous, so reads never overlap

const latin = (bytes: Buffer) => bytes.toString('latin1');

/** Value of `/Key` in a dictionary's text: a reference, an inline `<<…>>`, an array, a name or a number. Null when absent. */
function entry(dict: string, key: string): string | null {
  const match = new RegExp(`/${key}(?![A-Za-z0-9])\\s*`).exec(dict);
  if (!match) return null;
  let i = match.index + match[0].length;
  const start = i;
  if (dict.startsWith('<<', i)) { let depth = 0; for (; i < dict.length; i += 1) { if (dict.startsWith('<<', i)) { depth += 1; i += 1; } else if (dict.startsWith('>>', i)) { depth -= 1; i += 1; if (!depth) return dict.slice(start, i + 1); } } return dict.slice(start); }
  if (dict[i] === '[') { const end = dict.indexOf(']', i); return dict.slice(start, end < 0 ? undefined : end + 1); }
  const ref = /^\d+\s+\d+\s+R/.exec(dict.slice(i)); if (ref) return ref[0];
  const token = /^[^\s/<>[\]]+|^\/[^\s/<>[\]]*/.exec(dict.slice(i));
  return token ? token[0] : null;
}
const refId = (value: string | null) => { const m = value && /^(\d+)\s+\d+\s+R/.exec(value.trim()); return m ? Number(m[1]) : null; };
const refsIn = (value: string | null) => [...(value ?? '').matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));

function decodeStream(dict: string, data: Buffer): Buffer | null {
  const out = inflateStream(dict, data);
  if (out && out !== data) { unpacked += out.length; if (unpacked > MAX_UNPACKED) throw new PdfError('That PDF is too large or complex to read.'); }
  return out;
}

function inflateStream(dict: string, data: Buffer): Buffer | null {
  const filter = entry(dict, 'Filter') ?? '';
  if (!filter) return data;
  if (/FlateDecode|\/Fl\b/.test(filter) && !/\/(LZW|ASCII85|RunLength|DCT|JPX|CCITT|JBIG2)/.test(filter)) {
    try { return inflateSync(data, { maxOutputLength: MAX_STREAM }); } catch { try { return inflateSync(data, { maxOutputLength: MAX_STREAM, finishFlush: 2 /* Z_SYNC_FLUSH: tolerate truncated data */ }); } catch { return null; } }
  }
  return null;
}

/** Every `N G obj … endobj`, plus the objects packed inside object streams. */
function readObjects(file: Buffer): Map<number, Obj> {
  const text = latin(file); const objects = new Map<number, Obj>();
  const header = /(\d+)\s+(\d+)\s+obj\b/g; let m: RegExpExecArray | null;
  while ((m = header.exec(text))) {
    const id = Number(m[1]); const bodyStart = m.index + m[0].length;
    const streamAt = text.indexOf('stream', bodyStart); const endAt = text.indexOf('endobj', bodyStart);
    if (endAt < 0) break;
    if (streamAt >= 0 && streamAt < endAt && /^stream\r?\n|^stream\r/.test(text.slice(streamAt, streamAt + 8))) {
      const dict = text.slice(bodyStart, streamAt);
      const dataStart = streamAt + (text[streamAt + 6] === '\r' && text[streamAt + 7] === '\n' ? 8 : 7);
      const lengthEntry = entry(dict, 'Length'); const direct = lengthEntry && /^\d+$/.test(lengthEntry) ? Number(lengthEntry) : null;
      const closing = text.indexOf('endstream', dataStart);
      const dataEnd = direct !== null && text.startsWith('endstream', dataStart + direct) ? dataStart + direct : closing >= 0 ? closing : endAt;
      objects.set(id, { dict, stream: file.subarray(dataStart, dataEnd) });
      header.lastIndex = Math.max(dataEnd, header.lastIndex);
    } else { objects.set(id, { dict: text.slice(bodyStart, endAt) }); header.lastIndex = endAt; }
  }
  for (const object of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(object.dict) || !object.stream) continue;
    const data = decodeStream(object.dict, object.stream); if (!data) continue;
    const body = latin(data); const count = Number(entry(object.dict, 'N')); const first = Number(entry(object.dict, 'First'));
    const pairs = [...body.slice(0, first).matchAll(/(\d+)\s+(\d+)/g)].slice(0, count);
    pairs.forEach((pair, index) => { const from = first + Number(pair[2]); const to = index + 1 < pairs.length ? first + Number(pairs[index + 1][2]) : body.length; objects.set(Number(pair[1]), { dict: body.slice(from, to) }); });
  }
  return objects;
}

/** ToUnicode CMap → code → text. */
function parseCMap(data: string): { map: Map<number, string>; width: number } {
  const map = new Map<number, string>(); let width = 1;
  const unicode = (hex: string) => { const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex'); let out = ''; for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes.readUInt16BE(i)); return out; };
  for (const block of data.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) { width = Math.max(width, pair[1].length / 2); map.set(parseInt(pair[1], 16), unicode(pair[2])); }
  for (const block of data.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const item of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const low = parseInt(item[1], 16); const high = Math.min(parseInt(item[2], 16), low + 65535); width = Math.max(width, item[1].length / 2);
      if (item[3].startsWith('[')) [...item[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((entryValue, index) => { if (low + index <= high) map.set(low + index, unicode(entryValue[1])); });
      else { const base = unicode(item[3].slice(1, -1)); for (let code = low; code <= high; code += 1) map.set(code, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + code - low)); }
    }
  }
  return { map, width };
}

type Font = { cmap?: { map: Map<number, string>; width: number }; twoByte: boolean; decoder: TextDecoder };

function loadFont(objects: Map<number, Obj>, id: number): Font {
  const dict = objects.get(id)?.dict ?? '';
  const encoding = entry(dict, 'Encoding') ?? '';
  const font: Font = { twoByte: /\/Type0/.test(dict), decoder: new TextDecoder(/MacRoman/.test(encoding) ? 'macintosh' : 'windows-1252') };
  const toUnicode = objects.get(refId(entry(dict, 'ToUnicode')) ?? -1);
  if (toUnicode?.stream) { const data = decodeStream(toUnicode.dict, toUnicode.stream); if (data) font.cmap = parseCMap(latin(data)); }
  return font;
}

function decodeText(font: Font | undefined, bytes: Buffer): string {
  if (font?.cmap) {
    const width = Math.max(font.cmap.width, font.twoByte ? 2 : 1); let out = '';
    for (let i = 0; i + width <= bytes.length; i += width) { let code = 0; for (let k = 0; k < width; k += 1) code = code * 256 + bytes[i + k]; out += font.cmap.map.get(code) ?? ''; }
    return out;
  }
  if (font?.twoByte) return ''; // CID font with no map: the characters can't be recovered
  return (font?.decoder ?? new TextDecoder('windows-1252')).decode(bytes);
}

/** Reads one string token starting at `i` (the opening bracket); returns the bytes and the index after it. */
function readString(s: string, i: number): { bytes: Buffer; next: number } {
  if (s[i] === '<') { const end = s.indexOf('>', i); const hex = s.slice(i + 1, end < 0 ? undefined : end).replace(/[^0-9a-fA-F]/g, ''); return { bytes: Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex'), next: end < 0 ? s.length : end + 1 }; }
  const out: number[] = []; let depth = 1; i += 1;
  for (; i < s.length && depth; i += 1) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      if (n === 'n') out.push(10); else if (n === 'r') out.push(13); else if (n === 't') out.push(9); else if (n === 'b') out.push(8); else if (n === 'f') out.push(12);
      else if (n >= '0' && n <= '7') { let oct = n; while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i]; out.push(parseInt(oct, 8) & 255); }
      else if (n === '\r' && s[i + 1] === '\n') i += 1; else if (n !== '\n' && n !== '\r') out.push(n.charCodeAt(0) & 255);
    } else if (c === '(') { depth += 1; out.push(40); } else if (c === ')') { depth -= 1; if (depth) out.push(41); } else out.push(c.charCodeAt(0) & 255);
  }
  return { bytes: Buffer.from(out), next: i };
}

function contentText(content: string, fonts: Map<string, Font>): string {
  let out = ''; let font: Font | undefined; let lastY: number | null = null; const stack: (number | string | Buffer | (number | Buffer)[])[] = [];
  const addText = (value: string) => { out += value; };
  const lineBreak = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const space = () => { if (out && !/\s$/.test(out)) out += ' '; };
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === '(' || c === '<' && content[i + 1] !== '<') { const s = readString(content, i); stack.push(s.bytes); i = s.next; continue; }
    if (c === '[') {
      const items: (number | Buffer)[] = []; i += 1;
      while (i < content.length && content[i] !== ']') {
        if (content[i] === '(' || content[i] === '<') { const s = readString(content, i); items.push(s.bytes); i = s.next; }
        else { const n = /^-?\d*\.?\d+/.exec(content.slice(i, i + 24)); if (n) { items.push(Number(n[0])); i += n[0].length; } else i += 1; }
      }
      stack.push(items); i += 1; continue;
    }
    if (c === '%') { while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i += 1; continue; }
    if (c === '/') { const n = /^\/[^\s/<>[\]()%]*/.exec(content.slice(i, i + 80)); stack.push(n ? n[0] : '/'); i += n ? n[0].length : 1; continue; }
    if (c === '<' || c === '>' || c === ']' || c === '{' || c === '}') { i += c === '<' || c === '>' ? 2 : 1; continue; }
    const token = /^[^\s/<>[\]()%]+/.exec(content.slice(i, i + 40));
    if (!token) { i += 1; continue; }
    i += token[0].length; const op = token[0];
    if (/^[-+]?\d*\.?\d+$/.test(op)) { stack.push(Number(op)); continue; }
    const numbers = stack.filter((item): item is number => typeof item === 'number');
    switch (op) {
      case 'BT': lastY = null; break;
      case 'ET': lineBreak(); break;
      case 'Tf': { const name = stack.find((item): item is string => typeof item === 'string' && item.startsWith('/')); font = name ? fonts.get(name.slice(1)) : undefined; break; }
      case 'Tm': if (numbers.length >= 6) { const y = numbers[numbers.length - 1]; if (lastY !== null && Math.abs(y - lastY) > 0.5) lineBreak(); else if (lastY !== null) space(); lastY = y; } break;
      case 'Td': case 'TD': if (numbers.length >= 2) { const [tx, ty] = numbers.slice(-2); if (Math.abs(ty) > 0.5) lineBreak(); else if (tx > 0) space(); } break;
      case 'T*': lineBreak(); break;
      case 'Tj': { const s = stack[stack.length - 1]; if (Buffer.isBuffer(s)) addText(decodeText(font, s)); break; }
      case "'": case '"': { lineBreak(); const s = stack[stack.length - 1]; if (Buffer.isBuffer(s)) addText(decodeText(font, s)); break; }
      case 'TJ': { const items = stack[stack.length - 1]; if (Array.isArray(items)) for (const item of items) { if (Buffer.isBuffer(item)) addText(decodeText(font, item)); else if (item < -200) space(); } break; }
      default: break;
    }
    stack.length = 0;
  }
  return out;
}

/** Text of a PDF's pages, in order. Needs no libraries; reads text-based PDFs, not scans, and refuses encrypted files. */
export function pdfToText(file: Buffer): string {
  if (!file.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new PdfError('That file isn’t a PDF.');
  unpacked = 0;
  const objects = readObjects(file);
  if ([...objects.values()].some((object) => /\/Encrypt\b/.test(object.dict)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(latin(file.subarray(Math.max(0, file.length - 4096))))) throw new PdfError('That PDF is password-protected.');
  const pageIds: number[] = [];
  const walk = (id: number, seen: Set<number>) => {
    if (seen.has(id) || pageIds.length >= MAX_PAGES) return; seen.add(id);
    const dict = objects.get(id)?.dict ?? '';
    if (/\/Type\s*\/Pages\b/.test(dict) || (/\/Kids/.test(dict) && !/\/Type\s*\/Page\b/.test(dict))) for (const kid of refsIn(entry(dict, 'Kids'))) walk(kid, seen);
    else if (/\/Type\s*\/Page\b/.test(dict)) pageIds.push(id);
  };
  const root = [...objects.entries()].find(([, object]) => /\/Type\s*\/Catalog\b/.test(object.dict));
  const rootPages = root ? refId(entry(root[1].dict, 'Pages')) : null;
  if (rootPages !== null) walk(rootPages, new Set());
  if (!pageIds.length) for (const [id, object] of [...objects].sort((a, b) => a[0] - b[0])) if (/\/Type\s*\/Page\b/.test(object.dict) && pageIds.length < MAX_PAGES) pageIds.push(id);

  const inherited = (id: number, key: string, depth = 0): string | null => { const dict = objects.get(id)?.dict ?? ''; return entry(dict, key) ?? (depth < 8 && refId(entry(dict, 'Parent')) !== null ? inherited(refId(entry(dict, 'Parent'))!, key, depth + 1) : null); };
  const fontCache = new Map<number, Font>(); const pages: string[] = [];
  for (const pageId of pageIds) {
    let resources = inherited(pageId, 'Resources') ?? ''; const resourceRef = refId(resources); if (resourceRef !== null) resources = objects.get(resourceRef)?.dict ?? '';
    let fontDict = entry(resources, 'Font') ?? ''; const fontRef = refId(fontDict); if (fontRef !== null) fontDict = objects.get(fontRef)?.dict ?? '';
    const fonts = new Map<string, Font>();
    for (const m of fontDict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) { const id = Number(m[2]); if (!fontCache.has(id)) fontCache.set(id, loadFont(objects, id)); fonts.set(m[1], fontCache.get(id)!); }
    const contents = entry(objects.get(pageId)?.dict ?? '', 'Contents'); let text = '';
    for (const id of refsIn(contents)) { const stream = objects.get(id); const data = stream?.stream ? decodeStream(stream.dict, stream.stream) : null; if (data) text += `${contentText(latin(data), fonts)}\n`; }
    pages.push(text);
  }
  return pages.map((page) => page.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()).filter(Boolean).join('\n\n');
}
