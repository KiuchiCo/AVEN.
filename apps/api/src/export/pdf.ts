import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import type { ExportDocument, ExportNode } from './document-model.js';
import type { Run } from './inline.js';

const fonts = (name: string) => fileURLToPath(new URL(`../../assets/fonts/${name}`, import.meta.url));
const INK = '#2B2A27'; const MUTED = '#77766E'; const SAND = '#F1EDE6'; const BORDER = '#DCD9D0'; const BRONZE = '#A48766'; const LINK = '#3B6FC4';
const PAGE = { margin: { top: 64, bottom: 72, left: 56, right: 56 } };

type Doc = InstanceType<typeof PDFDocument>;
type FontHost = Doc & { _font?: { font?: { hasGlyphForCodePoint?: (code: number) => boolean } } };

const invisible = new RegExp('[\\u200b-\\u200f\\u2028\\u2029\\ufeff]', 'g');

/** The embedded fonts cover Latin text; anything else would print as an empty box, so it becomes "?" instead of disappearing without a trace. */
function printable(doc: Doc, value: string): string {
  const font = (doc as FontHost)._font?.font;
  let out = '';
  for (const char of value.replace(/\t/g, '    ').replace(invisible, '')) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && char !== '\n') continue;
    out += code < 128 || font?.hasGlyphForCodePoint?.(code) !== false ? char : '?';
  }
  return out;
}

const familyFor = (run: Run, base: { bold?: boolean; italic?: boolean; font?: string }) => {
  if (run.code) return 'Mono';
  if (base.font) return base.font;
  const bold = run.bold || base.bold, italic = run.italic || base.italic;
  return bold && italic ? 'Inter-BoldItalic' : bold ? 'Inter-Bold' : italic ? 'Inter-Italic' : 'Inter';
};

function ensure(doc: Doc, height: number) { if (doc.y + height > doc.page.height - PAGE.margin.bottom) doc.addPage(); }

function drawRuns(doc: Doc, runs: Run[], options: { x: number; width: number; size: number; color?: string; bold?: boolean; italic?: boolean; font?: string; lineGap?: number; align?: 'center' | 'right' | 'justify' }) {
  const shown = runs.filter((run) => run.text);
  if (!shown.length) { doc.moveDown(0.2); return; }
  shown.forEach((run, index) => {
    doc.font(familyFor(run, options)).fontSize(run.code ? options.size * 0.92 : options.size).fillColor(run.href ? LINK : run.colour ? `#${run.colour}` : options.color ?? INK);
    const last = index === shown.length - 1;
    const text = printable(doc, run.text);
    // explicit values everywhere: PDFKit makes a continued run inherit any option that is left undefined
    const settings = { continued: !last, underline: Boolean(run.underline || run.href), strike: Boolean(run.strike), link: run.href ?? null, width: options.width, lineGap: options.lineGap ?? 3, align: (options.align ?? 'left') as 'left' | 'center' | 'right' | 'justify' };
    if (index === 0) doc.text(text, options.x, doc.y, settings); else doc.text(text, settings);
  });
}

const plain = (runs: Run[]) => runs.map((run) => run.text).join('');
const heightOf = (doc: Doc, text: string, width: number, size: number, font = 'Inter', lineGap = 3) => { doc.font(font).fontSize(size); return doc.heightOfString(printable(doc, text) || ' ', { width, lineGap }); };

function drawTable(doc: Doc, rows: string[][], caption: string | undefined) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const total = doc.page.width - PAGE.margin.left - PAGE.margin.right;
  // Wider columns for longer content, but never narrower than a readable minimum.
  const weights = Array.from({ length: columns }, (_, column) => Math.max(6, Math.min(40, ...[Math.max(...rows.map((row) => (row[column] ?? '').length), 1)])));
  const sum = weights.reduce((a, b) => a + b, 0); const min = Math.min(60, total / columns);
  let widths = weights.map((weight) => Math.max(min, (weight / sum) * total)); const scale = total / widths.reduce((a, b) => a + b, 0); widths = widths.map((width) => width * scale);
  const pad = 5; const size = 9.5;
  if (caption) { ensure(doc, 60); doc.font('Inter-Bold').fontSize(9.5).fillColor(MUTED).text(printable(doc, caption), PAGE.margin.left, doc.y + 6, { width: total }); doc.moveDown(0.3); }
  const drawRow = (row: string[], header: boolean) => {
    const cells = Array.from({ length: columns }, (_, column) => printable(doc, row[column] ?? ''));
    const height = Math.max(...cells.map((cell, column) => { doc.font(header ? 'Inter-Bold' : 'Inter').fontSize(size); return doc.heightOfString(cell || ' ', { width: widths[column] - pad * 2, lineGap: 2 }); })) + pad * 2;
    if (doc.y + height > doc.page.height - PAGE.margin.bottom) { doc.addPage(); if (caption && !header) { const head = rows[0]; if (head) drawRow(head, true); } }
    const top = doc.y; let x = PAGE.margin.left;
    cells.forEach((cell, column) => {
      if (header) doc.rect(x, top, widths[column], height).fill(SAND);
      doc.lineWidth(0.5).strokeColor(BORDER).rect(x, top, widths[column], height).stroke();
      doc.fillColor(INK).font(header ? 'Inter-Bold' : 'Inter').fontSize(size).text(cell, x + pad, top + pad, { width: widths[column] - pad * 2, lineGap: 2 });
      x += widths[column];
    });
    doc.y = top + height;
  };
  (rows.length ? rows : [['']]).forEach((row, index) => drawRow(row, Boolean(caption) && index === 0));
  doc.moveDown(0.8); doc.x = PAGE.margin.left;
}

/** The author's alignment, font and size for a text block, as drawing options. Spacing widens or tightens the gap between lines. */
function laidOut(base: { size: number; lineGap: number; font?: string }, layout?: { align?: 'center' | 'right' | 'justify'; spacing?: number; font?: 'sans' | 'serif' | 'mono'; size?: number }) {
  const size = layout?.size ?? base.size;
  return { size, lineGap: layout?.spacing ? Math.max(1, size * (layout.spacing - 1) * 0.9) : base.lineGap, align: layout?.align, font: layout?.font === 'serif' ? 'Playfair' : layout?.font === 'mono' ? 'Mono' : base.font };
}

function drawNode(doc: Doc, node: ExportNode) {
  const left = PAGE.margin.left; const width = doc.page.width - PAGE.margin.left - PAGE.margin.right;
  switch (node.kind) {
    case 'heading': {
      const size = node.layout?.size ?? [22, 17, 14, 12][node.level - 1]; const font = node.layout?.font === 'serif' ? 'Playfair' : node.layout?.font === 'mono' ? 'Mono' : node.layout?.font === 'sans' ? 'Inter-Bold' : node.level <= 2 ? 'Playfair' : node.level === 3 ? 'Inter-Bold' : 'Inter-BoldItalic';
      ensure(doc, size * 1.4 + 70); // a heading is never left alone at the bottom of a page
      doc.moveDown(node.level === 1 ? 0.9 : 0.6); drawRuns(doc, node.runs.map((run) => ({ ...run, bold: undefined })), { x: left, width, size, font, align: node.layout?.align }); doc.moveDown(0.25); break;
    }
    case 'paragraph': drawRuns(doc, node.runs, { x: left, width, ...laidOut({ size: 10.5, lineGap: 4 }, node.layout) }); doc.moveDown(0.5); break;
    case 'item': {
      const indent = 18 + node.depth * 18; const x = left + indent; ensure(doc, 24);
      const top = doc.y; const color = node.style === 'todo' && node.checked ? MUTED : INK;
      if (node.style === 'todo') {
        // a drawn checkbox: an empty square, or a ticked one
        const box = 8.5; const bx = x - 15; const by = top + 1.8;
        doc.lineWidth(0.9).strokeColor(node.checked ? BRONZE : MUTED).rect(bx, by, box, box).stroke();
        if (node.checked) doc.moveTo(bx + 1.8, by + 4.6).lineTo(bx + 3.7, by + 6.6).lineTo(bx + 7, by + 2).lineWidth(1.3).strokeColor(BRONZE).stroke();
      } else {
        const marker = node.style === 'bullet' ? ['•', '–', '·'][node.depth % 3] : `${node.number}.`;
        doc.font('Inter').fontSize(10.5).fillColor(MUTED).text(printable(doc, marker), x - 18, top, { width: 16, align: 'right', lineBreak: false });
      }
      doc.y = top; drawRuns(doc, node.runs, { x, width: width - indent, color, ...laidOut({ size: 10.5, lineGap: 3 }, node.layout) });
      doc.moveDown(0.25); break;
    }
    case 'quote': {
      const height = heightOf(doc, plain(node.runs), width - 24, 10.5, 'Inter-Italic', 4); ensure(doc, Math.min(height + 12, 200));
      const top = doc.y; drawRuns(doc, node.runs, { x: left + 16, width: width - 16, size: 10.5, italic: true, color: INK, lineGap: 4 });
      doc.moveTo(left + 4, top).lineTo(left + 4, doc.y).lineWidth(2.5).strokeColor(BRONZE).stroke(); doc.moveDown(0.6); break;
    }
    case 'callout': {
      const inner = width - 28; const height = heightOf(doc, plain(node.runs), inner, 10.5, 'Inter', 4) + 20; ensure(doc, Math.min(height, 240));
      const top = doc.y; doc.rect(left, top, width, height).fill(SAND); doc.rect(left, top, 3, height).fill(BRONZE);
      doc.y = top + 10; drawRuns(doc, node.runs, { x: left + 16, width: inner, size: 10.5, lineGap: 4 }); doc.y = Math.max(doc.y, top + height) + 8; break;
    }
    case 'code': {
      if (node.label) { ensure(doc, 40); doc.font('Inter-Bold').fontSize(9).fillColor(MUTED).text(printable(doc, node.label), left, doc.y + 4, { width }); doc.moveDown(0.2); }
      const lines = (node.text || ' ').split('\n');
      for (const line of lines) {
        const text = printable(doc, line) || ' '; doc.font('Mono').fontSize(8.8);
        const height = doc.heightOfString(text, { width: width - 16, lineGap: 1.5 }); ensure(doc, height + 2);
        const top = doc.y; doc.rect(left, top - 1, width, height + 2).fill(SAND);
        doc.fillColor(INK).font('Mono').fontSize(8.8).text(text, left + 8, top, { width: width - 16, lineGap: 1.5, features: [] as never });
      }
      doc.moveDown(0.7); break;
    }
    case 'equation': ensure(doc, 40); doc.font('Inter-Italic').fontSize(12).fillColor(INK).text(printable(doc, node.source), left, doc.y + 6, { width, align: 'center' }); doc.moveDown(0.8); break;
    case 'divider': ensure(doc, 20); doc.moveDown(0.4); doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.7).strokeColor(BORDER).stroke(); doc.moveDown(0.8); break;
    case 'table': drawTable(doc, node.rows, node.caption); break;
    case 'image': {
      const maxHeight = 460; const scale = Math.min(1, width / node.width, maxHeight / node.height); const w = node.width * scale; const h = node.height * scale;
      ensure(doc, h + (node.caption ? 30 : 12)); const top = doc.y + 4;
      doc.image(node.data, left + (width - w) / 2, top, { width: w, height: h }); doc.y = top + h + 6;
      if (node.caption) { doc.font('Inter-Italic').fontSize(9.5).fillColor(MUTED).text(printable(doc, node.caption), left, doc.y, { width, align: 'center' }); }
      doc.moveDown(0.8); break;
    }
    case 'note': doc.font('Inter-Italic').fontSize(10).fillColor(MUTED).text(printable(doc, node.text), left, doc.y, { width, link: node.href, lineGap: 3 }); doc.moveDown(0.5); break;
  }
  doc.x = left;
}

/** A genuine PDF (A4, embedded fonts, selectable text, clickable links, page numbers), laid out from the same nodes the Word file uses. */
export function renderPdf(document: ExportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: PAGE.margin, bufferPages: true, info: { Title: document.title || 'Untitled', Author: 'AVEN', Creator: 'AVEN Documents', Producer: 'AVEN', CreationDate: new Date() }, lang: 'en' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      doc.registerFont('Inter', fonts('Inter-Regular.woff')); doc.registerFont('Inter-Bold', fonts('Inter-Bold.woff')); doc.registerFont('Inter-Italic', fonts('Inter-Italic.woff')); doc.registerFont('Inter-BoldItalic', fonts('Inter-BoldItalic.woff'));
      doc.registerFont('Mono', fonts('JetBrainsMono-Regular.woff')); doc.registerFont('Playfair', fonts('PlayfairDisplay-Medium.woff'));
      const width = doc.page.width - PAGE.margin.left - PAGE.margin.right;
      doc.font('Playfair').fontSize(30).fillColor(INK).text(printable(doc, document.title || 'Untitled'), PAGE.margin.left, doc.y, { width, lineGap: 4 });
      doc.moveDown(0.4); doc.moveTo(PAGE.margin.left, doc.y).lineTo(PAGE.margin.left + 48, doc.y).lineWidth(2).strokeColor(BRONZE).stroke(); doc.moveDown(1);
      for (const node of document.nodes) drawNode(doc, node);
      const range = doc.bufferedPageRange();
      for (let index = 0; index < range.count; index += 1) {
        doc.switchToPage(range.start + index);
        const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0; // the footer sits in the bottom margin; without this drawing it would add a page
        doc.font('Inter').fontSize(8.5).fillColor(MUTED);
        doc.text('AVEN.', PAGE.margin.left, doc.page.height - 40, { width: 80, lineBreak: false });
        doc.text(`${index + 1} / ${range.count}`, doc.page.width - PAGE.margin.right - 80, doc.page.height - 40, { width: 80, align: 'right', lineBreak: false });
        doc.page.margins.bottom = bottom;
      }
      doc.end();
    } catch (error) { reject(error); }
  });
}
