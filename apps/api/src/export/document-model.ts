import { parseRuns, plainOf, safeHref, type Run } from './inline.js';

/** A block as the editor saves it (`aven-doc-v1`). Only the fields export reads are listed. */
export type SavedBlock = {
  id?: string; type?: string; text?: string; checked?: boolean; rows?: unknown; fileId?: string; level?: number; body?: string; url?: string; docId?: string;
  databaseId?: string; view?: string; tabs?: { title?: string; body?: string }[]; date?: string; attendees?: string; actions?: string; indent?: number; tab?: number;
  align?: string; spacing?: number; font?: string; size?: number;
};

/** How a text block is laid out when its author set alignment, line spacing, font or size. Anything unset is left to the writer's own style. */
export type Layout = { align?: 'center' | 'right' | 'justify'; spacing?: number; font?: 'sans' | 'serif' | 'mono'; size?: number };

/** What the two writers (PDF and Word) draw. Every saved block type becomes some of these; see `exporters`. */
export type ExportNode =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; runs: Run[]; layout?: Layout }
  | { kind: 'paragraph'; runs: Run[]; layout?: Layout }
  | { kind: 'item'; style: 'bullet' | 'numbered' | 'todo'; depth: number; number: number; checked: boolean; runs: Run[]; layout?: Layout }
  | { kind: 'quote'; runs: Run[]; layout?: Layout }
  | { kind: 'callout'; runs: Run[]; layout?: Layout }
  | { kind: 'code'; text: string; label?: string }
  | { kind: 'equation'; source: string }
  | { kind: 'divider' }
  | { kind: 'table'; rows: string[][]; caption?: string }
  | { kind: 'image'; data: Buffer; mime: 'image/png' | 'image/jpeg'; width: number; height: number; caption: string; alt: string }
  | { kind: 'note'; text: string; href?: string };

export type ExportDocument = { title: string; updatedAt: Date; nodes: ExportNode[] };

export type ResolvedImage = { data: Buffer; mime: 'image/png' | 'image/jpeg'; width: number; height: number };
export type ResolvedDatabase = { name: string; properties: { id: string; name: string; type: string }[]; records: { values: Record<string, unknown> }[] };
/** Looks up what a block points at. Returning null means "not available to this reader", and the block gets a visible fallback. */
export type Resolver = {
  image(fileId: string): Promise<ResolvedImage | null>;
  file(fileId: string): Promise<{ name: string } | null>;
  database(id: string): Promise<ResolvedDatabase | null>;
  page(id: string): Promise<{ title: string } | null>;
};

const MAX_ROWS = 200; const MAX_BLOCKS = 5000;
const text = (value: unknown, max = 50_000) => (typeof value === 'string' ? value.slice(0, max) : '');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runs = (value: unknown): Run[] => parseRuns(text(value));
const indentOf = (block: SavedBlock) => (typeof block.indent === 'number' && block.indent > 0 ? Math.min(5, Math.floor(block.indent)) : 0);

export function parseBlocks(content: string): SavedBlock[] {
  try {
    const parsed = JSON.parse(content) as { format?: string; blocks?: unknown };
    if (parsed.format === 'aven-doc-v1' && Array.isArray(parsed.blocks)) return liftBodies(parsed.blocks.filter((block): block is SavedBlock => Boolean(block) && typeof block === 'object').slice(0, MAX_BLOCKS));
  } catch { /* A plain-text document: below. */ }
  return content.trim() ? content.split(/\n{2,}/).map((part) => ({ type: 'PARAGRAPH', text: part.trim() })) : [];
}

/** Older documents kept a toggle's, tab's or meeting's text in fields of the block; the editor now keeps it as blocks inside. Export reads both. */
export function liftBodies(blocks: SavedBlock[]): SavedBlock[] {
  const out: SavedBlock[] = [];
  for (const block of blocks) {
    const depth = indentOf(block) + 1; const kids: SavedBlock[] = [];
    const add = (lines: unknown, type: string, tab = 0) => { for (const line of text(lines).split('\n')) if (line.trim()) kids.push({ type, text: line.trim(), indent: depth, tab }); };
    if (block.type === 'TOGGLE' && block.body) { add(block.body, 'PARAGRAPH'); out.push({ ...block, body: undefined }); }
    else if (block.type === 'TABS' && Array.isArray(block.tabs) && block.tabs.some((pane) => pane?.body)) { block.tabs.forEach((pane, index) => add(pane?.body, 'PARAGRAPH', index)); out.push({ ...block, tabs: block.tabs.map((pane) => ({ title: pane?.title, body: '' })) }); }
    else if (block.type === 'MEETING' && (block.body || block.actions)) { add(block.body, 'PARAGRAPH'); add(block.actions, 'TODO'); out.push({ ...block, body: undefined, actions: undefined }); }
    else { out.push(block); continue; }
    out.push(...kids);
  }
  return out;
}

type Context = { resolver: Resolver; counters: number[] };
type Exporter = (block: SavedBlock, context: Context) => ExportNode[] | Promise<ExportNode[]>;

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(cell).join(', ');
  if (typeof value === 'object') return '';
  return String(value).slice(0, 500);
};
const chartViews = new Set(['BAR_V', 'BAR_H', 'DONUT', 'NUMBER', 'LINE', 'DASHBOARD']);

/** A database, as a table; chart views become the readable numbers behind the chart (count per status, or the total). */
function databaseNodes(block: SavedBlock, db: ResolvedDatabase): ExportNode[] {
  if (block.view && chartViews.has(block.view)) {
    const group = db.properties.find((property) => property.type === 'status' || property.type === 'select');
    if (block.view === 'NUMBER' || !group) return [{ kind: 'paragraph', runs: [{ text: `${db.name}: `, bold: true }, { text: `${db.records.length} records` }] }];
    const counts = new Map<string, number>();
    for (const record of db.records) { const label = cell(record.values[group.id]) || '—'; counts.set(label, (counts.get(label) ?? 0) + 1); }
    return [{ kind: 'table', caption: `${db.name}—by ${group.name}`, rows: [[group.name, 'Records'], ...[...counts].map(([label, count]) => [label, String(count)])] }];
  }
  const shown = db.records.slice(0, MAX_ROWS);
  const rows = [db.properties.map((property) => property.name), ...shown.map((record) => db.properties.map((property) => cell(record.values[property.id])))];
  const more = db.records.length - shown.length;
  return [{ kind: 'table', caption: db.name, rows }, ...(more > 0 ? [{ kind: 'note' as const, text: `${more} more records are in the database.` }] : [])];
}

const textual = (kind: 'paragraph' | 'quote' | 'callout'): Exporter => (block) => [{ kind, runs: runs(block.text) }];
const heading = (level: 1 | 2 | 3 | 4): Exporter => (block) => [{ kind: 'heading', level, runs: runs(block.text) }];

/**
 * One entry per saved block type: how it becomes export nodes. A type that is missing here is not dropped; see `fallback`.
 * Containers (toggle, tabs, meeting notes) are handled by `walk`, which exports their blocks after the node returned here.
 */
export const exporters: Record<string, Exporter> = {
  PARAGRAPH: textual('paragraph'), QUOTE: textual('quote'), CALLOUT: textual('callout'), SYNCED: textual('paragraph'),
  HEADING_1: heading(1), HEADING_2: heading(2), HEADING_3: heading(3), HEADING_4: heading(4),
  BULLET: (block, context) => { context.counters.length = indentOf(block) + 1; return [{ kind: 'item', style: 'bullet', depth: indentOf(block), number: 0, checked: false, runs: runs(block.text) }]; },
  TODO: (block) => [{ kind: 'item', style: 'todo', depth: indentOf(block), number: 0, checked: block.checked === true, runs: runs(block.text) }],
  NUMBERED: (block, context) => { const depth = indentOf(block); context.counters.length = depth + 1; context.counters[depth] = (context.counters[depth] ?? 0) + 1; return [{ kind: 'item', style: 'numbered', depth, number: context.counters[depth], checked: false, runs: runs(block.text) }]; },
  CODE: (block) => [{ kind: 'code', text: text(block.text) }],
  DIVIDER: () => [{ kind: 'divider' }],
  EQUATION: (block) => [{ kind: 'equation', source: text(block.text) }],
  MERMAID: (block) => [{ kind: 'code', label: 'Diagram (Mermaid source)', text: text(block.text) }],
  TABLE: (block) => [{ kind: 'table', rows: (Array.isArray(block.rows) ? block.rows : []).slice(0, MAX_ROWS).map((row) => (Array.isArray(row) ? row.slice(0, 12).map((value) => cell(value)) : [])) }],
  TOGGLE: (block) => (block.level && block.level >= 1 && block.level <= 3 ? [{ kind: 'heading', level: (block.level + 1) as 2 | 3 | 4, runs: runs(block.text) }] : [{ kind: 'paragraph', runs: runs(block.text).map((run) => ({ ...run, bold: true })) }]),
  TABS: () => [], MEETING: (block) => [
    { kind: 'heading', level: 2, runs: [{ text: text(block.text, 300) || 'Meeting notes' }] },
    ...(block.date || block.attendees ? [{ kind: 'paragraph' as const, runs: [{ text: [block.date ? `Date: ${text(block.date, 40)}` : '', block.attendees ? `Attendees: ${text(block.attendees, 400)}` : ''].filter(Boolean).join(' · '), italic: true }] }] : []),
  ],
  BOOKMARK: (block) => { const href = block.url ? safeHref(block.url) : null; const title = text(block.text, 300) || href || 'Bookmark'; return [{ kind: 'paragraph', runs: href ? [{ text: title, href }] : [{ text: title }] }]; },
  BUTTON: (block) => [{ kind: 'note', text: `Button: ${text(block.text, 200) || 'Create task'}` }],
  BREADCRUMB: () => [], // navigation only; the page title says where it is
  TOC: () => [],        // filled in by `walk` from the headings, once they are known
  IMAGE: async (block, { resolver }) => {
    const caption = text(block.text, 300);
    const image = block.fileId && uuid.test(block.fileId) ? await resolver.image(block.fileId.toLowerCase()) : null;
    return image ? [{ kind: 'image', ...image, caption, alt: caption || 'Image' }] : [{ kind: 'note', text: caption ? `Image not available: ${caption}` : 'An image that is not available.' }];
  },
  FILE: async (block, { resolver }) => { const file = block.fileId && uuid.test(block.fileId) ? await resolver.file(block.fileId.toLowerCase()) : null; return [{ kind: 'note', text: file ? `Attached file: ${file.name}` : 'An attached file that is not available here.' }]; },
  VIDEO: async (block, { resolver }) => { const file = block.fileId && uuid.test(block.fileId) ? await resolver.file(block.fileId.toLowerCase()) : null; return [{ kind: 'note', text: file ? `Video: ${file.name}` : 'A video that is not available here.' }]; },
  AUDIO: async (block, { resolver }) => { const file = block.fileId && uuid.test(block.fileId) ? await resolver.file(block.fileId.toLowerCase()) : null; return [{ kind: 'note', text: file ? `Audio: ${file.name}` : 'An audio file that is not available here.' }]; },
  PAGE_LINK: async (block, { resolver }) => { const page = block.docId && uuid.test(block.docId) ? await resolver.page(block.docId.toLowerCase()) : null; return [{ kind: 'note', text: page ? `Linked page: ${page.title}` : 'A linked page that is not available here.' }]; },
  DATABASE: async (block, { resolver }) => { const db = block.databaseId && uuid.test(block.databaseId) ? await resolver.database(block.databaseId.toLowerCase()) : null; return db ? databaseNodes(block, db) : [{ kind: 'note', text: 'A database that is not available here.' }]; },
  DATABASE_LINK: async (block, context) => exporters.DATABASE(block, context),
};

/** A type nobody wrote an exporter for still shows its text, or says it is there. */
const fallback: Exporter = (block) => (text(block.text).trim() ? [{ kind: 'paragraph', runs: runs(block.text) }] : [{ kind: 'note', text: `(${String(block.type ?? 'unknown').toLowerCase().replace(/_/g, ' ')} block)` }]);

const headingsOf = (blocks: SavedBlock[]) => blocks.flatMap((block): ExportNode[] => {
  const level = block.type === 'HEADING_1' ? 1 : block.type === 'HEADING_2' ? 2 : block.type === 'HEADING_3' ? 3 : block.type === 'HEADING_4' ? 4 : 0;
  return level && text(block.text).trim() ? [{ kind: 'item', style: 'bullet', depth: level - 1, number: 0, checked: false, runs: [{ text: plainOf(text(block.text)) }] }] : [];
});

/** The layout an author set on a block, with anything unusable dropped. */
export function layoutOf(block: SavedBlock): Layout | undefined {
  const layout: Layout = {};
  if (block.align === 'center' || block.align === 'right' || block.align === 'justify') layout.align = block.align;
  if (typeof block.spacing === 'number' && block.spacing >= 1 && block.spacing <= 3) layout.spacing = block.spacing;
  if (block.font === 'sans' || block.font === 'serif' || block.font === 'mono') layout.font = block.font;
  if (typeof block.size === 'number' && Number.isInteger(block.size) && block.size >= 8 && block.size <= 96) layout.size = block.size;
  return Object.keys(layout).length ? layout : undefined;
}
const laidOut = new Set(['heading', 'paragraph', 'item', 'quote', 'callout']);

async function walk(blocks: SavedBlock[], context: Context, all: SavedBlock[]): Promise<ExportNode[]> {
  const out: ExportNode[] = [];
  for (let at = 0; at < blocks.length; at += 1) {
    const block = blocks[at]; const type = String(block.type ?? '');
    if (type !== 'NUMBERED' && type !== 'BULLET' && type !== 'TODO') context.counters.length = 0;
    if (type === 'TOC') { const list = headingsOf(all); out.push(...(list.length ? [{ kind: 'heading' as const, level: 3 as const, runs: [{ text: 'Contents' }] }, ...list] : [])); continue; }
    const made = await (exporters[type] ?? fallback)(block, context); const layout = layoutOf(block);
    out.push(...(layout ? made.map((node) => (laidOut.has(node.kind) ? { ...node, layout } as ExportNode : node)) : made));
    if (type === 'TOGGLE' || type === 'TABS' || type === 'MEETING') {
      const depth = indentOf(block); const inside: SavedBlock[] = [];
      while (at + 1 < blocks.length && indentOf(blocks[at + 1]) > depth) inside.push(blocks[(at += 1)]);
      if (type === 'TABS') {
        const panes = Array.isArray(block.tabs) ? block.tabs : [];
        for (let index = 0; index < Math.max(panes.length, 1); index += 1) {
          const own = inside.filter((child) => (child.tab ?? 0) === index);
          out.push({ kind: 'heading', level: 3, runs: [{ text: text(panes[index]?.title, 100) || `Tab ${index + 1}` }] }, ...await walk(own, { ...context, counters: [] }, all));
        }
      } else out.push(...await walk(inside, { ...context, counters: [] }, all));
    }
  }
  return out;
}

export async function buildExportDocument(source: { title: string; content: string; updatedAt: Date }, resolver: Resolver): Promise<ExportDocument> {
  const blocks = parseBlocks(source.content);
  return { title: source.title, updatedAt: source.updatedAt, nodes: await walk(blocks, { resolver, counters: [] }, blocks) };
}

/** A filename that is safe on every system: no path characters, no control characters, no leading dots, a sensible length. */
export function exportFilename(title: string, extension: 'pdf' | 'docx'): string {
  const clean = title.normalize('NFC').replace(/\.{2,}/g, ' ').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 100).trim();
  return `AVEN - ${clean || 'Untitled'}.${extension}`;
}
/** The same name for a Content-Disposition header: ASCII fallback plus the real name encoded (RFC 5987). */
export function contentDisposition(filename: string): string {
  const ascii = filename.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'AVEN document';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
