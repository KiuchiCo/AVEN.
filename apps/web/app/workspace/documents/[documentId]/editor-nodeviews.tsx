'use client';

// The blocks that are more than text. Each one is a node inside the same document and renders a component in place; the text-bearing
// ones (toggle, equation, Mermaid, synced) keep their text as the node's own editable content, not an input.
import { createContext, useContext, type ReactNode } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useT } from '../../../i18n';
import { ImageBlock, TableBlock } from './document-blocks';
import { BookmarkBlock, BreadcrumbBlock, ButtonBlock, DatabaseBlock, DatabaseLinkBlock, EquationPreview, MediaBlock, MeetingBlock, MermaidPreview, PageLinkBlock, TabsBlock, TocBlock } from './block-views';
import { AtomBlock, SourceBlock, SyncedBlock, ToggleBlock } from './editor-extensions';
import type { DatabaseView, TabPane } from './editor-model';

import type { BlockType } from './editor-model.ts';

export type EditorEnv = {
  /** A table cell was entered: table operations (from the toolbar too) act on this row and column. */
  onTableCell?: (blockId: string, row: number, col: number) => void;
  readOnly: boolean; documentId: string; projectId: string | undefined;
  headings: { id: string; text: string; level: number }[]; crumbs: string[]; creatingTask: string;
  runButton: (blockId: string, title: string) => void; createTasks: (blockId: string, titles: string[]) => void;
  syncCounts: Record<string, number>; copySync: (syncId: string) => void; linkSync: (blockId: string, code: string) => void; unsync: (blockId: string) => void;
  placeholders: Record<string, string>;
  /** Owned by the editor itself: which toggles are closed, which tab each tabs block shows, and edits to a block's content. */
  folded: ReadonlySet<string>; onFold: (id: string) => void;
  activeTabs: Record<string, number>; onTab: (id: string, index: number) => void;
  appendLines: (parentId: string, lines: string[], type?: BlockType) => void; contentActions: (parentId: string) => string[]; removeTab: (parentId: string, index: number) => void;
};
export type HostEnv = Omit<EditorEnv, 'placeholders' | 'folded' | 'onFold' | 'activeTabs' | 'onTab' | 'appendLines' | 'contentActions' | 'removeTab'>;
export const EnvContext = createContext<EditorEnv | null>(null);
const useEnv = () => { const env = useContext(EnvContext); if (!env) throw new Error('Document blocks need the editor environment.'); return env; };

const wrapperProps = (node: NodeViewProps['node'], extra = '') => ({ id: `block-${node.attrs.blockId}`, className: `aven-block aven-${String(node.attrs.type).toLowerCase()}${extra}`, 'data-block-id': String(node.attrs.blockId), 'data-type': String(node.attrs.type), 'data-indent': String(node.attrs.indent ?? 0), ...(node.attrs.span === 'half' ? { 'data-span': 'half' } : {}) });

function AtomView({ node, updateAttributes }: NodeViewProps) {
  const env = useEnv();
  const t = useT();
  const a = node.attrs as Record<string, unknown> & { type: string; blockId: string };
  const str = (key: string) => (typeof a[key] === 'string' ? (a[key] as string) : '');
  const change = (update: Record<string, unknown>) => updateAttributes(update);
  let body: ReactNode = null;
  switch (a.type) {
    case 'DIVIDER': body = <hr />; break;
    case 'TABLE': body = <TableBlock rows={a.rows} readOnly={env.readOnly} onChange={(rows) => change({ rows })} blockId={a.blockId} onCell={env.onTableCell} />; break;
    case 'IMAGE': body = <ImageBlock fileId={str('fileId') || undefined} caption={str('text')} readOnly={env.readOnly} onPick={(fileId) => change({ fileId })} onCaption={(text) => change({ text })} />; break;
    case 'VIDEO': case 'AUDIO': case 'FILE': body = <MediaBlock kind={a.type} fileId={str('fileId') || undefined} caption={str('text')} readOnly={env.readOnly} onPick={(file) => change({ fileId: file.id, ...(a.type === 'FILE' ? { text: file.name } : {}) })} onCaption={(text) => change({ text })} />; break;
    case 'BOOKMARK': body = <BookmarkBlock url={str('url')} title={str('text')} readOnly={env.readOnly} onChange={(update) => change(update)} />; break;
    case 'PAGE_LINK': body = <PageLinkBlock docId={str('docId') || undefined} create={a.create === true} currentId={env.documentId} projectId={env.projectId} readOnly={env.readOnly} onPick={(docId) => change({ docId, create: false })} />; break;
    case 'DATABASE': body = <DatabaseBlock databaseId={str('databaseId') || undefined} view={(str('view') || 'TABLE') as DatabaseView} linked={a.linked === true} create={a.create === true} readOnly={env.readOnly} onChange={(update) => change(update)} />; break;
    case 'DATABASE_LINK': body = <DatabaseLinkBlock databaseId={str('databaseId') || undefined} readOnly={env.readOnly} onPick={(id) => change({ databaseId: id, create: false })} />; break;
    case 'TOC': body = <TocBlock headings={env.headings} />; break;
    case 'BREADCRUMB': body = <BreadcrumbBlock crumbs={env.crumbs} />; break;
    case 'BUTTON': body = <ButtonBlock label={str('text')} taskTitle={str('body')} readOnly={env.readOnly} running={env.creatingTask === a.blockId} onLabel={(text) => change({ text })} onTaskTitle={(text) => change({ body: text })} onRun={() => env.runButton(a.blockId, str('body'))} />; break;
    case 'TABS': body = <TabsBlock tabs={(Array.isArray(a.tabs) ? a.tabs : []) as TabPane[]} active={env.activeTabs[a.blockId] ?? 0} readOnly={env.readOnly} onActive={(index) => env.onTab(a.blockId, index)} onRemove={(index) => env.removeTab(a.blockId, index)} onChange={(tabs) => change({ tabs })} />; break;
    case 'MEETING': body = <MeetingBlock block={{ text: str('text'), date: str('date'), attendees: str('attendees'), fileId: str('fileId') || undefined }} readOnly={env.readOnly} running={env.creatingTask === a.blockId} actionCount={env.contentActions(a.blockId).length} onChange={(update) => change(update)} onHeard={(lines) => env.appendLines(a.blockId, lines)} onTasks={() => env.createTasks(a.blockId, env.contentActions(a.blockId))} />; break;
    default: body = <p className="document-image__missing">{t('ed.unknownBlock')}</p>;
  }
  return <NodeViewWrapper {...wrapperProps(node, ' aven-atom')} contentEditable={false}>{body}</NodeViewWrapper>;
}

function ToggleView({ node }: NodeViewProps) {
  const env = useEnv();
  const t = useT();
  const id = String(node.attrs.blockId);
  const open = !env.folded.has(id);
  const level = (node.attrs.level as number) ?? 0;
  return <NodeViewWrapper {...wrapperProps(node, ` aven-toggle-l${level}`)}>
    <div className="aven-toggle__row">
      <button type="button" contentEditable={false} className={`aven-toggle__chevron${open ? ' is-open' : ''}`} aria-expanded={open} aria-label={t('ed.toggleOpen')} onClick={() => env.onFold(id)}><span aria-hidden="true">▸</span></button>
      <NodeViewContent className={`aven-content${node.content.size === 0 ? ' is-empty' : ''}`} data-placeholder={t('ed.togglePh')} />
    </div>
  </NodeViewWrapper>;
}

function SourceView({ node }: NodeViewProps) {
  const t = useT();
  const type = String(node.attrs.type);
  return <NodeViewWrapper {...wrapperProps(node)}>
    <NodeViewContent className={`aven-content aven-source${node.content.size === 0 ? ' is-empty' : ''}`} data-placeholder={t(type === 'EQUATION' ? 'bl.equationEmpty' : 'bl.mermaidEmpty')} />
    <div className="document-preview" contentEditable={false}>{type === 'EQUATION' ? <EquationPreview source={node.textContent} /> : <MermaidPreview source={node.textContent} />}</div>
  </NodeViewWrapper>;
}

function SyncedView({ node }: NodeViewProps) {
  const env = useEnv();
  const t = useT();
  const syncId = String(node.attrs.syncId ?? '');
  return <NodeViewWrapper {...wrapperProps(node)}>
    <NodeViewContent className={`aven-content${node.content.size === 0 ? ' is-empty' : ''}`} data-placeholder={t('bl.syncedPh')} />
    <div className="document-synced" contentEditable={false}>
      <span>{t('bl.synced', { n: env.syncCounts[syncId] ?? 1 })}</span>
      {!env.readOnly && <>
        <button type="button" onClick={() => env.copySync(syncId)}>{t('bl.copySync')}</button>
        <input className="document-synced__code" placeholder={t('bl.linkSync')} aria-label={t('bl.linkSync')} maxLength={36} onChange={(event) => { const code = event.target.value.trim().toLowerCase(); if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(code)) { env.linkSync(String(node.attrs.blockId), code); event.target.value = ''; } }} />
        <button type="button" onClick={() => env.unsync(String(node.attrs.blockId))}>{t('bl.unsync')}</button>
      </>}
    </div>
  </NodeViewWrapper>;
}

export const ToggleBlockView = ToggleBlock.extend({ addNodeView() { return ReactNodeViewRenderer(ToggleView); } });
export const SourceBlockView = SourceBlock.extend({ addNodeView() { return ReactNodeViewRenderer(SourceView); } });
export const SyncedBlockView = SyncedBlock.extend({ addNodeView() { return ReactNodeViewRenderer(SyncedView); } });
export const AtomBlockView = AtomBlock.extend({ addNodeView() { return ReactNodeViewRenderer(AtomView); } });
