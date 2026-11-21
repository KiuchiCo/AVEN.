import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { ExportDocument, ExportNode } from './document-model.js';
import type { Run } from './inline.js';

const BODY = 'Calibri'; const DISPLAY = 'Georgia'; const MONO = 'Consolas';
const INK = '2B2A27'; const MUTED = '77766E'; const SAND = 'F1EDE6'; const BORDER = 'DCD9D0'; const BRONZE = 'A48766';
const HALF_POINTS = 22; // 11 pt body

function runsToChildren(runs: Run[], base: { size?: number; bold?: boolean; italics?: boolean; font?: string; color?: string } = {}) {
  return runs.map((run) => {
    const text = new TextRun({
      text: run.text, bold: run.bold || base.bold, italics: run.italic || base.italics, strike: run.strike, underline: run.underline || run.href ? {} : undefined,
      font: run.code ? MONO : base.font, size: run.code ? Math.round((base.size ?? HALF_POINTS) * 0.9) : base.size, color: run.href ? '3B6FC4' : run.colour ?? base.color,
      shading: run.highlight ? { type: ShadingType.CLEAR, fill: run.highlight, color: 'auto' } : run.code ? { type: ShadingType.CLEAR, fill: SAND, color: 'auto' } : undefined,
    });
    return run.href ? new ExternalHyperlink({ link: run.href, children: [text] }) : text;
  });
}

const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const;
const indentFor = (depth: number) => 360 + depth * 360;

function table(rows: string[][], caption: string | undefined): (Paragraph | Table)[] {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const body = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: (rows.length ? rows : [['']]).map((row, rowIndex) => new TableRow({
      tableHeader: Boolean(caption) && rowIndex === 0, cantSplit: true,
      children: Array.from({ length: width }, (_, column) => new TableCell({
        shading: caption && rowIndex === 0 ? { type: ShadingType.CLEAR, fill: SAND, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: row[column] ?? '', bold: Boolean(caption) && rowIndex === 0, size: 20 })] })],
      })),
    })),
  });
  return [...(caption ? [new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: caption, bold: true, color: MUTED, size: 20 })] })] : []), body, new Paragraph({ spacing: { after: 120 }, children: [] })];
}

const alignOf = (layout?: { align?: string }) => (layout?.align === 'center' ? AlignmentType.CENTER : layout?.align === 'right' ? AlignmentType.RIGHT : layout?.align === 'justify' ? AlignmentType.JUSTIFIED : undefined);
const fontOf = (layout?: { font?: string }) => (layout?.font === 'serif' ? DISPLAY : layout?.font === 'mono' ? MONO : layout?.font === 'sans' ? BODY : undefined);
/** Run options for the font and size an author chose; empty when they chose none, so Word styles still apply. */
const runLayout = (layout?: { font?: string; size?: number }, extra: Record<string, unknown> = {}) => ({ ...extra, ...(fontOf(layout) ? { font: fontOf(layout) } : {}), ...(layout?.size ? { size: layout.size * 2 } : {}) });
const lineOf = (layout?: { spacing?: number }, fallback = 300) => (layout?.spacing ? Math.round(layout.spacing * 240) : fallback);

function convert(node: ExportNode, state: { numbering: number }): (Paragraph | Table)[] {
  switch (node.kind) {
    case 'heading': return [new Paragraph({ heading: headingLevels[node.level - 1], alignment: alignOf(node.layout), keepNext: true, spacing: { before: node.level === 1 ? 360 : 240, after: 100, ...(node.layout?.spacing ? { line: lineOf(node.layout) } : {}) }, children: runsToChildren(node.runs, runLayout(node.layout)) })];
    case 'paragraph': return [new Paragraph({ alignment: alignOf(node.layout), spacing: { after: 120, line: lineOf(node.layout) }, children: runsToChildren(node.runs, runLayout(node.layout)) })];
    case 'item': {
      if (node.style === 'todo') return [new Paragraph({ alignment: alignOf(node.layout), spacing: { after: 60, ...(node.layout?.spacing ? { line: lineOf(node.layout) } : {}) }, indent: { left: indentFor(node.depth) + 360, hanging: 360 }, children: [new TextRun({ text: node.checked ? '☑ ' : '☐ ', font: 'Segoe UI Symbol' }), ...runsToChildren(node.runs, runLayout(node.layout, node.checked ? { color: MUTED } : {}))] })];
      if (node.style === 'numbered' && node.number === 1 && node.depth === 0) state.numbering += 1;
      return [new Paragraph({ alignment: alignOf(node.layout), spacing: { after: 60, ...(node.layout?.spacing ? { line: lineOf(node.layout) } : {}) }, numbering: node.style === 'bullet' ? { reference: 'bullets', level: Math.min(node.depth, 5) } : { reference: 'numbers', level: Math.min(node.depth, 5), instance: Math.max(1, state.numbering) }, children: runsToChildren(node.runs, runLayout(node.layout)) })];
    }
    case 'quote': return [new Paragraph({ alignment: alignOf(node.layout), spacing: { before: 120, after: 120, ...(node.layout?.spacing ? { line: lineOf(node.layout) } : {}) }, indent: { left: 480 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRONZE, space: 12 } }, children: runsToChildren(node.runs, runLayout(node.layout, { italics: true })) })];
    case 'callout': return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: SAND, color: 'auto' }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 18, color: BRONZE }, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER } }, children: [new Paragraph({ children: runsToChildren(node.runs) })] })] })] }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case 'code': return [
      ...(node.label ? [new Paragraph({ keepNext: true, spacing: { before: 160, after: 40 }, children: [new TextRun({ text: node.label, bold: true, color: MUTED, size: 18 })] })] : []),
      ...(node.text ? node.text.split('\n') : ['']).map((line) => new Paragraph({ shading: { type: ShadingType.CLEAR, fill: SAND, color: 'auto' }, spacing: { after: 0 }, indent: { left: 120, right: 120 }, children: [new TextRun({ text: line, font: MONO, size: 19 })] })),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ];
    case 'equation': return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [new TextRun({ text: node.source, font: 'Cambria Math', italics: true, size: 24 })] })];
    case 'divider': return [new Paragraph({ spacing: { before: 160, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 1 } }, children: [] })];
    case 'table': return table(node.rows, node.caption);
    case 'image': {
      const scale = Math.min(1, 560 / node.width); const width = Math.max(1, Math.round(node.width * scale)); const height = Math.max(1, Math.round(node.height * scale));
      return [new Paragraph({ keepNext: Boolean(node.caption), alignment: AlignmentType.CENTER, spacing: { before: 120, after: node.caption ? 40 : 120 }, children: [new ImageRun({ type: node.mime === 'image/png' ? 'png' : 'jpg', data: node.data, transformation: { width, height }, altText: { title: node.alt, description: node.alt, name: node.alt } })] }),
        ...(node.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: node.caption, italics: true, color: MUTED, size: 20 })] })] : [])];
    }
    case 'note': return [new Paragraph({ spacing: { after: 120 }, children: [node.href ? new ExternalHyperlink({ link: node.href, children: [new TextRun({ text: node.text, color: '3B6FC4', underline: {} })] }) : new TextRun({ text: node.text, italics: true, color: MUTED })] })];
  }
}

const bulletLevels = Array.from({ length: 6 }, (_, level) => ({ level, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][level % 3], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } }));
const numberLevels = Array.from({ length: 6 }, (_, level) => ({ level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3], text: `%${level + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } }));

/** A real Office Open XML document: styles, numbering, tables, images and hyperlinks are Word's own, so everything stays editable. */
export async function renderDocx(doc: ExportDocument): Promise<Buffer> {
  const state = { numbering: 0 };
  const children: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 240 }, children: [new TextRun({ text: doc.title || 'Untitled' })] }), ...doc.nodes.flatMap((node) => convert(node, state))];
  const file = new Document({
    creator: 'AVEN', title: doc.title || 'Untitled', description: 'Exported from AVEN Documents', lastModifiedBy: 'AVEN',
    styles: {
      default: { document: { run: { font: BODY, size: HALF_POINTS, color: INK }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: DISPLAY, size: 56, color: INK }, paragraph: { spacing: { after: 240 } } },
        ...[[1, 36], [2, 30], [3, 26], [4, 23]].map(([level, size]) => ({ id: `Heading${level}`, name: `heading ${level}`, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: DISPLAY, size, bold: level === 4 ? false : true, italics: level === 4, color: INK }, paragraph: { keepNext: true, spacing: { before: 240, after: 100 } } })),
      ],
    },
    numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, { reference: 'numbers', levels: numberLevels }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1300, right: 1300 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AVEN.  ·  ', color: MUTED, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 18 })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(file);
}
