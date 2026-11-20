'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { useWorkspaceSession } from '../../workspace-shell';
import { AttachmentsPanel } from '../../files/attachments-panel';
import { ImageBlock, TableBlock } from './document-blocks';
import { SharePanel } from './share-panel';
import { BlockBrowser, FormatBar, RichText, SlashMenu, slashCount } from './editor-ui';
import { BookmarkBlock, BreadcrumbBlock, ButtonBlock, DatabaseBlock, DatabaseLinkBlock, EquationPreview, MediaBlock, MeetingBlock, MermaidPreview, PageLinkBlock, TabsBlock, TocBlock } from './block-views';
import { blockCatalog, iconForBlock, type CatalogEntry } from './block-catalog';
import { BlockIcon } from '../../block-icons';
import { applySlash, blankBlock, blockTypeList, convertBlock, duplicateBlock as duplicateIn, headingLevel, isLiveText, filterSlash, findSlash, hasInlineMarks, isTextBlock, makeLink, markdownShortcut, moveBlockBy, pressBackspaceAtStart, pressDeleteAtEnd, pressEnter, reorderBlock, toggleMark, type EditResult, type Mark } from './editor-model';
import { FavouriteStar } from '../../favourites';
import { readEvents } from '../../messages/sse';
import { transformPosition } from '@aven/collab';
import { mergeBlocks, moveCaret, reconcileDraft } from './block-merge';
import { LiveTextEngine, type CursorEvent, type RemoteCursor, type TextEvent } from './live-text';
import { caretPosition } from './caret-position';
import { draftKey, readDraft, removeDraft, writeDraft } from './offline-draft';

import type { Block, BlockType } from './editor-model';
type Document = { id: string; title: string; content: string; updatedAt: string; project: { id: string; name: string } | null };
type Version = { id: string; title: string; label: string | null; createdAt: string; createdBy: { displayName: string } };
type Comment = { id: string; body: string; createdAt: string; resolvedAt: string | null; createdBy: { id: string; displayName: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
class ConflictError extends Error { constructor(message: string, readonly current: Document) { super(message); } }
/** The request never reached the server: no connection, or the sign-in token could not be refreshed. */
class OfflineError extends Error {}
/** The server answered with an error; `status` is its HTTP status. */
class HttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
/** Blocks a person can switch an existing block to (the "create new …" variants are only for inserting). */
const selectEntries = blockCatalog.filter((entry) => entry.id !== 'database-inline' && entry.id !== 'database-linked');

function createBlock(type: BlockType = 'PARAGRAPH'): Block { return { id: crypto.randomUUID(), type, text: '', checked: false }; }
const readOnlyRole = (role: string | null) => role === 'GUEST';
function parseBlocks(content: string): Block[] {
  try {
    const value = JSON.parse(content) as { format?: string; blocks?: Block[] };
    if (value.format === 'aven-doc-v1' && Array.isArray(value.blocks) && value.blocks.every((block) => typeof block.id === 'string' && blockTypeList.includes(block.type) && typeof block.text === 'string')) return value.blocks.length ? value.blocks : [createBlock()];
  } catch { /* Existing plain-text documents are opened as a first paragraph. */ }
  return [content ? { ...createBlock(), text: content } : createBlock()];
}
const presenceColours = ['#A48766', '#6B5746', '#6F8A62', '#5F7399', '#9A5C68'];
/** Each person gets the same colour for as long as they are in the document, whoever else is there. */
function presenceColour(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return presenceColours[hash % presenceColours.length]; }
function blockColour(others: { id: string; blockId: string | null }[], blockId: string): React.CSSProperties | undefined {
  const viewer = others.find((candidate) => candidate.blockId === blockId);
  return viewer ? ({ '--presence': presenceColour(viewer.id) } as React.CSSProperties) : undefined;
}

/** Draws other people's carets over a block's text box. It works on the page directly because the positions come from measuring the rendered text. */
function CaretLayer({ blockId, cursors, text }: { blockId: string; cursors: RemoteCursor[]; text: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const resized = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  useLayoutEffect(() => {
    const host = layer.current;
    if (!host) return;
    host.replaceChildren();
    const field = globalThis.document.getElementById(`block-${blockId}`);
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) return;
    for (const cursor of cursors) {
      const spot = caretPosition(field, Math.min(cursor.end, field.value.length));
      const colour = presenceColour(cursor.userId);
      const caret = globalThis.document.createElement('span');
      caret.className = 'document-block__caret';
      Object.assign(caret.style, { left: `${field.offsetLeft + spot.left}px`, top: `${field.offsetTop + spot.top}px`, height: `${spot.height}px`, background: colour });
      const label = globalThis.document.createElement('span');
      label.className = 'document-block__caret-name'; label.textContent = cursor.name; label.style.background = colour;
      caret.appendChild(label); host.appendChild(caret);
    }
  }, [blockId, cursors, text, width]);
  return <div ref={layer} className="document-block__carets" aria-hidden="true" />;
}
function encodeBlocks(blocks: Block[]) { return JSON.stringify({ format: 'aven-doc-v1', blocks }); }

export default function DocumentEditorPage() {
  const t = useT();
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
  const [entryId, setEntryId] = useState<string>('document-text');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [closedToggles, setClosedToggles] = useState<string[]>([]);
  const [creatingTask, setCreatingTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState<Document | null>(null);
  const [offline, setOffline] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slash, setSlash] = useState<{ blockId: string; start: number; query: string; index: number } | null>(null);
  const [selected, setSelected] = useState<{ blockId: string; start: number; end: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const liveEngine = useRef<LiveTextEngine | null>(null);
  const [activePanel, setActivePanel] = useState<'OUTLINE' | 'COMMENTS' | 'HISTORY' | 'FILES' | 'SHARE'>('OUTLINE');
  const [viewers, setViewers] = useState<{ id: string; name: string; blockId: string | null }[]>([]);
  const revision = useRef(0);
  const caret = useRef<{ id: string; start: number; end: number } | null>(null);
  const announced = useRef<{ sent: string | null; timer?: number }>({ sent: null });
  const live = useRef<{ document: Document | null; blocks: Block[]; title: string; dirty: boolean; saving: boolean }>({ document: null, blocks: [], title: '', dirty: false, saving: false });
  useEffect(() => { live.current = { document, blocks, title, dirty, saving }; });

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    let token: string | null = null;
    try { token = await getToken(); } catch { throw new OfflineError('offline'); }
    if (!token && typeof navigator !== 'undefined' && !navigator.onLine) throw new OfflineError('offline');
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
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
    state.timer = window.setTimeout(() => {
      if (state.sent === blockId) return;
      state.sent = blockId;
      void request(`/workspaces/${workspace.id}/documents/${documentId}/focus`, { method: 'POST', body: JSON.stringify({ blockId }) }).catch(() => { state.sent = null; });
    }, 250);
  }, [documentId, request, workspace.id]);
  useEffect(() => { const state = announced.current; return () => window.clearTimeout(state.timer); }, []);

  // Share where my caret is (after a short pause, so typing doesn't flood the connection) and clear it when I leave a block.
  useEffect(() => {
    let timer: number | undefined;
    const field = () => { const active = globalThis.document.activeElement; return (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && active.id.startsWith('block-') ? active : null; };
    const report = () => { const active = field(); if (active && active.selectionStart !== null && active.selectionEnd !== null) liveEngine.current?.reportCursor(active.id.slice('block-'.length), active.selectionStart, active.selectionEnd); };
    const moved = () => { window.clearTimeout(timer); timer = window.setTimeout(report, 250); };
    const left = (event: FocusEvent) => { const target = event.target; if ((target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) && target.id.startsWith('block-')) { window.clearTimeout(timer); liveEngine.current?.reportCursor(target.id.slice('block-'.length), null, null); } };
    globalThis.document.addEventListener('selectionchange', moved);
    globalThis.document.addEventListener('focusout', left);
    return () => { window.clearTimeout(timer); globalThis.document.removeEventListener('selectionchange', moved); globalThis.document.removeEventListener('focusout', left); };
  }, []);

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
  /** When someone else's words arrive while a block is being typed in, remember where the cursor should land afterwards. */
  const holdCaret = useCallback((before: Block[], after: Block[]) => {
    const field = globalThis.document.activeElement;
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) || !field.id.startsWith('block-') || field.selectionStart === null || field.selectionEnd === null) return;
    const id = field.id.slice('block-'.length);
    const [was, now] = [before.find((block) => block.id === id)?.text, after.find((block) => block.id === id)?.text];
    if (was === undefined || now === undefined) return;
    caret.current = { id, start: moveCaret(was, now, field.selectionStart), end: moveCaret(was, now, field.selectionEnd) };
  }, []);

  useLayoutEffect(() => {
    const target = caret.current;
    if (!target) return;
    caret.current = null;
    const field = globalThis.document.getElementById(`block-${target.id}`);
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) field.setSelectionRange(target.start, target.end);
  }, [blocks]);

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
      writeText: (blockId, text, operation) => {
        const field = globalThis.document.activeElement;
        if (operation && (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) && field.id === `block-${blockId}` && field.selectionStart !== null && field.selectionEnd !== null) {
          caret.current = { id: blockId, start: transformPosition(operation, field.selectionStart), end: transformPosition(operation, field.selectionEnd) };
        }
        setBlocks((current) => current.map((block) => (block.id === blockId ? { ...block, text } : block)));
      },
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
      holdCaret(mine.blocks, next);
      setDocument(latest); setTitle(latest.title); setBlocks(next); revision.current += 1; setSuccess(t('ed.updatedBy', { who }));
      return 'applied';
    }
    const engine = liveEngine.current;
    const { blocks: combined, conflicts } = mergeBlocks(parseBlocks(mine.document.content), mine.blocks, parseBlocks(latest.content));
    if (conflicts.some((id) => !engine?.has(id))) return 'conflict'; // blocks edited live are reconciled word by word elsewhere
    const merged = combined.map((block) => (engine?.has(block.id) ? { ...block, text: engine.screen(block.id) ?? block.text } : block));
    engine?.prune(new Set(merged.map((block) => block.id)));
    holdCaret(mine.blocks, merged);
    setDocument(latest); setBlocks(merged); if (mine.title === mine.document.title) setTitle(latest.title);
    revision.current += 1; setSuccess(t('ed.merged', { who }));
    return 'merged';
  }, [holdCaret, t]);

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
          if (attempt > 0) liveEngine.current?.resyncAll(); // events may have been missed while the connection was down
          for await (const event of readEvents<{ type: 'presence'; viewers: { id: string; name: string; blockId: string | null }[] } | { type: 'saved'; updatedAt: string; by: { id: string; name: string } } | ({ type: 'text' } & TextEvent) | ({ type: 'cursor' } & CursorEvent)>(response.body)) {
            if (event.type === 'presence') { setViewers(event.viewers); liveEngine.current?.keepCursorsOf(new Set(event.viewers.map((viewer) => viewer.id))); }
            else if (event.type === 'text') liveEngine.current?.handle(event);
            else if (event.type === 'cursor') liveEngine.current?.handleCursor(event);
            else void sync(event.by.id === user.id ? t('ed.anotherTab') : event.by.name).catch(() => undefined);
          }
        } catch { if (abort.signal.aborted) return; }
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    })();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [applyRemote, documentId, getToken, hydrated, request, t, user.id, workspace.id]);

  useEffect(() => {
    let cancelled = false;
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
  }, [documentId, request, t, user.id, workspace.id, workspace.role]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    if (!document || saving) return false;
    if (!dirty) return true;
    const currentRevision = revision.current;
    const payload = { title, content: encodeBlocks(blocks), silent: true, baseUpdatedAt: document.updatedAt };
    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await request(`/workspaces/${workspace.id}/documents/${document.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Document;
      setDocument(updated); setOffline(false);
      if (revision.current === currentRevision) {
        setDirty(false);
        return true;
      }
      return false;
    } catch (reason) {
      setOffline(reason instanceof OfflineError); // any answer from the server means the connection is back
      if (reason instanceof OfflineError) { /* kept on this device; retried when the connection returns */ }
      else if (reason instanceof ConflictError) { if (applyRemote(reason.current, t('ed.someone')) === 'conflict') setConflict(reason.current); }
      else setError(reason instanceof Error ? reason.message : 'Autosave failed.');
      return false;
    }
    finally { setSaving(false); }
  }, [applyRemote, blocks, dirty, document, request, saving, t, title, workspace.id]);

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
  function changeTitle(value: string) { setTitle(value); markChanged(); }
  function changeBlock(id: string, update: Partial<Block>) {
    const syncId = blocks.find((block) => block.id === id)?.syncId;
    if (syncId && typeof update.text === 'string') { const text = update.text; setBlocks((current) => current.map((block) => (block.syncId === syncId ? { ...block, text } : block))); markChanged(); return; }
    // Typing in a block that is live goes to the server one edit at a time instead of through the whole-document save.
    if (Object.keys(update).length === 1 && typeof update.text === 'string' && liveEngine.current?.edit(id, update.text)) { const text = update.text; setBlocks((current) => current.map((block) => (block.id === id ? { ...block, text } : block))); return; }
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...update } : block)); markChanged(); }
  function insertBlock(afterId?: string) {
    const entry = blockCatalog.find((item) => item.id === entryId) ?? blockCatalog[0];
    const block = blankBlock(crypto.randomUUID(), entry.type, entry.patch);
    setBlocks((current) => { if (!afterId) return [...current, block]; const index = current.findIndex((item) => item.id === afterId); return [...current.slice(0, index + 1), block, ...current.slice(index + 1)]; });
    markChanged();
    window.setTimeout(() => globalThis.document.getElementById(`block-${block.id}`)?.focus(), 0);
  }
  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => { const index = current.findIndex((item) => item.id === id); const target = index + direction; if (target < 0 || target >= current.length) return current; const next = current.slice(); [next[index], next[target]] = [next[target], next[index]]; return next; }); markChanged();
  }
  function removeBlock(id: string) { setBlocks((current) => current.length === 1 ? [createBlock()] : current.filter((block) => block.id !== id)); markChanged(); }

  // ---- Writing: slash menu, Markdown shortcuts, Enter/Backspace, inline formatting, drag and drop ----------------------
  const typeLabel = useCallback((item: CatalogEntry) => t(`blk.${item.id}` as Key), [t]);
  const fieldOf = (id: string) => globalThis.document.getElementById(`block-${id}`) as HTMLTextAreaElement | null;
  // Focus is applied after React has drawn the blocks, so a block that was just created can already receive it.
  const pendingFocus = useRef<{ id: string; caret: number; end?: number } | null>(null);
  function focusAt(id: string, caret: number) {
    const field = fieldOf(id);
    if (field) { field.focus(); field.setSelectionRange(caret, caret); pendingFocus.current = null; } else pendingFocus.current = { id, caret };
  }
  useLayoutEffect(() => {
    const wanted = pendingFocus.current; if (!wanted) return;
    const field = globalThis.document.getElementById(`block-${wanted.id}`) as HTMLTextAreaElement | null;
    if (field) { field.focus(); field.setSelectionRange(wanted.caret, wanted.end ?? wanted.caret); pendingFocus.current = null; }
  }, [blocks]);
  /** A structural edit (split, merge, convert, move). Live text sessions are dropped first so they rejoin from the new state. */
  function commit(result: EditResult) {
    liveEngine.current?.clear();
    pendingFocus.current = { id: result.focus.id, caret: result.focus.caret };
    setBlocks(result.blocks); markChanged(); setSlash(null); setSelected(null);
  }
  const makeId = () => crypto.randomUUID();

  function onText(block: Block, index: number, value: string, caret: number) {
    const shortcut = markdownShortcut(block, value);
    if (shortcut) { commit({ blocks: blocks.map((item) => (item.id === block.id ? { ...item, ...shortcut } : item)), focus: { id: block.id, caret: 0 } }); return; }
    changeBlock(block.id, { text: value });
    const found = isTextBlock(block.type) && block.type !== 'CODE' && block.type !== 'EQUATION' && block.type !== 'MERMAID' ? findSlash(value, caret) : null;
    setSlash(found ? { blockId: block.id, start: found.start, query: found.query, index: 0 } : null);
    void index;
  }
  function chooseSlash(entry: CatalogEntry) {
    if (!slash) return;
    const field = fieldOf(slash.blockId);
    const result = applySlash(blocks, slash.blockId, { start: slash.start, query: slash.query }, field?.selectionStart ?? slash.start + 1 + slash.query.length, entry, makeId);
    if (result) commit(result);
  }
  function applyMark(block: Block, mark: Mark) {
    const field = fieldOf(block.id); if (!field) return;
    const next = toggleMark(field.value, field.selectionStart, field.selectionEnd, mark);
    pendingFocus.current = { id: block.id, caret: next.start, end: next.end };
    changeBlock(block.id, { text: next.text });
  }
  function applyLink(block: Block) {
    const field = fieldOf(block.id); if (!field) return;
    const start = field.selectionStart, end = field.selectionEnd;
    const url = window.prompt(t('ed.linkPrompt'));
    if (!url) return;
    const next = makeLink(field.value, start, end, url);
    if (!next) { setError(t('ed.linkInvalid')); return; }
    pendingFocus.current = { id: block.id, caret: next.start, end: next.end };
    changeBlock(block.id, { text: next.text });
  }
  function onKey(block: Block, index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnlyRole(workspace.role) || event.nativeEvent.isComposing) return;
    const field = event.currentTarget;
    const start = field.selectionStart, end = field.selectionEnd, collapsed = start === end;
    const mod = event.metaKey || event.ctrlKey;
    if (slash && slash.blockId === block.id) {
      const count = slashCount(slash.query, typeLabel);
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlash({ ...slash, index: count ? (slash.index + 1) % count : 0 }); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlash({ ...slash, index: count ? (slash.index + count - 1) % count : 0 }); return; }
      if (event.key === 'Escape') { event.preventDefault(); setSlash(null); return; }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const choice = filterSlash(slash.query, typeLabel)[slash.index]; if (choice) chooseSlash(choice); else setSlash(null);
        return;
      }
    }
    if (mod && !event.shiftKey && ['b', 'i', 'e'].includes(event.key.toLowerCase())) { event.preventDefault(); applyMark(block, event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'code'); return; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); applyMark(block, 'strike'); return; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); applyLink(block); return; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); const result = duplicateIn(blocks, block.id, makeId); if (result) commit(result); return; }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); const next = moveBlockBy(blocks, block.id, event.key === 'ArrowUp' ? -1 : 1); if (next !== blocks) commit({ blocks: next, focus: { id: block.id, caret: start } }); return; }
    if (event.key === 'Enter') {
      const result = pressEnter(blocks, block.id, start, end, makeId, { mod, shift: event.shiftKey });
      if (result) { event.preventDefault(); commit(result); }
      return;
    }
    if (event.key === 'Backspace' && collapsed && start === 0) { const result = pressBackspaceAtStart(blocks, block.id); if (result) { event.preventDefault(); commit(result); } return; }
    if (event.key === 'Delete' && collapsed && start === field.value.length) { const result = pressDeleteAtEnd(blocks, block.id); if (result) { event.preventDefault(); commit(result); } return; }
    if (event.key === 'ArrowUp' && collapsed && !mod && !event.shiftKey && !field.value.slice(0, start).includes('\n')) {
      const previous = blocks.slice(0, index).reverse().find((item) => isTextBlock(item.type));
      if (previous) { event.preventDefault(); focusAt(previous.id, previous.text.length); }
      return;
    }
    if (event.key === 'ArrowDown' && collapsed && !mod && !event.shiftKey && !field.value.slice(start).includes('\n')) {
      const following = blocks.slice(index + 1).find((item) => isTextBlock(item.type));
      if (following) { event.preventDefault(); focusAt(following.id, 0); }
    }
  }
  function onSelect(block: Block, event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const field = event.currentTarget;
    setSelected(field.selectionStart !== field.selectionEnd && !readOnlyRole(workspace.role) ? { blockId: block.id, start: field.selectionStart, end: field.selectionEnd } : null);
  }
  function dropOn(beforeId: string | null) {
    if (dragId) { const next = reorderBlock(blocks, dragId, beforeId); if (next !== blocks) commit({ blocks: next, focus: { id: dragId, caret: 0 } }); }
    setDragId(null); setDropBefore(undefined);
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
  /** The blocks that are not plain text boxes (media, links, databases, charts, contents, buttons). */
  async function createTasks(blockId: string, titles: string[]) {
    setCreatingTask(blockId); setError(''); setSuccess('');
    try { for (const title of titles.slice(0, 30)) await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200), projectId: document?.project?.id }) }); setSuccess(t('ed.tasksAdded', { n: Math.min(titles.length, 30) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the tasks.'); }
    finally { setCreatingTask(''); }
  }
  const special = (block: Block): React.ReactNode | null => {
    const readOnly = readOnlyRole(workspace.role);
    switch (block.type) {
      case 'VIDEO': case 'AUDIO': case 'FILE': return <MediaBlock kind={block.type} fileId={block.fileId} caption={block.text} readOnly={readOnly} onPick={(file) => changeBlock(block.id, { fileId: file.id, ...(block.type === 'FILE' ? { text: file.name } : {}) })} onCaption={(text) => changeBlock(block.id, { text })} />;
      case 'BOOKMARK': return <BookmarkBlock url={block.url ?? ''} title={block.text} readOnly={readOnly} onChange={(change) => changeBlock(block.id, change)} />;
      case 'PAGE_LINK': return <PageLinkBlock docId={block.docId} create={Boolean(block.create)} currentId={documentId} projectId={document?.project?.id} readOnly={readOnly} onPick={(docId) => changeBlock(block.id, { docId, create: false })} />;
      case 'DATABASE': return <DatabaseBlock databaseId={block.databaseId} view={block.view ?? 'TABLE'} linked={Boolean(block.linked)} create={Boolean(block.create)} readOnly={readOnly} onChange={(change) => changeBlock(block.id, change)} />;
      case 'DATABASE_LINK': return <DatabaseLinkBlock databaseId={block.databaseId} readOnly={readOnly} onPick={(id) => changeBlock(block.id, { databaseId: id, create: false })} />;
      case 'TABS': return <TabsBlock tabs={block.tabs ?? []} readOnly={readOnly} onChange={(tabs) => changeBlock(block.id, { tabs })} />;
      case 'MEETING': return <MeetingBlock block={block} readOnly={readOnly} running={creatingTask === block.id} onChange={(change) => changeBlock(block.id, change)} onTasks={(titles) => void createTasks(block.id, titles)} />;
      case 'TOC': return <TocBlock headings={headingsForToc} />;
      case 'BREADCRUMB': return <BreadcrumbBlock crumbs={crumbs} />;
      case 'BUTTON': return <ButtonBlock label={block.text} taskTitle={block.body ?? ''} readOnly={readOnly} running={creatingTask === block.id} onLabel={(text) => changeBlock(block.id, { text })} onTaskTitle={(body) => changeBlock(block.id, { body })} onRun={() => void runButton(block)} />;
      default: return null;
    }
  };
  const richView = (block: Block) => isTextBlock(block.type) && block.type !== 'CODE' && block.type !== 'EQUATION' && block.type !== 'MERMAID' && editingId !== block.id && hasInlineMarks(block.text);
  const others = useMemo(() => viewers.filter((viewer) => viewer.id !== user.id), [user.id, viewers]);
  const outline = useMemo(() => blocks.filter((block) => headingLevel(block) > 0 && block.text.trim()), [blocks]);

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
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments`, { method: 'POST', body: JSON.stringify({ body: commentDraft }) }); setCommentDraft(''); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post the comment.'); }
  }

  async function toggleComment(comment: Comment) {
    try { await request(`/workspaces/${workspace.id}/documents/${documentId}/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ resolved: !comment.resolvedAt }) }); await reloadCollaboration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this comment.'); }
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
    <div className="document-studio__crumb"><Link href="/workspace/documents">{t('ed.crumbDocuments')}</Link><span>›</span><span>{document?.project?.name ?? workspace.name}</span><span>›</span><strong>{document?.title ?? t('ed.document')}</strong><span className="document-studio__save-state">{saving ? t('ed.saving') : dirty ? t('ed.unsaved') : success || t('ed.allSaved')}</span></div>
    {viewers.filter((viewer) => viewer.id !== user.id).length > 0 && <p className="document-presence" role="status">{t('ed.alsoHere', { names: viewers.filter((viewer) => viewer.id !== user.id).map((viewer) => viewer.name).join(', ') })}</p>}
    {conflict && <div className="productivity-error document-conflict" role="alertdialog" aria-labelledby="document-conflict-title">
      <strong id="document-conflict-title">{t('ed.conflictTitle')}</strong>
      <p>{t('ed.conflictBody')}</p>
      <div><button type="button" disabled={saving} onClick={() => void keepMyChanges()}>{t('ed.keepMine')}</button><button type="button" disabled={saving} onClick={useTheirVersion}>{t('ed.loadTheirs')}</button></div>
    </div>}
    {offline && dirty && <p className="productivity-error" role="status">{t('ed.offlineKept')}</p>}
    {error && <p className="productivity-error" role="alert">{error}<button type="button" onClick={() => { setError(''); void saveDocument(); }}>{t('ed.retry')}</button></p>}
    {loading ? <p className="productivity-message">{t('ed.opening')}</p> : !document ? <div className="workspace-section-empty"><h2>{t('ed.unavailable')}</h2><p>{t('ed.unavailableBody')}</p><Link href="/workspace/documents">{t('ed.back')}</Link></div> : <>
      <div className="document-studio__toolbar"><label>{t('ed.newBlock')}<select id="document-block-type" value={entryId} onChange={(event) => setEntryId(event.target.value)}>{(['basic', 'media', 'database', 'advanced'] as const).map((category) => <optgroup key={category} label={t(`blk.cat.${category}` as Key)}>{blockCatalog.filter((entry) => entry.category === category).map((entry) => <option key={entry.id} value={entry.id}>{t(`blk.${entry.id}` as Key)}</option>)}</optgroup>)}</select></label><button type="button" onClick={() => insertBlock()}>{t('ed.addBlock')}</button><button type="button" onClick={() => setBrowserOpen(true)}><BlockIcon id="database-gallery" size={16} />{t('blk.browse')}</button><span className="document-studio__toolbar-spacer" /><button type="button" onClick={() => void saveDocument()} disabled={!dirty || saving}>{t('ed.saveNow')}</button><Link href="/workspace/documents">{t('ed.allDocuments')}</Link><FavouriteStar kind="DOCUMENT" entityId={document?.id} /></div>
      {browserOpen && !readOnlyRole(workspace.role) && <BlockBrowser onClose={() => setBrowserOpen(false)} onPick={(entry) => { const created = blankBlock(crypto.randomUUID(), entry.type, entry.patch); setBlocks((current) => [...current, created]); markChanged(); setBrowserOpen(false); setSuccess(t('ed.addBlockFromBrowser', { name: t(`blk.${entry.id}` as Key) })); if (isTextBlock(entry.type)) focusAt(created.id, 0); }} />}
      <div className="document-studio__layout">
        <main className="document-studio__paper">
          <p className="workspace-eyebrow">{t('ed.eyebrow', { where: document.project?.name ?? t('ed.personal') })}</p>
          <input className="document-studio__title" value={title} onChange={(event) => changeTitle(event.target.value)} maxLength={200} aria-label={t('ed.titleLabel')} />
          <div className="document-studio__blocks">{blocks.map((block, index) => <section className={`document-block document-block--${block.type.toLowerCase()}${block.type === 'TOGGLE' ? ` document-block--toggle-l${block.level ?? 0}` : ''}${others.some((viewer) => viewer.blockId === block.id) ? ' document-block--others' : ''}${dragId === block.id ? ' document-block--dragging' : ''}${dropBefore === block.id && dragId && dragId !== block.id ? ' document-block--drop' : ''}`} key={block.id} style={blockColour(others, block.id)} onDragOver={(event) => { if (dragId) { event.preventDefault(); setDropBefore(block.id); } }} onDrop={(event) => { event.preventDefault(); dropOn(block.id); }} onFocus={() => { announceFocus(block.id); if (!readOnlyRole(workspace.role) && isLiveText(block.type)) void liveEngine.current?.join(block.id); }} onBlur={() => announceFocus(null)}>
            {others.filter((viewer) => viewer.blockId === block.id).length > 0 && <span className="document-block__presence" role="status">{t('ed.editingHere', { names: others.filter((viewer) => viewer.blockId === block.id).map((viewer) => viewer.name).join(', ') })}</span>}
            <div className="document-block__controls">{!readOnlyRole(workspace.role) && <button type="button" className="document-block__drag" draggable aria-label={t('ed.dragHandle')} title={t('ed.dragHandle')} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', block.id); setDragId(block.id); }} onDragEnd={() => { setDragId(null); setDropBefore(undefined); }}>⋮⋮</button>}<select aria-label={t('ed.blockTypeFor', { n: index + 1 })} value={iconForBlock(block)} onChange={(event) => { const entry = selectEntries.find((item) => item.id === event.target.value); if (entry) { liveEngine.current?.clear(); setBlocks((current) => current.map((item) => (item.id === block.id ? convertBlock(item, entry) : item))); markChanged(); } }}>{selectEntries.map((entry) => <option value={entry.id} key={entry.id}>{t(`blk.${entry.id}` as Key)}</option>)}</select><button type="button" onClick={() => moveBlock(block.id, -1)} disabled={index === 0} aria-label={t('ed.moveUp')}>↑</button><button type="button" onClick={() => moveBlock(block.id, 1)} disabled={index === blocks.length - 1} aria-label={t('ed.moveDown')}>↓</button>{!readOnlyRole(workspace.role) && <button type="button" onClick={() => { const result = duplicateIn(blocks, block.id, makeId); if (result) commit(result); }} aria-label={t('ed.duplicateBlock')} title={t('ed.duplicateBlock')}>⧉</button>}<button type="button" onClick={() => removeBlock(block.id)} aria-label={t('ed.deleteBlock')}>×</button></div>{selected?.blockId === block.id && <FormatBar onMark={(mark) => applyMark(block, mark)} onLink={() => applyLink(block)} />}
            {block.type === 'DIVIDER' ? <hr /> : block.type === 'TABLE' ? <TableBlock rows={block.rows} readOnly={readOnlyRole(workspace.role)} onChange={(rows) => changeBlock(block.id, { rows })} /> : block.type === 'IMAGE' ? <ImageBlock fileId={block.fileId} caption={block.text} readOnly={readOnlyRole(workspace.role)} onPick={(fileId) => changeBlock(block.id, { fileId })} onCaption={(text) => changeBlock(block.id, { text })} /> : special(block) ?? <><div className="document-block__body">{block.type === 'TODO' && <input type="checkbox" checked={Boolean(block.checked)} onChange={(event) => changeBlock(block.id, { checked: event.target.checked })} aria-label={t('ed.markTodo')} />}{block.type === 'TOGGLE' ? <button type="button" className="document-toggle__chevron" aria-expanded={!closedToggles.includes(block.id)} aria-label={t('ed.toggleOpen')} onClick={() => setClosedToggles((current) => (current.includes(block.id) ? current.filter((id) => id !== block.id) : [...current, block.id]))}><span aria-hidden="true">▸</span></button> : <span className="document-block__prefix" aria-hidden="true">{block.type === 'BULLET' ? '•' : block.type === 'NUMBERED' ? `${index + 1}.` : ''}</span>}{richView(block) && <div className="document-block__rich" onMouseDown={(event) => { if ((event.target as HTMLElement).closest('a')) return; event.preventDefault(); const field = fieldOf(block.id); if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); } }}><RichText text={block.text} /></div>}<textarea id={`block-${block.id}`} value={block.text} className={richView(block) ? 'document-block__field--hidden' : undefined} onChange={(event) => onText(block, index, event.target.value, event.target.selectionStart)} onKeyDown={(event) => onKey(block, index, event)} onSelect={(event) => onSelect(block, event)} onFocus={() => setEditingId(block.id)} onBlur={() => { setEditingId((current) => (current === block.id ? null : current)); setSelected((current) => (current?.blockId === block.id ? null : current)); }} placeholder={block.type === 'SYNCED' ? t('bl.syncedPh') : block.type === 'TOGGLE' ? t('ed.togglePh') : block.type === 'CODE' ? t('ed.phCode') : block.type === 'CALLOUT' ? t('ed.phCallout') : t('ed.phText')} aria-label={t('ed.blockLabel', { type: t(`blk.${iconForBlock(block)}` as Key), n: index + 1 })} rows={headingLevel(block) > 0 || block.type === 'TOGGLE' ? 1 : 2} /></div>{block.type === 'EQUATION' && <div className="document-preview"><EquationPreview source={block.text} /></div>}{block.type === 'MERMAID' && <div className="document-preview"><MermaidPreview source={block.text} /></div>}{block.type === 'SYNCED' && <div className="document-synced"><span>{t('bl.synced', { n: blocks.filter((item) => item.syncId === block.syncId).length })}</span>{!readOnlyRole(workspace.role) && <button type="button" onClick={() => { liveEngine.current?.clear(); setBlocks((current) => current.map((item) => (item.id === block.id ? { ...item, type: 'PARAGRAPH', syncId: undefined } : item))); markChanged(); }}>{t('bl.unsync')}</button>}</div>}{block.type === 'TOGGLE' && !closedToggles.includes(block.id) && <textarea className="document-toggle__body" value={block.body ?? ''} readOnly={readOnlyRole(workspace.role)} rows={2} maxLength={20000} placeholder={t('ed.toggleBody')} aria-label={t('ed.toggleBody')} onChange={(event) => changeBlock(block.id, { body: event.target.value })} />}</>}
            {slash?.blockId === block.id && <SlashMenu query={slash.query} index={slash.index} onPick={chooseSlash} onHover={(position) => setSlash({ ...slash, index: position })} />}
            <CaretLayer blockId={block.id} cursors={remoteCursors[block.id] ?? []} text={block.text} />
            <div className="document-block__actions">{block.type === 'TODO' && block.text.trim() && <button type="button" disabled={creatingTask === block.id} onClick={() => void createTaskFromBlock(block)}>{creatingTask === block.id ? t('ed.creating') : t('ed.createTask')}</button>}<button className="document-block__insert" type="button" onClick={() => insertBlock(block.id)}>{t('ed.addBelow')}</button></div>
          </section>)}</div>
        </main>
        <aside className="document-studio__sidebar"><nav className="document-studio__tabs" aria-label={t('ed.toolsAria')}>{(['OUTLINE', 'COMMENTS', 'HISTORY', 'FILES', 'SHARE'] as const).map((tab) => <button type="button" key={tab} className={activePanel === tab ? 'is-active' : ''} onClick={() => setActivePanel(tab)}>{tab === 'OUTLINE' ? t('ed.tab.outline') : tab === 'COMMENTS' ? `${t('ed.tab.comments')} ${comments.filter((item) => !item.resolvedAt).length || ''}` : tab === 'FILES' ? t('ed.tab.files') : tab === 'SHARE' ? t('ed.tab.share') : t('ed.tab.history')}</button>)}</nav>
          {activePanel === 'SHARE' && <SharePanel documentId={document.id} />}
          {activePanel === 'FILES' && <section className="document-studio__panel"><AttachmentsPanel target={{ documentId: document.id }} /></section>}
          {activePanel === 'OUTLINE' && <section className="document-studio__panel"><h2>{t('ed.onThisPage')}</h2>{outline.length === 0 ? <p>{t('ed.outlineEmpty')}</p> : <nav>{outline.map((block) => <a className={headingLevel(block) > 1 ? 'is-nested' : ''} key={block.id} href={`#block-${block.id}`}>{block.text}</a>)}</nav>}</section>}
          {activePanel === 'COMMENTS' && <section className="document-studio__panel"><h2>{t('ed.tab.comments')}</h2><form className="document-studio__comment-form" onSubmit={addComment}><textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={2000} required placeholder={t('ed.commentPh')} /><button type="submit">{t('ed.post')}</button></form><div className="document-studio__comments">{comments.length === 0 ? <p>{t('ed.commentsEmpty')}</p> : comments.map((comment) => <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}><div><strong>{comment.createdBy.displayName}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(comment.createdAt))}</time></div><p>{comment.body}</p><button type="button" onClick={() => void toggleComment(comment)}>{comment.resolvedAt ? t('ed.reopen') : t('ed.resolve')}</button></article>)}</div></section>}
          {activePanel === 'HISTORY' && <section className="document-studio__panel"><h2>{t('ed.versionHistory')}</h2><form className="document-studio__version-form" onSubmit={saveVersion}><input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} placeholder={t('ed.versionNotePh')} /><button type="submit">{t('ed.saveVersion')}</button></form><div className="document-studio__versions">{versions.length === 0 ? <p>{t('ed.versionsEmpty')}</p> : versions.map((version) => <article key={version.id}><strong>{version.label || version.title}</strong><small>{version.createdBy.displayName} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</small><button type="button" onClick={() => void restoreVersion(version)}>{t('ed.restore')}</button></article>)}</div></section>}
        </aside>
      </div>
    </>}
  </div>;
}
