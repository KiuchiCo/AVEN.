'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { useWorkspaceSession } from '../../workspace-shell';
import { AttachmentsPanel } from '../../files/attachments-panel';
import { SharePanel } from './share-panel';
import type { CatalogEntry } from './block-catalog';
import { DocumentHeader } from './document-header';
import { EditorIcon } from './editor-icons';
import { EditorToolbar } from './editor-toolbar';
import { BlockBrowser } from './editor-ui';
import type { AiRequest } from './AiAssist';
import { noFormat, type FormatState, DocEditor, type DocEditorApi, type LocalChange, type SelectionReport } from './DocEditor';
import { blankBlock, blockTypeList, liftBodies, headingLevel, isLiveText, normalizeBlock } from './editor-model';
import { readEvents } from '../../messages/sse';
import { mergeBlocks, reconcileDraft } from './block-merge';
import { LiveTextEngine, type CursorEvent, type RemoteCursor, type TextEvent } from './live-text';
import { isLocalId, readLocalDocument, removeLocalDocument } from './local-documents';
import { draftKey, readDraft, removeDraft, writeDraft } from './offline-draft';

import type { Block } from './editor-model';
import { connectionError } from '../../connection-error';
type Document = { id: string; title: string; content: string; updatedAt: string; project: { id: string; name: string } | null };
type Version = { id: string; title: string; label: string | null; createdAt: string; createdBy: { displayName: string } };
type Comment = { id: string; body: string; createdAt: string; resolvedAt: string | null; blockId: string | null; quote: string | null; parentId: string | null; createdBy: { id: string; displayName: string } };
type DocSummary = { id: string; title: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
class ConflictError extends Error { constructor(message: string, readonly current: Document) { super(message); } }
/** The request never reached the server: no connection, or the sign-in token could not be refreshed. */
class OfflineError extends Error {}
/** The server answered with an error; `status` is its HTTP status. */
class HttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const readOnlyRole = (role: string | null) => role === 'GUEST';
function parseBlocks(content: string): Block[] {
  try {
    const value = JSON.parse(content) as { format?: string; blocks?: Block[] };
    if (value.format === 'aven-doc-v1' && Array.isArray(value.blocks) && value.blocks.every((block) => typeof block.id === 'string' && blockTypeList.includes(block.type) && typeof block.text === 'string')) return value.blocks.length ? liftBodies(value.blocks.map(normalizeBlock)) : [createBlock()];
  } catch { /* Existing plain-text documents are opened as a first paragraph. */ }
  return [content ? { ...createBlock(), text: content } : createBlock()];
}
/** Scrolls a block into view and briefly marks it, for links to a block and for comments. */
function document_scrollTo(id: string) { const node = window.document.getElementById(`block-${id}`); if (!node) return; node.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); node.classList.add('is-flash'); window.setTimeout(() => node.classList.remove('is-flash'), 1600); }
const createBlock = (): Block => blankBlock(crypto.randomUUID(), 'PARAGRAPH', {});
const presenceColours = ['#A48766', '#6B5746', '#6F8A62', '#5F7399', '#9A5C68'];
/** Each person gets the same colour for as long as they are in the document, whoever else is there. */
function presenceColour(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return presenceColours[hash % presenceColours.length]; }
function encodeBlocks(blocks: Block[]) { return JSON.stringify({ format: 'aven-doc-v1', blocks }); }

export default function DocumentEditorPage() {
  const t = useT();
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  /** A document made while offline: kept on this device under a temporary id until it can be created. */
  const local = isLocalId(documentId);
  const { getToken } = useAuth();
  const { workspace, user } = useWorkspaceSession();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [commentTarget, setCommentTarget] = useState<{ blockId: string; quote: string } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null);
  const [moving, setMoving] = useState<{ block: Block; docs: DocSummary[] | null } | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState<Document | null>(null);
  const openShare = useSearchParams().get('panel') === 'share';
  const [saveFailed, setSaveFailed] = useState(false);
  const [format, setFormat] = useState<FormatState>(noFormat);
  const [viewing, setViewing] = useState(false);
  const [linkRequest, setLinkRequest] = useState(0);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const updateCollapsed = (next: boolean) => { setToolbarCollapsed(next); try { window.localStorage.setItem('aven.editor.toolbar', next ? 'collapsed' : 'open'); } catch { /* not remembered */ } };
  const updatePanelOpen = (next: boolean) => { setPanelOpen(next); try { window.localStorage.setItem('aven.editor.panel', next ? 'open' : 'closed'); } catch { /* not remembered */ } };
  useEffect(() => { let live = true; void Promise.resolve().then(() => { try { if (!live) return; if (window.localStorage.getItem('aven.editor.toolbar') === 'collapsed') setToolbarCollapsed(true); if (window.localStorage.getItem('aven.editor.panel') === 'closed' && !openShare) setPanelOpen(false); } catch { /* ignore */ } }); return () => { live = false; }; }, [openShare]);
  const [offline, setOffline] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor[]>>({});
  const liveEngine = useRef<LiveTextEngine | null>(null);
  const [activePanel, setActivePanel] = useState<'OUTLINE' | 'COMMENTS' | 'HISTORY' | 'FILES' | 'SHARE' | 'RELATED'>(() => (openShare ? 'SHARE' : 'OUTLINE'));
  const [viewers, setViewers] = useState<{ id: string; name: string; blockId: string | null; connections?: number }[]>([]);
  const revision = useRef(0);
  const announced = useRef<{ sent: string | null; timer?: number }>({ sent: null });
  const live = useRef<{ document: Document | null; blocks: Block[]; title: string; dirty: boolean; saving: boolean }>({ document: null, blocks: [], title: '', dirty: false, saving: false });
  useEffect(() => { live.current = { document, blocks, title, dirty, saving }; });

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    let token: string | null = null;
    try { token = await getToken(); } catch { throw new OfflineError('offline'); }
    if (!token && typeof navigator !== 'undefined' && !navigator.onLine) throw new OfflineError('offline');
    if (!token || !apiBase) throw connectionError(token);
    let response: Response;
    try { response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } }); }
    catch { throw new OfflineError('offline'); }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; current?: Document } | null;
      if (response.status === 409 && body?.current) throw new ConflictError(body.message ?? 'This document was changed by someone else.', body.current);
      throw new HttpError(body?.message ?? 'AVEN could not complete that request.', response.status);
    }
    return response.status === 204 ? null : response.json();
  }, [getToken]);

  /** Tells the others which block my cursor is in. Waits a moment so moving between blocks sends one message, not two. */
  const announceFocus = useCallback((blockId: string | null) => {
    const state = announced.current;
    window.clearTimeout(state.timer);
    if (local) return;
    state.timer = window.setTimeout(() => {
      if (state.sent === blockId) return;
      state.sent = blockId;
      void request(`/workspaces/${workspace.id}/documents/${documentId}/focus`, { method: 'POST', body: JSON.stringify({ blockId }) }).catch(() => { state.sent = null; });
    }, 250);
  }, [documentId, local, request, workspace.id]);
  useEffect(() => { const state = announced.current; return () => window.clearTimeout(state.timer); }, []);

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
  // The engine outlives re-renders; it reaches the latest request function and translator through these.
  const latest = useRef({ request, t });
  useEffect(() => { latest.current = { request, t }; });

  // Keystroke-level editing of block text. Blocks join when first focused (or when someone else's edit to them arrives).
  useEffect(() => {
    const engine = new LiveTextEngine(crypto.randomUUID(), {
      get: (blockId) => latest.current.request(`/workspaces/${workspace.id}/documents/${documentId}/text/${blockId}`) as Promise<{ text: string; revision: number }>,
      post: async (blockId, body) => { await latest.current.request(`/workspaces/${workspace.id}/documents/${documentId}/text/${blockId}/ops`, { method: 'POST', body: JSON.stringify(body) }); },
      cursor: async (blockId, body) => { await latest.current.request(`/workspaces/${workspace.id}/documents/${documentId}/text/${blockId}/cursor`, { method: 'POST', body: JSON.stringify(body) }); },
      fence: async (blockId, clientId) => { await latest.current.request(`/workspaces/${workspace.id}/documents/${documentId}/text/${blockId}/fence`, { method: 'POST', body: JSON.stringify({ clientId }) }); },
    }, {
      readText: (blockId) => live.current.blocks.find((block) => block.id === blockId)?.text,
      writeText: (blockId, text) => { setBlocks((current) => current.map((block) => (block.id === blockId ? { ...block, text } : block))); },
      changed: () => setLiveBusy(engine.unsettled),
      cursors: (blockId, list) => setRemoteCursors((current) => (list.length || current[blockId]?.length ? { ...current, [blockId]: list } : current)),
      reset: () => setSuccess(latest.current.t('ed.liveReset')),
    });
    liveEngine.current = engine;
    return () => { engine.stop(); liveEngine.current = null; };
  }, [documentId, workspace.id]);

  const applyRemote = useCallback((latest: Document, who: string): 'same' | 'applied' | 'merged' | 'conflict' => {
    const mine = live.current;
    if (!mine.document || latest.updatedAt === mine.document.updatedAt) return 'same';
    if (!mine.dirty) {
      const engine = liveEngine.current;
      const next = parseBlocks(latest.content).map((block) => (engine?.has(block.id) ? { ...block, text: engine.screen(block.id) ?? block.text } : block)); // what is being typed live stays as typed
      engine?.prune(new Set(next.map((block) => block.id)));
      setDocument(latest); setTitle(latest.title); setBlocks(next); revision.current += 1; setSuccess(t('ed.updatedBy', { who }));
      return 'applied';
    }
    const engine = liveEngine.current;
    const { blocks: combined, conflicts } = mergeBlocks(parseBlocks(mine.document.content), mine.blocks, parseBlocks(latest.content));
    if (conflicts.some((id) => !engine?.has(id))) return 'conflict'; // blocks edited live are reconciled word by word elsewhere
    const merged = combined.map((block) => (engine?.has(block.id) ? { ...block, text: engine.screen(block.id) ?? block.text } : block));
    engine?.prune(new Set(merged.map((block) => block.id)));
    setDocument(latest); setBlocks(merged); if (mine.title === mine.document.title) setTitle(latest.title);
    revision.current += 1; setSuccess(t('ed.merged', { who }));
    return 'merged';
  }, [t]);

  useEffect(() => {
    if (!hydrated || local) return;
    const abort = new AbortController(); let timer: number | undefined;
    const sync = async (who: string, attempt = 0, replaced = false): Promise<void> => {
      if (live.current.saving && attempt < 6) { timer = window.setTimeout(() => { void sync(who, attempt + 1, replaced); }, 700); return; }
      const latest = await request(`/workspaces/${workspace.id}/documents/${documentId}`) as Document;
      if (replaced) { liveEngine.current?.clear(); } // a restored version replaces everything: nothing typed before it may survive it
      if (applyRemote(latest, who) === 'conflict') setConflict(latest);
    };
    void (async () => {
      let failures = 0; let reconnecting = false; // the server ends a stream after a while so its sign-in is checked again: that is normal, so only consecutive failures count
      while (!abort.signal.aborted && failures < 6) {
        try {
          const token = await getToken();
          const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents/${documentId}/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
          if (!response.ok || !response.body) { if (response.status < 500 && response.status !== 429) return; throw new Error('stream refused'); }
          failures = 0;
          if (reconnecting) liveEngine.current?.resyncAll(); // events may have been missed while the connection was down
          reconnecting = true;
          for await (const event of readEvents<{ type: 'presence'; viewers: { id: string; name: string; blockId: string | null; connections?: number }[] } | { type: 'saved'; updatedAt: string; by: { id: string; name: string }; replaced?: boolean } | ({ type: 'text' } & TextEvent) | ({ type: 'cursor' } & CursorEvent)>(response.body)) {
            if (event.type === 'presence') { setViewers(event.viewers); liveEngine.current?.keepCursorsOf(new Set(event.viewers.map((viewer) => viewer.id))); }
            else if (event.type === 'text') liveEngine.current?.handle(event);
            else if (event.type === 'cursor') liveEngine.current?.handleCursor(event);
            else void sync(event.by.id === user.id ? t('ed.anotherTab') : event.by.name, 0, event.replaced === true).catch(() => undefined);
          }
        } catch { if (abort.signal.aborted) return; failures += 1; }
        await new Promise((resolve) => setTimeout(resolve, failures ? Math.min(2000 * failures, 10_000) : 300));
      }
    })();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [applyRemote, documentId, getToken, hydrated, local, request, t, user.id, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    if (local) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        const found = readLocalDocument(window.localStorage, { userId: user.id, workspaceId: workspace.id }, documentId);
        if (found) {
          setDocument({ id: found.id, title: found.title, content: found.content, updatedAt: '', project: found.projectId ? { id: found.projectId, name: '' } : null });
          setTitle(found.title); setBlocks(parseBlocks(found.content)); setHydrated(true); revision.current += 1; setDirty(true);
        }
        setLoading(false);
      });
      return () => { cancelled = true; };
    }
    void Promise.all([
      request(`/workspaces/${workspace.id}/documents/${documentId}`) as Promise<Document>,
      request(`/workspaces/${workspace.id}/documents/${documentId}/versions`) as Promise<Version[]>,
      request(`/workspaces/${workspace.id}/documents/${documentId}/comments`) as Promise<Comment[]>,
    ]).then(([savedDocument, history, threads]) => {
      if (cancelled) return;
      const latestBlocks = parseBlocks(savedDocument.content);
      let start = { title: savedDocument.title, blocks: latestBlocks }, restored = false, clash = false;
      const unseen: { id: string; base: string; mine: string }[] = []; // restored text the server has not seen
      // Edits that were never saved (connection lost, tab closed) are brought back onto whatever is saved now.
      try {
        const key = draftKey(user.id, workspace.id, documentId);
        const draft = readDraft(window.localStorage, key);
        if (draft) {
          const result = reconcileDraft({ title: draft.title, blocks: parseBlocks(draft.content), base: { updatedAt: draft.base.updatedAt, title: draft.base.title, blocks: parseBlocks(draft.base.content) } }, { updatedAt: savedDocument.updatedAt, title: savedDocument.title, blocks: latestBlocks });
          if (!result.conflict && result.title === savedDocument.title && JSON.stringify(result.blocks) === JSON.stringify(latestBlocks)) removeDraft(window.localStorage, key);
          else {
            start = result; restored = true; clash = result.conflict;
            const draftBase = parseBlocks(draft.base.content);
            for (const block of result.blocks) {
              const saved = latestBlocks.find((candidate) => candidate.id === block.id);
              if (saved && saved.text !== block.text && block.type !== 'DIVIDER' && block.type !== 'TABLE' && block.type !== 'IMAGE') unseen.push({ id: block.id, base: draftBase.find((candidate) => candidate.id === block.id)?.text ?? saved.text, mine: block.text });
            }
          }
        }
      } catch { /* A draft that can't be read is left alone. */ }
      setDocument(savedDocument); setTitle(start.title); setBlocks(start.blocks); setVersions(history); setComments(threads); setHydrated(true);
      if (restored) {
        revision.current += 1; setDirty(true); setSuccess(t('ed.draftRestored')); if (clash) setConflict(savedDocument);
        // Text others may be editing live right now must go in as live edits, or the live text would replace it on the next save.
        if (!readOnlyRole(workspace.role)) for (const block of unseen) void liveEngine.current?.join(block.id, { base: block.base, mine: block.mine });
      }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not open document.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [documentId, local, request, t, user.id, workspace.id, workspace.role]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    if (!document || saving) return false;
    if (!dirty) return true;
    const currentRevision = revision.current;
    // A document always has a name on the server; an empty title stays empty on screen but is saved as "Untitled", so it can never block saving the text.
    const payload = { title: title.trim() || 'Untitled', content: encodeBlocks(blocks), silent: true, baseUpdatedAt: document.updatedAt };
    setSaving(true); setError(''); setSuccess('');
    if (local) {
      // First save of a document made offline: create it for real with what it holds now, then move to its own address.
      try {
        const created = await request(`/workspaces/${workspace.id}/documents`, { method: 'POST', body: JSON.stringify({ title: payload.title, content: payload.content, projectId: document.project?.id }) }) as Document;
        setOffline(false);
        removeLocalDocument(window.localStorage, { userId: user.id, workspaceId: workspace.id }, document.id);
        router.replace(`/workspace/documents/${created.id}`);
        return true;
      } catch (reason) {
        setOffline(reason instanceof OfflineError);
        if (!(reason instanceof OfflineError)) setError(reason instanceof Error ? reason.message : 'Could not create the document.');
        return false;
      } finally { setSaving(false); }
    }
    try {
      const updated = await request(`/workspaces/${workspace.id}/documents/${document.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Document;
      setDocument(updated); setOffline(false); setSaveFailed(false);
      if (revision.current === currentRevision) {
        setDirty(false);
        return true;
      }
      return false;
    } catch (reason) {
      setOffline(reason instanceof OfflineError); // any answer from the server means the connection is back
      if (reason instanceof OfflineError) { /* kept on this device; retried when the connection returns */ }
      else if (reason instanceof ConflictError) { if (applyRemote(reason.current, t('ed.someone')) === 'conflict') setConflict(reason.current); }
      else { setSaveFailed(true); setError(`${t('ed.saveFailedBody')}${reason instanceof Error && reason.message ? ` (${reason.message})` : ''}`); }
      return false;
    }
    finally { setSaving(false); }
  }, [applyRemote, blocks, dirty, document, local, request, router, saving, t, title, user.id, workspace.id]);

  useEffect(() => {
    if (!hydrated || !dirty || saving || error || conflict || offline) return;
    const timer = window.setTimeout(() => { void saveDocument(); }, 900);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, error, hydrated, offline, saveDocument, saving]);

  // While offline, try again when the connection returns and every few seconds in case the browser doesn't say.
  useEffect(() => {
    if (!offline) return;
    const retry = () => { void saveDocument(); };
    const timer = window.setInterval(retry, 8000);
    window.addEventListener('online', retry);
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
  }, [offline, saveDocument]);

  // Printing shows the document alone, in the light theme whatever the app is set to (see the print rules in redesign.css). Ctrl/Cmd + P and the Print buttons both go through here.
  useEffect(() => {
    const root = window.document.documentElement; let theme: string | null | undefined;
    const before = () => { theme = root.getAttribute('data-theme'); root.setAttribute('data-theme', 'light'); root.classList.add('print-doc'); };
    const after = () => { root.classList.remove('print-doc'); if (theme === undefined) return; if (theme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme); theme = undefined; };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); after(); };
  }, []);

  // After a failed save the edits stay in the editor and on this device; try again when the connection returns and now and then, so a passing server error recovers by itself.
  useEffect(() => {
    if (!saveFailed || !dirty) return;
    const retry = () => { void saveDocument(); };
    const timer = window.setInterval(retry, 20_000);
    window.addEventListener('online', retry);
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
  }, [dirty, saveDocument, saveFailed]);

  // Keep unsaved edits on this device until the server has them.
  useEffect(() => {
    if (!hydrated || !document) return;
    const key = draftKey(user.id, workspace.id, documentId);
    if (!dirty && !liveBusy) { removeDraft(window.localStorage, key); return; }
    const timer = window.setTimeout(() => writeDraft(window.localStorage, key, { title, content: encodeBlocks(blocks), base: { updatedAt: document.updatedAt, title: document.title, content: document.content }, savedAt: new Date().toISOString() }), 300);
    return () => window.clearTimeout(timer);
  }, [blocks, dirty, document, documentId, hydrated, liveBusy, title, user.id, workspace.id]);

  useEffect(() => {
    if (!dirty && !liveBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, liveBusy]);

  async function keepMyChanges() {
    if (!conflict) return;
    setSaving(true); setError('');
    try {
      const updated = await request(`/workspaces/${workspace.id}/documents/${conflict.id}`, { method: 'PATCH', body: JSON.stringify({ title, content: encodeBlocks(blocks), silent: true, baseUpdatedAt: conflict.updatedAt }) }) as Document;
      setDocument(updated); setConflict(null); setDirty(false); setSuccess(t('ed.savedOver'));
    } catch (reason) {
      if (reason instanceof ConflictError) setConflict(reason.current);
      else setError(reason instanceof Error ? reason.message : 'Could not save your changes.');
    } finally { setSaving(false); }
  }

  function useTheirVersion() {
    if (!conflict || !window.confirm(t('ed.discardConfirm'))) return;
    liveEngine.current?.clear(); setDocument(conflict); setTitle(conflict.title); setBlocks(parseBlocks(conflict.content)); revision.current += 1; setDirty(false); setConflict(null); setSuccess(t('ed.loadedLatest'));
  }

  function markChanged() { revision.current += 1; setDirty(true); setSuccess(''); }
  // Synced blocks share their text across documents through the server; this document keeps a copy so it still reads offline.
  const syncTimers = useRef<Record<string, number>>({});
  function pushSynced(syncId: string, text: string) {
    if (readOnlyRole(workspace.role)) return;
    window.clearTimeout(syncTimers.current[syncId]);
    syncTimers.current[syncId] = window.setTimeout(() => { void request(`/workspaces/${workspace.id}/synced-blocks/${syncId}`, { method: 'PUT', body: JSON.stringify({ text }) }).catch(() => undefined); }, 600);
  }
  const crumbs = [t('ed.crumbDocuments'), document?.project?.name ?? workspace.name, document?.title ?? title];
  const headingsForToc = blocks.filter((block) => headingLevel(block) > 0 && block.text.trim()).map((block) => ({ id: block.id, text: block.text, level: headingLevel(block) }));
  async function runButton(block: Block) {
    const taskTitle = (block.body ?? '').trim(); if (!taskTitle) return;
    setCreatingTask(block.id); setError(''); setSuccess('');
    try { await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: taskTitle, projectId: document?.project?.id }) }); setSuccess(document?.project ? t('ed.taskAddedProject', { name: document.project.name }) : t('ed.taskAdded')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the task.'); }
    finally { setCreatingTask(''); }
  }
  async function createTasks(blockId: string, titles: string[]) {
    setCreatingTask(blockId); setError(''); setSuccess('');
    try { for (const title of titles.slice(0, 30)) await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200), projectId: document?.project?.id }) }); setSuccess(t('ed.tasksAdded', { n: Math.min(titles.length, 30) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the tasks.'); }
    finally { setCreatingTask(''); }
  }

  // ---- The editor: what it reports, and what it is told ------------------------------------------------------------------------
  const editorApi = useRef<DocEditorApi | null>(null);
  // AI is offered only when this workspace has a model provider and this person may edit.
  const [aiReady, setAiReady] = useState(false);
  useEffect(() => {
    if (readOnlyRole(workspace.role)) return;
    let cancelled = false;
    void (request(`/workspaces/${workspace.id}/ai/status`) as Promise<{ configured: boolean }>).then((status) => { if (!cancelled) setAiReady(status.configured); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [request, workspace.id, workspace.role]);
  const assist = useCallback(async (input: AiRequest) => {
    const result = await request(`/workspaces/${workspace.id}/ai/assist`, { method: 'POST', body: JSON.stringify({ ...input, documentId }) }) as { text: string };
    return result.text;
  }, [request, workspace.id, documentId]);
  const addEntry = (entry: CatalogEntry | undefined) => { const api = editorApi.current; if (entry && api) api.insertEntry(entry, api.currentBlockId() ?? undefined); };
  const reported = useRef<{ id: string | null; timer?: number }>({ id: null });
  /** Called for every change made in the editor. Text typed into a block that is live goes out as one small edit; anything else is saved with the document. */
  const handleEditorChange = useCallback(({ title: nextTitle, blocks: next, previous }: LocalChange) => {
    const engine = liveEngine.current; const before = new Map(previous.map((block) => [block.id, block]));
    const structural = next.length !== previous.length || next.some((block, index) => previous[index]?.id !== block.id);
    const changedText: Block[] = []; let other = false;
    if (!structural) for (const block of next) {
      const old = before.get(block.id); if (!old || old === block || JSON.stringify(old) === JSON.stringify(block)) continue;
      const { text: oldText, ...oldRest } = old; const { text: newText, ...newRest } = block; void oldText; void newText;
      if (JSON.stringify(oldRest) === JSON.stringify(newRest)) changedText.push(block); else other = true;
    }
    let final = next; let syncedTouched = false;
    for (const block of changedText) if (block.type === 'SYNCED' && block.syncId) { syncedTouched = true; final = final.map((item) => (item.syncId === block.syncId && item.id !== block.id ? { ...item, text: block.text } : item)); pushSynced(block.syncId, block.text); }
    if (structural) engine?.clear();
    const sent = changedText.map((block) => engine?.edit(block.id, block.text) ?? false);
    const allLive = changedText.length > 0 && sent.every(Boolean);
    live.current.blocks = final; setBlocks(final);
    const titleChanged = nextTitle !== live.current.title; if (titleChanged) { live.current.title = nextTitle; setTitle(nextTitle); }
    if (structural || other || syncedTouched || titleChanged || !allLive) markChanged();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- pushSynced and markChanged only touch refs and setters

  /** Where the caret is: tell the others which block I am in, join its live text, and share the caret itself after a short pause. */
  const handleSelection = useCallback((report: SelectionReport) => {
    const engine = liveEngine.current; const was = reported.current;
    window.clearTimeout(was.timer);
    if (was.id && was.id !== report.id) engine?.reportCursor(was.id, null, null);
    was.id = report.id;
    announceFocus(report.id);
    if (!report.id || !report.inline || readOnlyRole(workspace.role)) return;
    const block = live.current.blocks.find((item) => item.id === report.id);
    const id = report.id; const joined = !local && block && isLiveText(block.type) ? engine?.join(id) : undefined;
    // The caret is shared once the block's live text is joined, otherwise there is nothing for its position to refer to.
    was.timer = window.setTimeout(() => { void Promise.resolve(joined).then(() => engine?.reportCursor(id, report.start, report.end)); }, 250);
  }, [announceFocus, local, workspace.role]);

  const editorCursors = useMemo(() => Object.fromEntries(Object.entries(remoteCursors).map(([id, list]) => [id, list.map((cursor) => ({ ...cursor, colour: presenceColour(cursor.userId) }))])), [remoteCursors]);
  const editorOthers = useMemo(() => { const out: Record<string, { name: string; colour: string }> = {}; for (const viewer of viewers) if (viewer.id !== user.id && viewer.blockId) out[viewer.blockId] = { name: out[viewer.blockId] ? `${out[viewer.blockId].name}, ${viewer.name}` : viewer.name, colour: presenceColour(viewer.id) }; return out; }, [viewers, user.id]);
  const syncCounts = useMemo(() => { const out: Record<string, number> = {}; for (const block of blocks) if (block.type === 'SYNCED' && block.syncId) out[block.syncId] = (out[block.syncId] ?? 0) + 1; return out; }, [blocks]);
  const editorEnv = {
    readOnly: readOnlyRole(workspace.role), documentId, projectId: document?.project?.id, headings: headingsForToc, crumbs, creatingTask,
    runButton: (blockId: string, title: string) => { void runButton({ id: blockId, type: 'BUTTON', text: '', body: title }); }, createTasks,
    syncCounts, copySync: (syncId: string) => { void navigator.clipboard?.writeText(syncId).then(() => setSuccess(t('bl.syncCopied'))).catch(() => setError(t('bl.syncCopyFailed'))); },
    linkSync: (blockId: string, code: string) => { liveEngine.current?.clear(); setBlocks((current) => current.map((item) => (item.id === blockId ? { ...item, syncId: code } : item))); markChanged(); },
    unsync: (blockId: string) => { liveEngine.current?.clear(); setBlocks((current) => current.map((item) => (item.id === blockId ? { id: item.id, type: 'PARAGRAPH', text: item.text, checked: false } : item))); markChanged(); },
  };

  // A link to a block (#block-<id>) scrolls to it once the document has opened.
  useEffect(() => { if (!hydrated) return; const id = window.location.hash.match(/^#block-(.+)$/)?.[1]; if (id) window.setTimeout(() => document_scrollTo(id), 200); }, [hydrated]);

  const syncIds = useMemo(() => [...new Set(blocks.filter((block) => block.type === 'SYNCED' && block.syncId).map((block) => block.syncId as string))].sort().join(','), [blocks]);
  useEffect(() => {
    if (!syncIds || !hydrated) return;
    let active = true;
    const pull = async () => {
      for (const id of syncIds.split(',')) {
        try {
          const row = await request(`/workspaces/${workspace.id}/synced-blocks/${id}`) as { text: string };
          if (!active) return;
          const focused = globalThis.document.activeElement?.id ?? '';
          setBlocks((current) => { const mine = current.find((block) => block.syncId === id); if (!mine || mine.text === row.text || focused === `block-${mine.id}`) return current; return current.map((block) => (block.syncId === id ? { ...block, text: row.text } : block)); });
        } catch (reason) {
          // first use of this block anywhere: publish what this document has so other documents can share it
          if (reason instanceof HttpError && reason.status === 404 && !readOnlyRole(workspace.role)) { const mine = live.current.blocks.find((block) => block.syncId === id); if (mine) pushSynced(id, mine.text); }
        }
      }
    };
    void pull();
    const again = () => { void pull(); };
    window.addEventListener('focus', again);
    const timer = window.setInterval(again, 20000);
    return () => { active = false; window.removeEventListener('focus', again); window.clearInterval(timer); };
  }, [syncIds, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps -- request and pushSynced are stable enough for this; the ids and hydration are what matter
  const words = useMemo(() => blocks.reduce((sum, block) => sum + (block.text.trim() ? block.text.trim().split(/\s+/).length : 0), 0), [blocks]);
  // Related documents: the others in this project, and the ones edited most recently.
  const [others, setOthers] = useState<{ id: string; title: string; updatedAt: string; project?: { id: string } | null }[] | null>(null);
  useEffect(() => {
    if (activePanel !== 'RELATED') return;
    let cancelled = false;
    void (request(`/workspaces/${workspace.id}/documents`) as Promise<{ id: string; title: string; updatedAt: string; project?: { id: string } | null }[]>).then((rows) => { if (!cancelled) setOthers(rows.filter((row) => row.id !== documentId)); }).catch(() => { if (!cancelled) setOthers([]); });
    return () => { cancelled = true; };
  }, [activePanel, request, workspace.id, documentId]);
  const outline = useMemo(() => blocks.filter((block) => headingLevel(block) > 0 && block.text.trim()), [blocks]);
  // The heading the reader is in: the last heading that has scrolled past the top of the page.
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const outlineKey = outline.map((block) => block.id).join();
  useEffect(() => {
    if (!outlineKey) return;
    const ids = outlineKey.split(',');
    const update = () => {
      let current = ids[0];
      for (const id of ids) { const node = window.document.getElementById(`block-${id}`); if (node && node.getBoundingClientRect().top <= 120) current = id; }
      setActiveHeading(current);
    };
    const first = window.requestAnimationFrame(update);
    window.addEventListener('scroll', update, { passive: true, capture: true }); window.addEventListener('resize', update);
    return () => { window.cancelAnimationFrame(first); window.removeEventListener('scroll', update, { capture: true }); window.removeEventListener('resize', update); };
  }, [outlineKey]);

  async function saveVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { if (dirty && !await saveDocument()) return; await request(`/workspaces/${workspace.id}/documents/${documentId}/versions`, { method: 'POST', body: JSON.stringify({ label: versionLabel }) }); setVersionLabel(''); setSuccess(t('ed.versionSaved')); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save version.'); }
  }

  async function restoreVersion(version: Version) {
    if (!window.confirm(t('ed.restoreConfirm', { name: version.label || version.title }))) return;
    try {
      if (dirty && !await saveDocument()) return;
      const restored = await request(`/workspaces/${workspace.id}/documents/${documentId}/versions/${version.id}/restore`, { method: 'POST' }) as Document;
      liveEngine.current?.clear(); setDocument(restored); setTitle(restored.title); setBlocks(parseBlocks(restored.content)); revision.current += 1; setDirty(false); setSuccess(t('ed.restored')); await reloadCollaboration();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore this version.'); }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments`, { method: 'POST', body: JSON.stringify({ body: commentDraft, ...(commentTarget ?? {}) }) }); setCommentDraft(''); setCommentTarget(null); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post the comment.'); }
  }

  async function deleteComment(comment: Comment) {
    if (!window.confirm(t(comment.parentId ? 'ed.deleteReplyConfirm' : 'ed.deleteCommentConfirm'))) return;
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments/${comment.id}`, { method: 'DELETE' }); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the comment.'); }
  }
  const canDeleteComment = (comment: Comment) => comment.createdBy.id === user.id || workspace.role === 'ADMINISTRATOR';
  const [focusedComment, setFocusedComment] = useState<string | null>(null);
  useEffect(() => { if (focusedComment) window.requestAnimationFrame(() => window.document.getElementById(`comment-${focusedComment}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }, [focusedComment, panelOpen]);
  const commentMarks = useMemo(() => comments.filter((comment) => !comment.parentId && !comment.resolvedAt && comment.blockId && comment.quote).map((comment) => ({ id: comment.id, blockId: comment.blockId!, quote: comment.quote! })), [comments]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!replyTo) return;
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments`, { method: 'POST', body: JSON.stringify({ body: replyTo.text, parentId: replyTo.id }) }); setReplyTo(null); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post the reply.'); }
  }

  /** Opens the list of other documents this person can edit, to move one block into. */
  async function startMove(block: Block) {
    setMoving({ block, docs: null });
    try {
      const all = await request(`/workspaces/${workspace.id}/documents`) as { id: string; title: string }[];
      setMoving({ block, docs: all.filter((item) => item.id !== documentId).slice(0, 50) });
    } catch (reason) { setMoving(null); setError(reason instanceof Error ? reason.message : t('ed.moveFailed')); }
  }

  /** Adds the block to the end of the chosen document first, and only removes it from this one once that was saved. */
  async function moveTo(target: DocSummary) {
    const block = moving?.block; if (!block) return;
    try {
      const fresh = await request(`/workspaces/${workspace.id}/documents/${target.id}`) as Document;
      const list = parseBlocks(fresh.content).filter((item) => item.text !== '' || item.type !== 'PARAGRAPH' || item.rows || item.fileId);
      const copy = { ...block, id: crypto.randomUUID() };
      await request(`/workspaces/${workspace.id}/documents/${target.id}`, { method: 'PATCH', body: JSON.stringify({ title: fresh.title, content: encodeBlocks([...list, copy]), baseUpdatedAt: fresh.updatedAt }) });
      const rest = live.current.blocks.filter((item) => item.id !== block.id);
      const next = rest.length ? rest : [createBlock()];
      liveEngine.current?.clear(); live.current.blocks = next; setBlocks(next); markChanged();
      setSuccess(t('ed.moved', { name: target.title })); setMoving(null);
    } catch (reason) { setMoving(null); setError(reason instanceof Error ? reason.message : t('ed.moveFailed')); }
  }

  async function toggleComment(comment: Comment) {
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ resolved: !comment.resolvedAt }) }); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this comment.'); }
  }

  /**
   * Downloads the saved document as PDF or Word. Everything typed so far is saved first (and live text sent), so the file is never older than the screen;
   * the file itself is made on the server from the saved document, with this person's own permissions.
   */
  async function exportAs(format: 'pdf' | 'docx') {
    setExporting(format); setError(''); setSuccess('');
    try {
      for (let wait = 0; wait < 40 && (live.current.saving || liveEngine.current?.unsettled); wait += 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (live.current.dirty && !(await saveDocument()) && live.current.dirty) throw new Error(t('ed.exportUnsaved'));
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents/${documentId}/export?format=${format}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? t('ed.exportFailed')); }
      const disposition = response.headers.get('content-disposition') ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const name = encoded ? decodeURIComponent(encoded) : `AVEN - ${title || 'Untitled'}.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a'); link.href = url; link.download = name; window.document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setSuccess(t('ed.exported', { name }));
    } catch (reason) { setError(reason instanceof OfflineError || reason instanceof TypeError ? t('ed.exportOffline') : reason instanceof Error ? reason.message : t('ed.exportFailed')); }
    finally { setExporting(null); }
  }

  async function createTaskFromBlock(block: Block) {
    if (!block.text.trim()) return;
    const rawLabels = window.prompt(t('ed.labelsPrompt'));
    if (rawLabels === null) return;
    const labels = rawLabels.split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean);
    setCreatingTask(block.id); setError(''); setSuccess('');
    try {
      await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: block.text.trim(), projectId: document?.project?.id, labels }) });
      setSuccess(document?.project ? t('ed.taskAddedProject', { name: document.project.name }) : t('ed.taskAdded'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a task from this block.'); }
    finally { setCreatingTask(''); }
  }

  return <div className="workspace-section-page document-studio">
    <DocumentHeader title={title} onTitle={(next) => editorApi.current?.setTitle(next)} readOnly={readOnlyRole(workspace.role) || viewing} where={document?.project?.name ?? workspace.name} documentId={document?.id} status={saving ? 'saving' : saveFailed && dirty ? 'failed' : offline && dirty ? 'offline' : dirty ? 'unsaved' : 'saved'} message={success}
      onRetry={() => { setError(''); void saveDocument(); }} local={local} aiReady={aiReady && !readOnlyRole(workspace.role)} onAi={() => editorApi.current?.askAi()} onShare={() => { setPanelOpen(true); setActivePanel('SHARE'); window.requestAnimationFrame(() => window.document.querySelector('.document-studio__sidebar')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}
      exporting={exporting} onExport={(format) => void exportAs(format)} onPrint={() => window.print()} onSaveNow={() => void saveDocument()} dirty={dirty} panelOpen={panelOpen} onPanel={updatePanelOpen} onHistory={() => { setPanelOpen(true); setActivePanel('HISTORY'); }} onComments={() => { setPanelOpen(true); setActivePanel('COMMENTS'); }} />
    {viewers.some((viewer) => viewer.id === user.id && (viewer.connections ?? 1) > 1) && <p className="document-presence" role="status">{t('ed.otherTab')}</p>}
    {viewers.filter((viewer) => viewer.id !== user.id).length > 0 && <p className="document-presence" role="status">{t('ed.alsoHere', { names: viewers.filter((viewer) => viewer.id !== user.id).map((viewer) => viewer.name).join(', ') })}</p>}
    {conflict && <div className="productivity-error document-conflict" role="alertdialog" aria-labelledby="document-conflict-title">
      <strong id="document-conflict-title">{t('ed.conflictTitle')}</strong>
      <p>{t('ed.conflictBody')}</p>
      <div><button type="button" disabled={saving} onClick={() => void keepMyChanges()}>{t('ed.keepMine')}</button><button type="button" disabled={saving} onClick={useTheirVersion}>{t('ed.loadTheirs')}</button></div>
    </div>}
    {local && <p className="productivity-error" role="status">{t('ed.localNote')}</p>}
    {offline && dirty && !local && <p className="productivity-error" role="status">{t('ed.offlineKept')}</p>}
    {error && <p className="productivity-error" role="alert">{error}<button type="button" onClick={() => { setError(''); void saveDocument(); }}>{t('ed.retry')}</button></p>}
    {loading ? <p className="productivity-message">{t('ed.opening')}</p> : !document ? <div className="workspace-section-empty"><h2>{t('ed.unavailable')}</h2><p>{t('ed.unavailableBody')}</p><Link href="/workspace/documents">{t('ed.back')}</Link></div> : <>
      <EditorToolbar api={editorApi} format={format} onPrint={() => window.print()} onBrowseBlocks={() => setBrowserOpen(true)} viewing={viewing} onViewing={setViewing} canEdit={!readOnlyRole(workspace.role)} collapsed={toolbarCollapsed} onCollapse={updateCollapsed} linkRequest={linkRequest} onError={setError} onNotice={setSuccess} />
      {browserOpen && !readOnlyRole(workspace.role) && <BlockBrowser onClose={() => setBrowserOpen(false)} onPick={(entry) => { addEntry(entry); setBrowserOpen(false); setSuccess(t('ed.addBlockFromBrowser', { name: t(`blk.${entry.id}` as Key) })); }} />}
      {moving && <div className="document-browser" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoving(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setMoving(null); }}>
        <div className="document-browser__panel document-move" role="dialog" aria-modal="true" aria-label={t('ed.moveTitle')}>
          <header><h2>{t('ed.moveTitle')}</h2><button type="button" className="rd-iconbtn" aria-label={t('ed.close')} onClick={() => setMoving(null)}>×</button></header>
          <div className="document-browser__scroll">{moving.docs === null ? <p className="document-slash__empty">{t('ed.opening')}</p> : moving.docs.length === 0 ? <p className="document-slash__empty">{t('ed.noOtherDocs')}</p> : <ul>{moving.docs.map((item) => <li key={item.id}><button type="button" onClick={() => void moveTo(item)}>{item.title || t('ed.document')}</button></li>)}</ul>}</div>
        </div>
      </div>}
      <div className={`document-studio__layout${panelOpen ? '' : ' document-studio__layout--solo'}`}>
        {!panelOpen && <button type="button" className="document-studio__reopen" title={t('ed.tb.showPanel')} aria-label={t('ed.tb.showPanel')} onClick={() => updatePanelOpen(true)}><EditorIcon name="panel" size={18} /><span>{t('ed.tb.sidePanel')}</span></button>}
        <main className="document-studio__paper">
          <p className="workspace-eyebrow">{t('ed.eyebrow', { where: document.project?.name ?? t('ed.personal') })}<span className="document-studio__meta"> · {t('ed.meta', { words: words.toLocaleString(), minutes: Math.max(1, Math.round(words / 220)) })}</span></p>
          <DocEditor title={title} blocks={blocks} readOnly={readOnlyRole(workspace.role) || viewing} onFormatState={setFormat} floatingBar={toolbarCollapsed} onLinkRequest={() => { setToolbarCollapsed(false); setLinkRequest((n) => n + 1); }} env={editorEnv} cursors={editorCursors} others={editorOthers} onLocalChange={handleEditorChange} onSelection={handleSelection} onCreateTask={(block) => void createTaskFromBlock(block)} onComment={(block, quote) => { setCommentTarget({ blockId: block.id, quote: quote.slice(0, 300) }); setPanelOpen(true); setActivePanel('COMMENTS'); window.requestAnimationFrame(() => window.document.getElementById('aven-comment-field')?.focus()); }} commentMarks={commentMarks} onCommentClick={(id) => { setPanelOpen(true); setActivePanel('COMMENTS'); setFocusedComment(id); }} onMoveOut={(block) => void startMove(block)} onNotice={setSuccess} onAssist={aiReady ? assist : null} onError={setError} apiRef={editorApi} />
        </main>
        {panelOpen && <aside className="document-studio__sidebar"><div className="document-studio__panelbar"><span>{t('ed.tb.sidePanel')}</span><button type="button" className="rd-iconbtn" title={t('ed.tb.hidePanel')} aria-label={t('ed.tb.hidePanel')} onClick={() => updatePanelOpen(false)}><EditorIcon name="back" size={18} /></button></div><nav className="document-studio__tabs" aria-label={t('ed.toolsAria')}>{(local ? ['OUTLINE'] as const : ['OUTLINE', 'RELATED', 'COMMENTS', 'HISTORY', 'FILES', 'SHARE'] as const).map((tab) => <button type="button" key={tab} className={activePanel === tab ? 'is-active' : ''} onClick={() => setActivePanel(tab)}>{tab === 'OUTLINE' ? t('ed.tab.outline') : tab === 'RELATED' ? t('ed.tab.related') : tab === 'COMMENTS' ? `${t('ed.tab.comments')} ${comments.filter((item) => !item.resolvedAt).length || ''}` : tab === 'FILES' ? t('ed.tab.files') : tab === 'SHARE' ? t('ed.tab.share') : t('ed.tab.history')}</button>)}</nav>
          {activePanel === 'SHARE' && <SharePanel documentId={document.id} />}
          {activePanel === 'FILES' && <section className="document-studio__panel"><AttachmentsPanel target={{ documentId: document.id }} /></section>}
          {activePanel === 'RELATED' && <section className="document-studio__panel"><h2>{t('ed.tab.related')}</h2>{others === null ? <p>{t('ed.opening')}</p> : others.length === 0 ? <p>{t('ed.relatedEmpty')}</p> : <>
            {document.project && others.some((row) => row.project?.id === document.project?.id) && <><h3>{t('ed.sameProject', { name: document.project.name })}</h3><ul className="document-studio__related">{others.filter((row) => row.project?.id === document.project?.id).slice(0, 8).map((row) => <li key={row.id}><Link href={`/workspace/documents/${row.id}`}>{row.title || t('ed.document')}</Link></li>)}</ul></>}
            <h3>{t('ed.recentlyEdited')}</h3><ul className="document-studio__related">{[...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map((row) => <li key={row.id}><Link href={`/workspace/documents/${row.id}`}>{row.title || t('ed.document')}</Link><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(row.updatedAt))}</time></li>)}</ul></>}</section>}
          {activePanel === 'OUTLINE' && <section className="document-studio__panel"><h2><button type="button" className="document-studio__collapse" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}><span aria-hidden>{outlineOpen ? '▾' : '▸'}</span> {t('ed.onThisPage')}</button></h2>{!outlineOpen ? null : outline.length === 0 ? <p>{t('ed.outlineEmpty')}</p> : <nav aria-label={t('ed.onThisPage')}>{outline.map((block) => <a className={`${headingLevel(block) > 1 ? 'is-nested' : ''}${(outline.some((item) => item.id === activeHeading) ? activeHeading : outline[0]?.id) === block.id ? ' is-current' : ''}`} aria-current={(outline.some((item) => item.id === activeHeading) ? activeHeading : outline[0]?.id) === block.id ? 'location' : undefined} key={block.id} href={`#block-${block.id}`} onClick={(event) => { event.preventDefault(); document_scrollTo(block.id); window.history.replaceState(null, '', `#block-${block.id}`); }}>{block.text}</a>)}</nav>}</section>}
          {activePanel === 'COMMENTS' && <section className="document-studio__panel"><h2>{t('ed.tab.comments')}</h2>
            {!readOnlyRole(workspace.role) && <form className="document-studio__comment-form" onSubmit={addComment}>
              {commentTarget && <p className="document-studio__comment-target">{t('ed.commentingOn', { quote: commentTarget.quote || '…' })} <button type="button" onClick={() => setCommentTarget(null)} aria-label={t('ed.clearTarget')} title={t('ed.clearTarget')}>×</button></p>}
              <textarea id="aven-comment-field" value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={2000} required placeholder={t('ed.commentPh')} aria-label={t('ed.commentPh')} /><button type="submit">{t('ed.post')}</button>
            </form>}
            <div className="document-studio__comments">{comments.length === 0 ? <p>{t('ed.commentsEmpty')}</p> : comments.filter((comment) => !comment.parentId).map((comment) => <article className={`${comment.resolvedAt ? 'is-resolved' : ''}${focusedComment === comment.id ? ' is-focused' : ''}`} id={`comment-${comment.id}`} key={comment.id}>
              <div><strong>{comment.createdBy.displayName}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(comment.createdAt))}</time></div>
              {comment.quote && <blockquote className="document-studio__quote">{comment.quote}</blockquote>}
              <p>{comment.body}</p>
              {comments.filter((reply) => reply.parentId === comment.id).slice().reverse().map((reply) => <div className="document-studio__reply" key={reply.id}><div><strong>{reply.createdBy.displayName}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(reply.createdAt))}</time></div><p>{reply.body}</p>{canDeleteComment(reply) && <button type="button" className="document-studio__reply-delete" onClick={() => void deleteComment(reply)}>{t('ed.deleteComment')}</button>}</div>)}
              {replyTo?.id === comment.id ? <form className="document-studio__reply-form" onSubmit={sendReply}><textarea autoFocus value={replyTo.text} onChange={(event) => setReplyTo({ id: comment.id, text: event.target.value })} maxLength={2000} required placeholder={t('ed.replyPh')} aria-label={t('ed.replyPh')} /><button type="submit">{t('ed.post')}</button></form> : null}
              <div className="document-studio__comment-actions">
                {comment.blockId && blocks.some((block) => block.id === comment.blockId) && <button type="button" onClick={() => document_scrollTo(comment.blockId!)}>{t('ed.goToBlock')}</button>}
                {replyTo?.id !== comment.id && !readOnlyRole(workspace.role) && <button type="button" onClick={() => setReplyTo({ id: comment.id, text: '' })}>{t('ed.reply')}</button>}
                {!readOnlyRole(workspace.role) && <button type="button" onClick={() => void toggleComment(comment)}>{comment.resolvedAt ? t('ed.reopen') : t('ed.resolve')}</button>}
                {canDeleteComment(comment) && <button type="button" className="is-danger" onClick={() => void deleteComment(comment)}>{t('ed.deleteComment')}</button>}
              </div>
            </article>)}</div></section>}
          {activePanel === 'HISTORY' && <section className="document-studio__panel"><h2>{t('ed.versionHistory')}</h2><form className="document-studio__version-form" onSubmit={saveVersion}><input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} placeholder={t('ed.versionNotePh')} /><button type="submit">{t('ed.saveVersion')}</button></form><div className="document-studio__versions">{versions.length === 0 ? <p>{t('ed.versionsEmpty')}</p> : versions.map((version) => <article key={version.id}><strong>{version.label || version.title}</strong><small>{version.createdBy.displayName} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</small><button type="button" onClick={() => void restoreVersion(version)}>{t('ed.restore')}</button></article>)}</div></section>}
        </aside>}
      </div>
    </>}
  </div>;
}
