'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { conversationLabel, type Participant } from './conversation-names';
import { formatBytes } from '../files/types';
import { useFilesApi } from '../files/use-files-api';
import { useT } from '../../i18n';
import { Composer } from './composer';
import { MessageBody } from './message-body';
import { readEvents } from './sse';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export type Channel = { id: string; kind: 'CHANNEL' | 'DIRECT' | 'GROUP'; name: string | null; topic: string; unread: number; participants: Participant[] };
export type Message = { id: string; channelId: string; parentId: string | null; body: string; createdAt: string; editedAt: string | null; deletedAt: string | null; replyCount: number; author: Participant; files: { id: string; name: string; mimeType: string; sizeBytes: number }[] };
type Member = { userId: string; displayName: string; role: string };
type Hit = { id: string; channelId: string; parentId: string | null; body: string; createdAt: string; author: Participant; channel: { kind: Channel['kind']; name: string | null; participants: Participant[] } };
type LiveEvent = { type: 'message' | 'message_updated'; channelId: string; message: Message } | { type: 'message_deleted'; channelId: string; id: string; parentId?: string | null } | { type: 'channel'; channel: Channel } | { type: 'presence'; online: string[] };
const byName = (a: Channel, b: Channel) => (a.name ?? '').localeCompare(b.name ?? '');

export function MessagesWorkspace() {
  const t = useT();
  const { workspace, user } = useWorkspaceSession();
  const { getToken } = useAuth();
  const { download } = useFilesApi();
  const readOnly = workspace.role === 'GUEST';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [thread, setThread] = useState<{ root: Message; replies: Message[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [picking, setPicking] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const active = useRef<string | null>(null);
  const openThread = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/channels${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken, workspace.id]);

  const fail = (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Something went wrong.');
  const loadChannels = useCallback(() => call<Channel[]>('').then((list) => { setChannels(list); setActiveId((current) => current ?? list.find((item) => item.kind === 'CHANNEL')?.id ?? list[0]?.id ?? null); }).catch(fail), [call]);
  const loadMessages = useCallback((id: string) => call<{ messages: Message[]; hasMore: boolean }>(`/${id}/messages`).then((page) => { if (active.current === id) { setMessages(page.messages); setHasMore(page.hasMore); } }).catch(fail), [call]);
  const loadThread = useCallback((channelId: string, rootId: string) => call<{ root: Message; replies: Message[] }>(`/${channelId}/messages/${rootId}/replies`).then((data) => { if (openThread.current === rootId) setThread(data); }).catch(fail), [call]);

  useEffect(() => { void loadChannels(); }, [loadChannels]);
  useEffect(() => {
    void (async () => {
      const token = await getToken(); if (!token || !apiBase) return;
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/members`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.ok) setMembers(await response.json() as Member[]);
    })().catch(() => undefined);
  }, [getToken, workspace.id]);
  useEffect(() => {
    active.current = activeId; openThread.current = null;
    if (!activeId) return;
    void loadMessages(activeId);
    void call(`/${activeId}/read`, 'POST').then(() => setChannels((list) => list.map((item) => (item.id === activeId ? { ...item, unread: 0 } : item)))).catch(() => undefined);
  }, [activeId, call, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, activeId]);

  // Live updates. If the connection drops it retries, and catches up on anything missed meanwhile.
  useEffect(() => {
    const abort = new AbortController(); let first = true;
    const handle = (event: LiveEvent) => {
      if (event.type === 'presence') { setOnline(event.online); return; }
      if (event.type === 'channel') { setChannels((list) => (list.some((item) => item.id === event.channel.id) ? list : [...list, event.channel])); return; }
      const inActive = event.channelId === active.current;
      if (event.type === 'message_deleted') {
        const gone = (item: Message) => (item.id === event.id ? { ...item, body: '', deletedAt: new Date().toISOString() } : item);
        if (inActive && !event.parentId) setMessages((list) => list.map(gone));
        if (inActive && event.parentId) setMessages((list) => list.map((item) => (item.id === event.parentId ? { ...item, replyCount: Math.max(0, item.replyCount - 1) } : item)));
        setThread((current) => (current ? { root: gone(current.root), replies: current.replies.map(gone) } : current));
        return;
      }
      const { message } = event;
      if (event.type === 'message') {
        if (message.parentId) {
          if (inActive) setMessages((list) => list.map((item) => (item.id === message.parentId ? { ...item, replyCount: item.replyCount + 1 } : item)));
          setThread((current) => (current && current.root.id === message.parentId && !current.replies.some((item) => item.id === message.id) ? { ...current, replies: [...current.replies, message] } : current));
        } else if (inActive) setMessages((list) => (list.some((item) => item.id === message.id) ? list : [...list, message]));
        if (inActive) void call(`/${event.channelId}/read`, 'POST').catch(() => undefined); else void loadChannels();
      } else {
        setMessages((list) => list.map((item) => (item.id === message.id ? message : item)));
        setThread((current) => (current ? { root: current.root.id === message.id ? message : current.root, replies: current.replies.map((item) => (item.id === message.id ? message : item)) } : current));
      }
    };
    (async () => {
      while (!abort.signal.aborted) {
        try {
          const token = await getToken();
          const response = await fetch(`${apiBase}/workspaces/${workspace.id}/channels/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
          if (!response.ok || !response.body) throw new Error('stream refused');
          setLive(true);
          if (!first) { void loadChannels(); if (active.current) void loadMessages(active.current); if (openThread.current && active.current) void loadThread(active.current, openThread.current); }
          first = false;
          for await (const event of readEvents<LiveEvent>(response.body)) handle(event);
        } catch { /* fall through to retry */ }
        setLive(false);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    })();
    return () => abort.abort();
  }, [call, getToken, loadChannels, loadMessages, loadThread, workspace.id]);

  async function post(body: string, fileIds: string[], parentId?: string) {
    if (!activeId) return;
    setError('');
    try {
      const message = await call<Message>(`/${activeId}/messages`, 'POST', { body, ...(fileIds.length ? { fileIds } : {}), ...(parentId ? { parentId } : {}) });
      if (parentId) { setThread((current) => (current && !current.replies.some((item) => item.id === message.id) ? { ...current, replies: [...current.replies, message] } : current)); setMessages((list) => list.map((item) => (item.id === parentId ? { ...item, replyCount: item.replyCount + 1 } : item))); }
      else setMessages((list) => (list.some((item) => item.id === message.id) ? list : [...list, message]));
    } catch (reason) { fail(reason); throw reason; }
  }
  async function createChannel(event: FormEvent) {
    event.preventDefault(); setError('');
    try { const channel = await call<Channel>('', 'POST', { name: newChannel }); setNewChannel(''); setChannels((list) => (list.some((item) => item.id === channel.id) ? list : [...list, channel])); setActiveId(channel.id); }
    catch (reason) { fail(reason); }
  }
  async function startConversation() {
    if (!picking?.length) return; setError('');
    try { const channel = await call<Channel>('/conversations', 'POST', { userIds: picking }); setPicking(null); setChannels((list) => (list.some((item) => item.id === channel.id) ? list : [...list, channel])); setActiveId(channel.id); }
    catch (reason) { fail(reason); }
  }
  async function saveEdit() {
    if (!editing || !activeId) return;
    try { const message = await call<Message>(`/${activeId}/messages/${editing.id}`, 'PATCH', { body: editing.body }); setMessages((list) => list.map((item) => (item.id === message.id ? message : item))); setThread((current) => (current ? { root: current.root.id === message.id ? message : current.root, replies: current.replies.map((item) => (item.id === message.id ? message : item)) } : current)); setEditing(null); }
    catch (reason) { fail(reason); }
  }
  async function remove(message: Message) {
    if (!activeId || !window.confirm(t('msg.confirmDelete'))) return;
    try { await call(`/${activeId}/messages/${message.id}`, 'DELETE'); } catch (reason) { fail(reason); }
  }
  async function older() {
    if (!activeId || !messages.length) return;
    try { const page = await call<{ messages: Message[]; hasMore: boolean }>(`/${activeId}/messages?before=${encodeURIComponent(messages[0].createdAt)}`); setMessages((list) => [...page.messages, ...list]); setHasMore(page.hasMore); }
    catch (reason) { fail(reason); }
  }
  function openReplies(message: Message) {
    if (!activeId) return;
    openThread.current = message.id; setThread({ root: message, replies: [] }); void loadThread(activeId, message.id);
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setError('');
    if (query.trim().length < 2) { setHits(null); return; }
    try { setHits(await call<Hit[]>(`/search?q=${encodeURIComponent(query.trim())}`)); } catch (reason) { fail(reason); }
  }
  function jump(hit: Hit) {
    setHits(null); setQuery(''); setActiveId(hit.channelId);
    if (hit.parentId) { openThread.current = hit.parentId; void loadThread(hit.channelId, hit.parentId); }
  }

  const label = (channel: { kind: Channel['kind']; name: string | null; participants: Participant[] }) => {
    if (channel.kind === 'CHANNEL') return conversationLabel(channel, user.id);
    const others = channel.participants.filter((person) => person.id !== user.id).map((person) => person.displayName);
    if (!others.length) return t('msg.justYou');
    if (others.length === 1) return others[0];
    if (others.length === 2) return t('actor.and', { a: others[0], b: others[1] });
    return t(others.length === 3 ? 'actor.othersOne' : 'actor.othersMany', { a: others[0], b: others[1], n: others.length - 2 });
  };
  const channel = channels.find((item) => item.id === activeId);
  const visible = messages.filter((message) => message.channelId === activeId);
  const names = new Map(members.map((member) => [member.userId, member.displayName]));
  const canModerate = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';
  const peers = members.filter((member) => member.userId !== user.id && member.role !== 'GUEST');
  const publicChannels = channels.filter((item) => item.kind === 'CHANNEL').sort(byName);
  const privateChats = channels.filter((item) => item.kind !== 'CHANNEL').sort((a, b) => label(a).localeCompare(label(b)));
  const dot = (id: string) => <span className={`chat-presence${online.includes(id) ? ' chat-presence--on' : ''}`} aria-label={online.includes(id) ? t('msg.online') : t('msg.offline')} />;
  const chatDot = (item: Channel) => item.kind === 'DIRECT' ? dot(item.participants.find((person) => person.id !== user.id)?.id ?? '') : null;

  const renderMessage = (message: Message, inThread: boolean) => <article key={message.id} className="chat-message">
    <header><strong>{message.author.displayName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>{message.editedAt && !message.deletedAt && <small>{t('msg.edited')}</small>}</header>
    {message.deletedAt ? <p className="chat-deleted">{t('msg.deleted')}</p> : editing?.id === message.id ? <div className="chat-edit"><textarea value={editing.body} maxLength={4000} onChange={(event) => setEditing({ id: message.id, body: event.target.value })} aria-label={t('msg.editLabel')} /><button onClick={() => void saveEdit()} disabled={!editing.body.trim()}>{t('msg.save')}</button><button onClick={() => setEditing(null)}>{t('msg.cancel')}</button></div> : <>{message.body && <p><MessageBody body={message.body} names={names} /></p>}{message.files?.length > 0 && <ul className="chat-files">{message.files.map((file) => <li key={file.id}><button type="button" onClick={() => void download(file).catch(fail)}>{file.name}</button> <small>{formatBytes(file.sizeBytes)}</small></li>)}</ul>}</>}
    {!message.deletedAt && editing?.id !== message.id && <div className="chat-actions">
      {!inThread && <button onClick={() => openReplies(message)}>{message.replyCount ? t(message.replyCount === 1 ? 'msg.replyOne' : 'msg.replyMany', { n: message.replyCount }) : readOnly ? '' : t('msg.reply')}</button>}
      {!readOnly && message.author.id === user.id && <button onClick={() => setEditing({ id: message.id, body: message.body })}>{t('msg.edit')}</button>}
      {!readOnly && (message.author.id === user.id || canModerate) && <button onClick={() => void remove(message)}>{t('msg.delete')}</button>}
    </div>}
  </article>;

  return <section className={`chat${thread ? ' chat--thread' : ''}`}>
    <aside className="chat-channels" aria-label={t('msg.conversations')}>
      <form className="chat-search" onSubmit={search} role="search"><label className="visually-hidden" htmlFor="chat-search">{t('msg.searchLabel')}</label><input id="chat-search" value={query} placeholder={t('msg.searchLabel')} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setHits(null); }} /></form>
      <h2>{t('msg.channels')} <span className={`chat-live${live ? ' chat-live--on' : ''}`} title={live ? t('msg.live') : t('msg.reconnecting')} role="status" aria-label={live ? t('msg.liveOn') : t('msg.reconnectingShort')} /></h2>
      <ul>{publicChannels.map((item) => <li key={item.id}><button aria-current={item.id === activeId} onClick={() => { setHits(null); setThread(null); setActiveId(item.id); }}>{label(item)}{item.unread > 0 && <span className="chat-unread" aria-label={t('shell.unread', { n: item.unread })}>{item.unread}</span>}</button></li>)}</ul>
      {!readOnly && <form onSubmit={createChannel}><label className="visually-hidden" htmlFor="new-channel">{t('msg.newChannelLabel')}</label><input id="new-channel" value={newChannel} maxLength={40} placeholder={t('msg.newChannel')} onChange={(event) => setNewChannel(event.target.value)} /><button disabled={!newChannel.trim()}>{t('msg.add')}</button></form>}
      <h2>{t('msg.dms')}</h2>
      <ul>{privateChats.map((item) => <li key={item.id}><button aria-current={item.id === activeId} onClick={() => { setHits(null); setThread(null); setActiveId(item.id); }}><span className="chat-name">{chatDot(item)}{label(item)}</span>{item.unread > 0 && <span className="chat-unread" aria-label={`${item.unread} unread`}>{item.unread}</span>}</button></li>)}</ul>
      {!readOnly && (picking === null ? <button className="chat-new" onClick={() => setPicking([])} disabled={!peers.length}>{peers.length ? t('msg.newMessage') : t('msg.invitePeople')}</button> : <fieldset className="chat-picker"><legend>{t('msg.messageWho')}</legend>
        {peers.map((member) => <label key={member.userId}><input type="checkbox" checked={picking.includes(member.userId)} disabled={!picking.includes(member.userId) && picking.length >= 7} onChange={(event) => setPicking((current) => (event.target.checked ? [...(current ?? []), member.userId] : (current ?? []).filter((id) => id !== member.userId)))} />{dot(member.userId)}{member.displayName}</label>)}
        <div><button onClick={() => void startConversation()} disabled={!picking.length}>{picking.length > 1 ? t('msg.startGroup') : t('msg.open')}</button><button onClick={() => setPicking(null)}>{t('msg.cancel')}</button></div></fieldset>)}
    </aside>
    <div className="chat-main">
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
      {hits ? <div className="chat-results"><header><h1>{t('msg.results')}</h1><button onClick={() => { setHits(null); setQuery(''); }}>{t('msg.close')}</button></header>
        {hits.length === 0 ? <p className="workspace-settings-note">{t('msg.noMatch', { q: query })}</p> : <ul>{hits.map((hit) => <li key={hit.id}><button onClick={() => jump(hit)}><small>{label(hit.channel)} · {hit.author.displayName} · {new Date(hit.createdAt).toLocaleDateString()}</small><span>{hit.body.replace(/@\[([^\]]*)\]\([^)]*\)/g, '@$1').slice(0, 200)}</span></button></li>)}</ul>}</div>
      : !channel ? <p className="workspace-settings-note">{channels.length ? t('msg.choose') : readOnly ? t('msg.noChannels') : t('msg.createFirst')}</p> : <>
        <header><h1>{label(channel)}</h1>{channel.topic && <p>{channel.topic}</p>}{channel.kind === 'GROUP' && <p>{channel.participants.map((person) => person.displayName).join(', ')}</p>}</header>
        <div className="chat-thread" aria-live="polite">
          {hasMore && <button className="chat-older" onClick={() => void older()}>{t('msg.older')}</button>}
          {visible.map((message) => renderMessage(message, false))}
          <div ref={endRef} />
        </div>
        {readOnly ? <p className="workspace-settings-note">{t('msg.guests')}</p> : <Composer label={t('msg.composerLabel', { name: label(channel) })} members={members} selfId={user.id} onSend={(body, fileIds) => post(body, fileIds)} />}
      </>}
    </div>
    {thread && channel && <aside className="chat-side" aria-label={t('msg.thread')}>
      <header><h2>{t('msg.thread')}</h2><button onClick={() => { openThread.current = null; setThread(null); }} aria-label={t('msg.closeThread')}>{t('msg.close')}</button></header>
      <div className="chat-thread">{renderMessage(thread.root, true)}<p className="chat-side__count">{t(thread.replies.length === 1 ? 'msg.replyOne' : 'msg.replyMany', { n: thread.replies.length })}</p>{thread.replies.map((reply) => renderMessage(reply, true))}</div>
      {!readOnly && <Composer label={t('msg.reply')} members={members} selfId={user.id} onSend={(body, fileIds) => post(body, fileIds, thread.root.id)} compact />}
    </aside>}
  </section>;
}
