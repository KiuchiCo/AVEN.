// Translates between AVEN's saved block list and the editor's document. A document is saved as `aven-doc-v1` (a list of blocks), which the
// server, search, sharing, version history and live text sessions all understand; the editor holds the same content as one ProseMirror
// document: a title followed by one node per block, each carrying its block id. Reading and writing are exact inverses of each other.
import { normalizeBlock, type Block, type BlockType } from './editor-model.ts';

export type NodeJSON = { type: string; attrs?: Record<string, unknown>; content?: { type: 'text'; text: string }[] };
export type DocJSON = { type: 'doc'; content: NodeJSON[] };
export type NodeName = 'textBlock' | 'toggleBlock' | 'sourceBlock' | 'syncedBlock' | 'atomBlock';

const plainText = new Set<BlockType>(['PARAGRAPH', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CODE', 'CALLOUT']);
/** Which kind of editor node holds each block type. */
export function nodeNameFor(type: BlockType): NodeName {
  if (plainText.has(type)) return 'textBlock';
  if (type === 'TOGGLE') return 'toggleBlock';
  if (type === 'EQUATION' || type === 'MERMAID') return 'sourceBlock';
  if (type === 'SYNCED') return 'syncedBlock';
  return 'atomBlock';
}
/** Block types that carry editable text inside the document (as opposed to atoms that render a component). */
export const hasInlineContent = (name: string) => name === 'textBlock' || name === 'toggleBlock' || name === 'sourceBlock' || name === 'syncedBlock';

const ATOM_FIELDS = ['rows', 'fileId', 'level', 'body', 'url', 'docId', 'databaseId', 'view', 'create', 'linked', 'tabs', 'date', 'attendees', 'actions', 'span'] as const;

export function blockToNode(block: Block): NodeJSON {
  const name = nodeNameFor(block.type);
  const content = hasInlineContent(name) && block.text ? [{ type: 'text' as const, text: block.text }] : undefined;
  const base = { blockId: block.id, type: block.type, indent: block.indent ?? 0, tab: block.tab ?? 0 };
  switch (name) {
    case 'textBlock': return { type: name, attrs: { ...base, checked: block.checked === true, align: block.align ?? null, spacing: block.spacing ?? null, font: block.font ?? null, size: block.size ?? null }, ...(content ? { content } : {}) };
    case 'toggleBlock': return { type: name, attrs: { ...base, level: block.level ?? 0, body: block.body ?? '' }, ...(content ? { content } : {}) };
    case 'sourceBlock': return { type: name, attrs: base, ...(content ? { content } : {}) };
    case 'syncedBlock': return { type: name, attrs: { ...base, syncId: block.syncId ?? block.id }, ...(content ? { content } : {}) };
    default: return { type: name, attrs: { ...base, text: block.text, ...Object.fromEntries(ATOM_FIELDS.filter((field) => block[field] !== undefined).map((field) => [field, block[field]])) } };
  }
}

export function nodeToBlock(node: NodeJSON): Block | null {
  const attrs = node.attrs ?? {};
  if (typeof attrs.blockId !== 'string' || typeof attrs.type !== 'string') return null;
  const text = (node.content ?? []).map((part) => part.text).join('');
  const block: Block = { id: attrs.blockId, type: attrs.type as BlockType, text };
  if (typeof attrs.indent === 'number' && attrs.indent > 0) block.indent = attrs.indent;
  if (typeof attrs.tab === 'number' && attrs.tab > 0) block.tab = attrs.tab;
  switch (node.type) {
    case 'textBlock':
      block.checked = attrs.checked === true;
      if (attrs.align) block.align = attrs.align as Block['align']; if (typeof attrs.spacing === 'number') block.spacing = attrs.spacing; if (attrs.font) block.font = attrs.font as Block['font']; if (typeof attrs.size === 'number') block.size = attrs.size;
      break;
    case 'toggleBlock': block.level = typeof attrs.level === 'number' ? attrs.level : 0; if (typeof attrs.body === 'string') block.body = attrs.body; break;
    case 'syncedBlock': if (typeof attrs.syncId === 'string') block.syncId = attrs.syncId; break;
    case 'atomBlock': {
      block.text = typeof attrs.text === 'string' ? attrs.text : '';
      for (const field of ATOM_FIELDS) if (attrs[field] !== undefined && attrs[field] !== null) (block as Record<string, unknown>)[field] = attrs[field];
      break;
    }
    default: break;
  }
  return normalizeBlock(block);
}

export function blocksToDoc(title: string, blocks: Block[]): DocJSON {
  return { type: 'doc', content: [{ type: 'title', ...(title ? { content: [{ type: 'text' as const, text: title }] } : {}) }, ...(blocks.length ? blocks : [{ id: 'empty', type: 'PARAGRAPH' as BlockType, text: '' }]).map(blockToNode)] };
}

export function docToBlocks(doc: DocJSON): { title: string; blocks: Block[] } {
  const [first, ...rest] = doc.content;
  const title = first?.type === 'title' ? (first.content ?? []).map((part) => part.text).join('') : '';
  const blocks = rest.map(nodeToBlock).filter((block): block is Block => block !== null);
  return { title, blocks };
}
