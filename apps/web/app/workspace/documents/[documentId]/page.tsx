'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { AttachmentsPanel } from '../../files/attachments-panel';
import { ImageBlock, TableBlock } from './document-blocks';
import { SharePanel } from './share-panel';
import { FavouriteStar } from '../../favourites';
import { readEvents } from '../../messages/sse';
import { mergeBlocks } from './block-merge';

type BlockType = 'PARAGRAPH' | 'HEADING_1' | 'HEADING_2' | 'BULLET' | 'NUMBERED' | 'TODO' | 'QUOTE' | 'CODE' | 'CALLOUT' | 'DIVIDER' | 'TABLE' | 'IMAGE';
type Block = { id: string; type: BlockType; text: string; checked?: boolean; rows?: string[][]; fileId?: string };
type Document = { id: string; title: string; content: string; updatedAt: string; project: { id: string; name: string } | null };
type Version = { id: string; title: string; label: string | null; createdAt: string; createdBy: { displayName: string } };
type Comment = { id: string; body: string; createdAt: string; resolvedAt: string | null; createdBy: { id: string; displayName: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
class ConflictError extends Error { constructor(message: string, readonly current: Document) { super(message); } }
const blockTypes: { type: BlockType; label: string }[] = [
  { type: 'PARAGRAPH', label: 'Paragraph' }, { type: 'HEADING_1', label: 'Heading 1' }, { type: 'HEADING_2', label: 'Heading 2' },
  { type: 'BULLET', label: 'Bulleted list' }, { type: 'NUMBERED', label: 'Numbered list' }, { type: 'TODO', label: 'To-do item' },
  { type: 'QUOTE', label: 'Quote' }, { type: 'CODE', label: 'Code block' }, { type: 'CALLOUT', label: 'Callout' }, { type: 'DIVIDER', label: 'Divider' }, { type: 'TABLE', label: 'Table' }, { type: 'IMAGE', label: 'Image' },
];

function createBlock(type: BlockType = 'PARAGRAPH'): Block { return { id: crypto.randomUUID(), type, text: '', checked: false }; }
const readOnlyRole = (role: string | null) => role === 'GUEST';
function parseBlocks(content: string): Block[] {
  try {
    const value = JSON.parse(content) as { format?: string; blocks?: Block[] };
    if (value.format === 'aven-doc-v1' && Array.isArray(value.blocks) && value.blocks.every((block) => typeof block.id === 'string' && blockTypes.some((option) => option.type === block.type) && typeof block.text === 'string')) return value.blocks.length ? value.blocks : [createBlock()];
  } catch { /* Existing plain-text documents are opened as a first paragraph. */ }
  return [content ? { ...createBlock(), text: content } : createBlock()];
}
function encodeBlocks(blocks: Block[]) { return JSON.stringify({ format: 'aven-doc-v1', blocks }); }

export default function DocumentEditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { getToken } = useAuth();
  const { workspace, user } = useWorkspaceSession();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [blockType, setBlockType] = useState<BlockType>('PARAGRAPH');
  const [creatingTask, setCreatingTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState<Document | null>(null);
  const [activePanel, setActivePanel] = useState<'OUTLINE' | 'COMMENTS' | 'HISTORY' | 'FILES' | 'SHARE'>('OUTLINE');
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);
  const revision = useRef(0);
  const live = useRef<{ document: Document | null; blocks: Block[]; title: string; dirty: boolean; saving: boolean }>({ document: null, blocks: [], title: '', dirty: false, saving: false });
  useEffect(() => { live.current = { document, blocks, title, dirty, saving }; });

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; current?: Document } | null;
      if (response.status === 409 && body?.current) throw new ConflictError(body.message ?? 'This document was changed by someone else.', body.current);
      throw new Error(body?.message ?? 'AVEN could not complete that request.');
    }
    return response.json();
  }, [getToken]);

  const reloadCollaboration = useCallback(async () => {
    const [history, threads] = await Promise.all([
      request(`/workspaces/${workspace.id}/documents/${documentId}/versions`) as Promise<Version[]>,
      request(`/workspaces/${workspace.id}/documents/${documentId}/comments`) as Promise<Comment[]>,
    ]);
    setVersions(history); setComments(threads);
  }, [documentId, request, workspace.id]);

  /**
   * Brings in a newer saved copy. With nothing unsaved it simply replaces what is on screen. With unsaved edits it merges
   * block by block, so changes to different blocks both survive; if both of us changed the same block it returns 'conflict'
   * and leaves everything as it is for the person to choose.
   */
  const applyRemote = useCallback((latest: Document, who: string): 'same' | 'applied' | 'merged' | 'conflict' => {
    const mine = live.current;
    if (!mine.document || latest.updatedAt === mine.document.updatedAt) return 'same';
    if (!mine.dirty) {
      setDocument(latest); setTitle(latest.title); setBlocks(parseBlocks(latest.content)); revision.current += 1; setSuccess(`${who} updated this document.`);
      return 'applied';
    }
    const { blocks: merged, conflicts } = mergeBlocks(parseBlocks(mine.document.content), mine.blocks, parseBlocks(latest.content));
    if (conflicts.length) return 'conflict';
    setDocument(latest); setBlocks(merged); if (mine.title === mine.document.title) setTitle(latest.title);
    revision.current += 1; setSuccess(`${who}’s changes were merged with yours.`);
    return 'merged';
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const abort = new AbortController(); let timer: number | undefined;
    const sync = async (who: string, attempt = 0): Promise<void> => {
      if (live.current.saving && attempt < 6) { timer = window.setTimeout(() => { void sync(who, attempt + 1); }, 700); return; }
      const latest = await request(`/workspaces/${workspace.id}/documents/${documentId}`) as Document;
      if (applyRemote(latest, who) === 'conflict') setConflict(latest);
    };
    void (async () => {
      for (let attempt = 0; attempt < 6 && !abort.signal.aborted; attempt += 1) {
        try {
          const token = await getToken();
          const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents/${documentId}/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
          if (!response.ok || !response.body) return;
          for await (const event of readEvents<{ type: 'presence'; viewers: { id: string; name: string }[] } | { type: 'saved'; updatedAt: string; by: { id: string; name: string } }>(response.body)) {
            if (event.type === 'presence') setViewers(event.viewers);
            else void sync(event.by.id === user.id ? 'Another tab' : event.by.name).catch(() => undefined);
          }
        } catch { if (abort.signal.aborted) return; }
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    })();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [applyRemote, documentId, getToken, hydrated, request, user.id, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      request(`/workspaces/${workspace.id}/documents/${documentId}`) as Promise<Document>,
      request(`/workspaces/${workspace.id}/documents/${documentId}/versions`) as Promise<Version[]>,
      request(`/workspaces/${workspace.id}/documents/${documentId}/comments`) as Promise<Comment[]>,
    ]).then(([savedDocument, history, threads]) => {
      if (cancelled) return;
      setDocument(savedDocument); setTitle(savedDocument.title); setBlocks(parseBlocks(savedDocument.content)); setVersions(history); setComments(threads); setHydrated(true);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not open document.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [documentId, request, workspace.id]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    if (!document || saving) return false;
    if (!dirty) return true;
    const currentRevision = revision.current;
    const payload = { title, content: encodeBlocks(blocks), silent: true, baseUpdatedAt: document.updatedAt };
    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await request(`/workspaces/${workspace.id}/documents/${document.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Document;
      setDocument(updated);
      if (revision.current === currentRevision) {
        setDirty(false);
        return true;
      }
      return false;
    } catch (reason) {
      if (reason instanceof ConflictError) { if (applyRemote(reason.current, 'Someone') === 'conflict') setConflict(reason.current); }
      else setError(reason instanceof Error ? reason.message : 'Autosave failed.');
      return false;
    }
    finally { setSaving(false); }
  }, [applyRemote, blocks, dirty, document, request, saving, title, workspace.id]);

  useEffect(() => {
    if (!hydrated || !dirty || saving || error || conflict) return;
    const timer = window.setTimeout(() => { void saveDocument(); }, 900);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, error, hydrated, saveDocument, saving]);

  async function keepMyChanges() {
    if (!conflict) return;
    setSaving(true); setError('');
    try {
      const updated = await request(`/workspaces/${workspace.id}/documents/${conflict.id}`, { method: 'PATCH', body: JSON.stringify({ title, content: encodeBlocks(blocks), silent: true, baseUpdatedAt: conflict.updatedAt }) }) as Document;
      setDocument(updated); setConflict(null); setDirty(false); setSuccess('Your changes were saved over the other version. It remains in version history only if someone saved it there.');
    } catch (reason) {
      if (reason instanceof ConflictError) setConflict(reason.current);
      else setError(reason instanceof Error ? reason.message : 'Could not save your changes.');
    } finally { setSaving(false); }
  }

  function useTheirVersion() {
    if (!conflict || !window.confirm('Discard your unsaved changes and load the latest saved version?')) return;
    setDocument(conflict); setTitle(conflict.title); setBlocks(parseBlocks(conflict.content)); revision.current += 1; setDirty(false); setConflict(null); setSuccess('Loaded the latest saved version.');
  }

  function markChanged() { revision.current += 1; setDirty(true); setSuccess(''); }
  function changeTitle(value: string) { setTitle(value); markChanged(); }
  function changeBlock(id: string, update: Partial<Block>) { setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...update } : block)); markChanged(); }
  function insertBlock(afterId?: string) {
    const block = createBlock(blockType);
    setBlocks((current) => { if (!afterId) return [...current, block]; const index = current.findIndex((item) => item.id === afterId); return [...current.slice(0, index + 1), block, ...current.slice(index + 1)]; });
    markChanged();
    window.setTimeout(() => globalThis.document.getElementById(`block-${block.id}`)?.focus(), 0);
  }
  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => { const index = current.findIndex((item) => item.id === id); const target = index + direction; if (target < 0 || target >= current.length) return current; const next = current.slice(); [next[index], next[target]] = [next[target], next[index]]; return next; }); markChanged();
  }
  function removeBlock(id: string) { setBlocks((current) => current.length === 1 ? [createBlock()] : current.filter((block) => block.id !== id)); markChanged(); }

  const outline = useMemo(() => blocks.filter((block) => (block.type === 'HEADING_1' || block.type === 'HEADING_2') && block.text.trim()), [blocks]);

  async function saveVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { if (dirty && !await saveDocument()) return; await request(`/workspaces/${workspace.id}/documents/${documentId}/versions`, { method: 'POST', body: JSON.stringify({ label: versionLabel }) }); setVersionLabel(''); setSuccess('Version saved.'); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save version.'); }
  }

  async function restoreVersion(version: Version) {
    if (!window.confirm(`Restore “${version.label || version.title}”? AVEN will save the current document as a version first.`)) return;
    try {
      if (dirty && !await saveDocument()) return;
      const restored = await request(`/workspaces/${workspace.id}/documents/${documentId}/versions/${version.id}/restore`, { method: 'POST' }) as Document;
      setDocument(restored); setTitle(restored.title); setBlocks(parseBlocks(restored.content)); revision.current += 1; setDirty(false); setSuccess('Document version restored.'); await reloadCollaboration();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore this version.'); }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments`, { method: 'POST', body: JSON.stringify({ body: commentDraft }) }); setCommentDraft(''); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post the comment.'); }
  }

  async function toggleComment(comment: Comment) {
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ resolved: !comment.resolvedAt }) }); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this comment.'); }
  }

  async function createTaskFromBlock(block: Block) {
    if (!block.text.trim()) return;
    const rawLabels = window.prompt('Optional task labels, separated by commas:');
    if (rawLabels === null) return;
    const labels = rawLabels.split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean);
    setCreatingTask(block.id); setError(''); setSuccess('');
    try {
      await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: block.text.trim(), projectId: document?.project?.id, labels }) });
      setSuccess(document?.project ? `Task added to ${document.project.name}.` : 'Task added to My Tasks.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a task from this block.'); }
    finally { setCreatingTask(''); }
  }

  return <div className="workspace-section-page document-studio">
    <div className="document-studio__crumb"><Link href="/workspace/documents">Documents</Link><span>›</span><span>{document?.project?.name ?? workspace.name}</span><span>›</span><strong>{document?.title ?? 'Document'}</strong><span className="document-studio__save-state">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : success || 'All changes saved'}</span></div>
    {viewers.filter((viewer) => viewer.id !== user.id).length > 0 && <p className="document-presence" role="status">Also here: {viewers.filter((viewer) => viewer.id !== user.id).map((viewer) => viewer.name).join(', ')}</p>}
    {conflict && <div className="productivity-error document-conflict" role="alertdialog" aria-labelledby="document-conflict-title">
      <strong id="document-conflict-title">Someone else saved this document while you were editing.</strong>
      <p>Autosave is paused so nothing is overwritten. Your unsaved changes are still on this page.</p>
      <div><button type="button" disabled={saving} onClick={() => void keepMyChanges()}>Keep my changes</button><button type="button" disabled={saving} onClick={useTheirVersion}>Load their version</button></div>
    </div>}
    {error && <p className="productivity-error" role="alert">{error}<button type="button" onClick={() => { setError(''); void saveDocument(); }}>Retry save</button></p>}
    {loading ? <p className="productivity-message">Opening document…</p> : !document ? <div className="workspace-section-empty"><h2>Document unavailable</h2><p>This document could not be found in the current workspace.</p><Link href="/workspace/documents">Back to documents</Link></div> : <>
      <div className="document-studio__toolbar"><label>New block<select id="document-block-type" value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)}>{blockTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label><button type="button" onClick={() => insertBlock()}>＋ Add block</button><span className="document-studio__toolbar-spacer" /><button type="button" onClick={() => void saveDocument()} disabled={!dirty || saving}>Save now</button><Link href="/workspace/documents">All documents</Link><FavouriteStar kind="DOCUMENT" entityId={document?.id} /></div>
      <div className="document-studio__layout">
        <main className="document-studio__paper">
          <p className="workspace-eyebrow">AVEN DOCUMENT · {document.project?.name ?? 'PERSONAL'}</p>
          <input className="document-studio__title" value={title} onChange={(event) => changeTitle(event.target.value)} maxLength={200} aria-label="Document title" />
          <div className="document-studio__blocks">{blocks.map((block, index) => <section className={`document-block document-block--${block.type.toLowerCase()}`} key={block.id}>
            <div className="document-block__controls"><select aria-label={`Block type for block ${index + 1}`} value={block.type} onChange={(event) => changeBlock(block.id, { type: event.target.value as BlockType })}>{blockTypes.map((option) => <option value={option.type} key={option.type}>{option.label}</option>)}</select><button type="button" onClick={() => moveBlock(block.id, -1)} disabled={index === 0} aria-label="Move block up">↑</button><button type="button" onClick={() => moveBlock(block.id, 1)} disabled={index === blocks.length - 1} aria-label="Move block down">↓</button><button type="button" onClick={() => removeBlock(block.id)} aria-label="Delete block">×</button></div>
            {block.type === 'DIVIDER' ? <hr /> : block.type === 'TABLE' ? <TableBlock rows={block.rows} readOnly={readOnlyRole(workspace.role)} onChange={(rows) => changeBlock(block.id, { rows })} /> : block.type === 'IMAGE' ? <ImageBlock fileId={block.fileId} caption={block.text} readOnly={readOnlyRole(workspace.role)} onPick={(fileId) => changeBlock(block.id, { fileId })} onCaption={(text) => changeBlock(block.id, { text })} /> : <div className="document-block__body">{block.type === 'TODO' && <input type="checkbox" checked={Boolean(block.checked)} onChange={(event) => changeBlock(block.id, { checked: event.target.checked })} aria-label="Mark to-do complete" />}<span className="document-block__prefix" aria-hidden="true">{block.type === 'BULLET' ? '•' : block.type === 'NUMBERED' ? `${index + 1}.` : ''}</span><textarea id={`block-${block.id}`} value={block.text} onChange={(event) => changeBlock(block.id, { text: event.target.value })} placeholder={block.type === 'CODE' ? 'Write code…' : block.type === 'CALLOUT' ? 'Add a useful callout…' : 'Write something…'} aria-label={`${blockTypes.find((option) => option.type === block.type)?.label ?? 'Text'} block ${index + 1}`} rows={block.type === 'HEADING_1' || block.type === 'HEADING_2' ? 1 : 2} /></div>}
            <div className="document-block__actions">{block.type === 'TODO' && block.text.trim() && <button type="button" disabled={creatingTask === block.id} onClick={() => void createTaskFromBlock(block)}>{creatingTask === block.id ? 'Creating…' : 'Create task'}</button>}<button className="document-block__insert" type="button" onClick={() => insertBlock(block.id)}>＋ Add below</button></div>
          </section>)}</div>
        </main>
        <aside className="document-studio__sidebar"><nav className="document-studio__tabs" aria-label="Document tools">{(['OUTLINE', 'COMMENTS', 'HISTORY', 'FILES', 'SHARE'] as const).map((tab) => <button type="button" key={tab} className={activePanel === tab ? 'is-active' : ''} onClick={() => setActivePanel(tab)}>{tab === 'OUTLINE' ? 'Outline' : tab === 'COMMENTS' ? `Comments ${comments.filter((item) => !item.resolvedAt).length || ''}` : tab === 'FILES' ? 'Files' : tab === 'SHARE' ? 'Share' : 'History'}</button>)}</nav>
          {activePanel === 'SHARE' && <SharePanel documentId={document.id} />}
          {activePanel === 'FILES' && <section className="document-studio__panel"><AttachmentsPanel target={{ documentId: document.id }} /></section>}
          {activePanel === 'OUTLINE' && <section className="document-studio__panel"><h2>On this page</h2>{outline.length === 0 ? <p>Add a heading block to create an outline.</p> : <nav>{outline.map((block) => <a className={block.type === 'HEADING_2' ? 'is-nested' : ''} key={block.id} href={`#block-${block.id}`}>{block.text}</a>)}</nav>}</section>}
          {activePanel === 'COMMENTS' && <section className="document-studio__panel"><h2>Comments</h2><form className="document-studio__comment-form" onSubmit={addComment}><textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={2000} required placeholder="Add a comment to this document…" /><button type="submit">Post comment</button></form><div className="document-studio__comments">{comments.length === 0 ? <p>Document feedback and decisions will appear here.</p> : comments.map((comment) => <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}><div><strong>{comment.createdBy.displayName}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(comment.createdAt))}</time></div><p>{comment.body}</p><button type="button" onClick={() => void toggleComment(comment)}>{comment.resolvedAt ? 'Reopen' : 'Resolve'}</button></article>)}</div></section>}
          {activePanel === 'HISTORY' && <section className="document-studio__panel"><h2>Version history</h2><form className="document-studio__version-form" onSubmit={saveVersion}><input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} placeholder="Optional version note" /><button type="submit">Save version</button></form><div className="document-studio__versions">{versions.length === 0 ? <p>No saved versions yet. Create a version before a major edit.</p> : versions.map((version) => <article key={version.id}><strong>{version.label || version.title}</strong><small>{version.createdBy.displayName} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</small><button type="button" onClick={() => void restoreVersion(version)}>Restore</button></article>)}</div></section>}
        </aside>
      </div>
    </>}
  </div>;
}
