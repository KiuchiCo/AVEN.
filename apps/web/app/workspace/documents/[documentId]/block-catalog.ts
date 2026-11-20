// Every block a person can add to a document, in one list. The slash menu, the block browser and the block type selectors all read
// from here, and each entry names its icon in the central registry (../../block-icons.tsx) instead of drawing its own.
import type { BlockIconId } from '../../block-icons';
import type { Block, BlockType } from './editor-model.ts';

export type BlockCategory = 'basic' | 'media' | 'database' | 'advanced';
/** `id` is the icon id and the translation key suffix (`blk.<id>` for the name, `blk.<id>.d` for the description). */
export type CatalogEntry = { id: BlockIconId; type: BlockType; patch?: Partial<Block>; category: BlockCategory; keywords: string[] };

export const blockCatalog: CatalogEntry[] = [
  // Basic blocks
  { id: 'document-text', type: 'PARAGRAPH', category: 'basic', keywords: ['text', 'paragraph', 'plain', 'p'] },
  { id: 'heading-1', type: 'HEADING_1', category: 'basic', keywords: ['heading', 'h1', 'title', 'big'] },
  { id: 'heading-2', type: 'HEADING_2', category: 'basic', keywords: ['heading', 'h2', 'subheading'] },
  { id: 'heading-3', type: 'HEADING_3', category: 'basic', keywords: ['heading', 'h3'] },
  { id: 'heading-4', type: 'HEADING_4', category: 'basic', keywords: ['heading', 'h4'] },
  { id: 'bulleted-list', type: 'BULLET', category: 'basic', keywords: ['bullet', 'list', 'ul', 'unordered'] },
  { id: 'numbered-list', type: 'NUMBERED', category: 'basic', keywords: ['numbered', 'list', 'ordered', 'ol'] },
  { id: 'todo-list', type: 'TODO', category: 'basic', keywords: ['todo', 'to-do', 'task', 'checkbox', 'check'] },
  { id: 'toggle-list', type: 'TOGGLE', patch: { level: 0 }, category: 'basic', keywords: ['toggle', 'collapse', 'fold', 'expand', 'details'] },
  { id: 'page', type: 'PAGE_LINK', patch: { create: true }, category: 'basic', keywords: ['page', 'subpage', 'new page', 'document'] },
  { id: 'callout', type: 'CALLOUT', category: 'basic', keywords: ['callout', 'note', 'tip', 'info', 'highlight'] },
  { id: 'quote', type: 'QUOTE', category: 'basic', keywords: ['quote', 'blockquote', 'cite'] },
  { id: 'table', type: 'TABLE', category: 'basic', keywords: ['table', 'grid', 'rows', 'columns'] },
  { id: 'divider', type: 'DIVIDER', category: 'basic', keywords: ['divider', 'line', 'rule', 'separator', 'hr'] },
  { id: 'page-link', type: 'PAGE_LINK', category: 'basic', keywords: ['link', 'page link', 'mention', 'reference', 'document'] },
  // Media
  { id: 'image', type: 'IMAGE', category: 'media', keywords: ['image', 'picture', 'photo', 'upload'] },
  { id: 'video', type: 'VIDEO', category: 'media', keywords: ['video', 'movie', 'clip', 'media'] },
  { id: 'audio', type: 'AUDIO', category: 'media', keywords: ['audio', 'sound', 'music', 'recording', 'podcast'] },
  { id: 'code', type: 'CODE', category: 'media', keywords: ['code', 'snippet', 'pre', 'monospace'] },
  { id: 'file', type: 'FILE', category: 'media', keywords: ['file', 'attachment', 'upload', 'pdf', 'document'] },
  { id: 'bookmark', type: 'BOOKMARK', category: 'media', keywords: ['bookmark', 'web', 'url', 'link', 'website'] },
  // Database
  { id: 'database-table', type: 'DATABASE', patch: { view: 'TABLE' }, category: 'database', keywords: ['table view', 'database', 'records'] },
  { id: 'database-board', type: 'DATABASE', patch: { view: 'BOARD' }, category: 'database', keywords: ['board view', 'kanban', 'database'] },
  { id: 'database-gallery', type: 'DATABASE', patch: { view: 'GALLERY' }, category: 'database', keywords: ['gallery view', 'cards', 'database'] },
  { id: 'database-list', type: 'DATABASE', patch: { view: 'LIST' }, category: 'database', keywords: ['list view', 'database'] },
  { id: 'chart-bar-vertical', type: 'DATABASE', patch: { view: 'BAR_V' }, category: 'database', keywords: ['vertical bar chart', 'chart', 'graph', 'column'] },
  { id: 'chart-bar-horizontal', type: 'DATABASE', patch: { view: 'BAR_H' }, category: 'database', keywords: ['horizontal bar chart', 'chart', 'graph', 'bar'] },
  { id: 'chart-donut', type: 'DATABASE', patch: { view: 'DONUT' }, category: 'database', keywords: ['donut chart', 'pie', 'chart', 'graph'] },
  { id: 'chart-number', type: 'DATABASE', patch: { view: 'NUMBER' }, category: 'database', keywords: ['number chart', 'count', 'total', 'metric', 'chart'] },
  { id: 'database-inline', type: 'DATABASE', patch: { view: 'TABLE', create: true }, category: 'database', keywords: ['database inline', 'new database', 'inline'] },
  { id: 'database-full-page', type: 'DATABASE_LINK', patch: { create: true }, category: 'database', keywords: ['database full page', 'new database', 'full page'] },
  { id: 'database-linked', type: 'DATABASE', patch: { view: 'TABLE', linked: true }, category: 'database', keywords: ['linked view', 'linked database', 'existing'] },
  // Advanced blocks
  { id: 'table-of-contents', type: 'TOC', category: 'advanced', keywords: ['table of contents', 'toc', 'outline', 'contents'] },
  { id: 'button', type: 'BUTTON', category: 'advanced', keywords: ['button', 'action', 'create task'] },
  { id: 'breadcrumb', type: 'BREADCRUMB', category: 'advanced', keywords: ['breadcrumb', 'path', 'location'] },
  { id: 'toggle-heading-1', type: 'TOGGLE', patch: { level: 1 }, category: 'advanced', keywords: ['toggle heading', 'collapsible heading', 'h1'] },
  { id: 'toggle-heading-2', type: 'TOGGLE', patch: { level: 2 }, category: 'advanced', keywords: ['toggle heading', 'collapsible heading', 'h2'] },
  { id: 'toggle-heading-3', type: 'TOGGLE', patch: { level: 3 }, category: 'advanced', keywords: ['toggle heading', 'collapsible heading', 'h3'] },
];

export const catalogCategories: BlockCategory[] = ['basic', 'media', 'database', 'advanced'];

/** The icon for a block as it exists in a document (used by block selectors and block headers). */
export function iconForBlock(block: Pick<Block, 'type' | 'level' | 'view'>): BlockIconId {
  const found = blockCatalog.find((entry) => entry.type === block.type && (entry.patch?.level ?? 0) === (block.type === 'TOGGLE' ? block.level ?? 0 : 0) && (block.type !== 'DATABASE' || entry.patch?.view === (block.view ?? 'TABLE')) && !entry.patch?.create && !entry.patch?.linked);
  return found?.id ?? blockCatalog.find((entry) => entry.type === block.type)?.id ?? 'document-text';
}
