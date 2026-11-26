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
import { Icon } from '../home-icons';
import { Avatar, EmptyState, PillTabs } from '../ui';
import { connectionError, apiFetch } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export type Channel = { id: string; kind: 'CHANNEL' | 'DIRECT' | 'GROUP'; name: string | null; topic: string; unread: number; participants: Participant[] };
export type Message = { id: string; channelId: string; parentId: string | null; body: string; createdAt: string; editedAt: string | null; deletedAt: string | null; replyCount: number; author: Participant; files: { id: string; name: string; mimeType: string; sizeBytes: number }[] };
type Member = { userId: string; displayName: string; role: string };
type Hit = { id: string; channelId: string; parentId: string | null; body: string; createdAt: string; author: Participant; channel: { kind: Channel['kind']; name: string | null; participants: Participant[] } };
type LiveEvent = { type: 'refresh' } | { type: 'message' | 'message_updated'; channelId: string; message: Message } | { type: 'message_deleted'; channelId: string; id: string; parentId?: string | null } | { type: 'channel'; channel: Channel } | { type: 'presence'; online: string[] };
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
  const [scope, setScope] = useState<'ALL' | 'CHANNELS' | 'DMS'>('ALL');
  const [tab, setTab] = useState<'MESSAGES' | 'FILES'>('MESSAGES');
  const [info, setInfo] = useState(false);
  const [adding, setAdding] = useState(false);
  const active = useRef<string | null>(null);
  const openThread = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/channels${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
      const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/members`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
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
      if (event.type === 'refresh') { void loadChannels(); if (active.current) void loadMessages(active.current); if (openThread.current && active.current) void loadThread(active.current, openThread.current); return; } // an event too large to pass between servers: look again
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
          const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/channels/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
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
  const creatingChannel = useRef(false);
  async function createChannel(event: FormEvent) {
    event.preventDefault(); if (creatingChannel.current) return; setError('');
    creatingChannel.current = true;
    try { const channel = await call<Channel>('', 'POST', { name: newChannel }); setNewChannel(''); setChannels((list) => (list.some((item) => item.id === channel.id) ? list : [...list, channel])); setActiveId(channel.id); }
    catch (reason) { fail(reason); }
    finally { creatingChannel.current = false; }
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
    if (openThread.current === message.id) { openThread.current = null; setThread(null); return; }
    setInfo(false); openThread.current = message.id; setThread({ root: message, replies: [] }); void loadThread(activeId, message.id);
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

  const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const dayTitle = (iso: string) => dayOf(iso) === new Date().toDateString() ? `${t('msg.today')}, ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}` : new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const sharedFiles = visible.filter((message) => !message.deletedAt).flatMap((message) => (message.files ?? []).map((file) => ({ ...file, author: message.author, createdAt: message.createdAt })));
  const roster = channel?.kind === 'CHANNEL' ? members : (channel?.participants ?? []).map((person) => ({ userId: person.id, displayName: person.displayName, role: members.find((member) => member.userId === person.id)?.role ?? 'MEMBER' }));
  const fileCard = (file: { id: string; name: string; mimeType: string; sizeBytes: number }) => <div key={file.id} className="msgs-file"><span className="msgs-file__icon"><Icon name="doc" size={22} /></span><span className="msgs-file__meta"><strong>{file.name}</strong><small>{formatBytes(file.sizeBytes)} · {(file.name.split('.').pop() ?? file.mimeType).toLocaleUpperCase()}</small></span><button type="button" className="rd-iconbtn" aria-label={t('msg.download', { name: file.name })} onClick={() => void download(file).catch(fail)}><Icon name="download" size={18} /></button></div>;

  const renderMessage = (message: Message, inThread: boolean) => <article key={message.id} className="msgs-message">
    <Avatar name={message.author.displayName} size={42} online={online.includes(message.author.id)} />
    <div className="msgs-message__main">
      <header><strong>{message.author.displayName}</strong><time dateTime={message.createdAt}>{when(message.createdAt)}</time>{message.editedAt && !message.deletedAt && <small>{t('msg.edited')}</small>}
        {!message.deletedAt && editing?.id !== message.id && !readOnly && (message.author.id === user.id || canModerate) && <span className="msgs-message__tools">
          {!inThread && <button type="button" className="rd-iconbtn" aria-label={t('msg.reply')} onClick={() => openReplies(message)}><Icon name="chat" size={16} /></button>}
          {message.author.id === user.id && <button type="button" className="rd-iconbtn" aria-label={t('msg.edit')} onClick={() => setEditing({ id: message.id, body: message.body })}><Icon name="edit" size={16} /></button>}
          <button type="button" className="rd-iconbtn" aria-label={t('msg.delete')} onClick={() => void remove(message)}><Icon name="trash" size={16} /></button></span>}
      </header>
      {message.deletedAt ? <p className="chat-deleted">{t('msg.deleted')}</p> : editing?.id === message.id ? <div className="msgs-edit"><textarea value={editing.body} maxLength={4000} onChange={(event) => setEditing({ id: message.id, body: event.target.value })} aria-label={t('msg.editLabel')} /><div><button type="button" className="rd-btn" onClick={() => void saveEdit()} disabled={!editing.body.trim()}>{t('msg.save')}</button><button type="button" className="rd-btn rd-btn--soft" onClick={() => setEditing(null)}>{t('msg.cancel')}</button></div></div> : <>
        {message.body && <p><MessageBody body={message.body} names={names} /></p>}
        {message.files?.length > 0 && <div className="msgs-files">{message.files.map(fileCard)}</div>}</>}
      {!message.deletedAt && !inThread && (message.replyCount > 0 || !readOnly) && <button type="button" className="msgs-replies" onClick={() => openReplies(message)}>{message.replyCount ? <><strong>{t(message.replyCount === 1 ? 'msg.replyOne' : 'msg.replyMany', { n: message.replyCount })}</strong><span className={`msgs-replies__chev${thread?.root.id === message.id ? ' is-open' : ''}`}><Icon name="chevron" size={14} /></span></> : <span>{t('msg.reply')}</span>}</button>}
    </div>
  </article>;

  const inScope = (item: Channel) => scope === 'ALL' || (scope === 'CHANNELS') === (item.kind === 'CHANNEL');
  const sideOpen = info;
  const stack = roster.slice(0, 3);

  return <section className={`msgs${sideOpen ? ' msgs--side' : ''}`}>
    <aside className="msgs-list" aria-label={t('msg.conversations')}>
      <div className="msgs-list__head"><h1>{t('nav.messages')}</h1><span className={`chat-live${live ? ' chat-live--on' : ''}`} title={live ? t('msg.live') : t('msg.reconnecting')} role="status" aria-label={live ? t('msg.liveOn') : t('msg.reconnectingShort')} /></div>
      <form className="rd-search" onSubmit={search} role="search"><Icon name="search" size={18} /><label className="visually-hidden" htmlFor="chat-search">{t('msg.searchLabel')}</label><input id="chat-search" value={query} placeholder={t('msg.searchLabel')} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setHits(null); }} /></form>
      <PillTabs size="small" label={t('msg.conversations')} value={scope} onChange={setScope} items={[{ key: 'ALL', label: t('msg.scope.all') }, { key: 'CHANNELS', label: t('msg.scope.channels') }, { key: 'DMS', label: t('msg.scope.dms') }]} />
      {scope !== 'DMS' && <section className="msgs-group"><header><h2>{t('msg.channels')}</h2>{!readOnly && <button type="button" className="rd-iconbtn" aria-label={t('msg.addChannel')} aria-expanded={adding} onClick={() => setAdding((open) => !open)}><Icon name="plus" size={18} /></button>}</header>
        {adding && !readOnly && <form className="msgs-add" onSubmit={(event) => { void createChannel(event).then(() => setAdding(false)); }}><label className="visually-hidden" htmlFor="new-channel">{t('msg.newChannelLabel')}</label><input id="new-channel" autoFocus value={newChannel} maxLength={40} placeholder={t('msg.newChannel')} onChange={(event) => setNewChannel(event.target.value)} /><button className="rd-btn" disabled={!newChannel.trim()}>{t('msg.add')}</button></form>}
        <ul>{publicChannels.filter(inScope).map((item) => <li key={item.id}><button type="button" aria-current={item.id === activeId} onClick={() => { setHits(null); setThread(null); setInfo(false); setActiveId(item.id); }}><span className="msgs-list__name">{label(item)}</span>{item.unread > 0 && <span className="chat-unread" aria-label={t('shell.unread', { n: item.unread })}>{item.unread}</span>}</button></li>)}</ul></section>}
      {scope !== 'CHANNELS' && <section className="msgs-group"><header><h2>{t('msg.dms')}</h2>{!readOnly && <button type="button" className="rd-iconbtn" aria-label={peers.length ? t('msg.newMessage') : t('msg.invitePeople')} disabled={!peers.length} aria-expanded={picking !== null} onClick={() => setPicking((current) => (current === null ? [] : null))}><Icon name="plus" size={18} /></button>}</header>
        {picking !== null && !readOnly && <fieldset className="msgs-picker"><legend>{t('msg.messageWho')}</legend>
          {peers.map((member) => <label key={member.userId}><input type="checkbox" checked={picking.includes(member.userId)} disabled={!picking.includes(member.userId) && picking.length >= 7} onChange={(event) => setPicking((current) => (event.target.checked ? [...(current ?? []), member.userId] : (current ?? []).filter((id) => id !== member.userId)))} /><Avatar name={member.displayName} size={24} online={online.includes(member.userId)} />{member.displayName}</label>)}
          <div><button type="button" className="rd-btn" onClick={() => void startConversation()} disabled={!picking.length}>{picking.length > 1 ? t('msg.startGroup') : t('msg.open')}</button><button type="button" className="rd-btn rd-btn--soft" onClick={() => setPicking(null)}>{t('msg.cancel')}</button></div></fieldset>}
        <ul>{privateChats.filter(inScope).map((item) => { const other = item.participants.find((person) => person.id !== user.id); return <li key={item.id}><button type="button" aria-current={item.id === activeId} onClick={() => { setHits(null); setThread(null); setInfo(false); setActiveId(item.id); }}><Avatar name={label(item)} size={30} online={item.kind === 'DIRECT' ? online.includes(other?.id ?? '') : undefined} /><span className="msgs-list__name">{label(item)}</span>{item.unread > 0 && <span className="chat-unread" aria-label={`${item.unread} unread`}>{item.unread}</span>}</button></li>; })}</ul>
        {!readOnly && !peers.length && <p className="rd-muted">{t('msg.invitePeople')}</p>}</section>}
    </aside>
    <div className="msgs-main">
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
      {hits ? <div className="msgs-results"><header><h2>{t('msg.results')}</h2><button type="button" className="rd-btn rd-btn--soft" onClick={() => { setHits(null); setQuery(''); }}>{t('msg.close')}</button></header>
        {hits.length === 0 ? <EmptyState art="search" compact title={t('msg.noMatch', { q: query })} /> : <ul>{hits.map((hit) => <li key={hit.id}><button type="button" onClick={() => jump(hit)}><small>{label(hit.channel)} · {hit.author.displayName} · {new Date(hit.createdAt).toLocaleDateString()}</small><span>{hit.body.replace(/@\[([^\]]*)\]\([^)]*\)/g, '@$1').slice(0, 200)}</span></button></li>)}</ul>}</div>
      : !channel ? <EmptyState art="chat" title={channels.length ? t('msg.choose') : readOnly ? t('msg.noChannels') : t('msg.createFirst')} />
      : <>
        <header className="msgs-head">
          <div className="msgs-head__title"><h2>{label(channel)}</h2><p>{channel.topic || t(channel.kind === 'CHANNEL' ? 'msg.kind.channel' : channel.kind === 'GROUP' ? 'msg.kind.group' : 'msg.kind.direct')}</p></div>
          <div className="msgs-head__tools">
            <div className="msgs-stack" aria-label={t('msg.members')}>{stack.map((person) => <Avatar key={'userId' in person ? person.userId : ''} name={person.displayName} size={32} />)}{roster.length > 3 && <span>+{roster.length - 3}</span>}</div>
            <details className="rd-menu"><summary className="rd-iconbtn rd-iconbtn--boxed" aria-label={t('msg.moreActions')}><Icon name="more" size={20} /></summary><div className="rd-menu__list">
              <button type="button" onClick={() => void call(`/${channel.id}/read`, 'POST').then(() => setChannels((list) => list.map((item) => (item.id === channel.id ? { ...item, unread: 0 } : item)))).catch(fail)}><Icon name="checkCircle" size={16} />{t('msg.markRead')}</button>
              {hasMore && <button type="button" onClick={() => void older()}><Icon name="history" size={16} />{t('msg.loadOlder')}</button>}</div></details>
            <button type="button" className={`rd-iconbtn rd-iconbtn--boxed${info ? ' is-active' : ''}`} aria-label={t('msg.info')} aria-pressed={info} onClick={() => { openThread.current = null; setThread(null); setInfo((open) => !open); }}><Icon name="info" size={20} /></button>
          </div>
        </header>
        <PillTabs label={t('msg.conversations')} value={tab} onChange={setTab} items={[{ key: 'MESSAGES', label: t('msg.tabMessages'), icon: 'chat' }, { key: 'FILES', label: t('msg.tabFiles'), icon: 'attach', count: sharedFiles.length || undefined }]} />
        <div className="msgs-panel">
          {tab === 'FILES' ? <div className="msgs-filelist">{sharedFiles.length === 0 ? <EmptyState art="folder" compact title={t('msg.noFiles')} /> : sharedFiles.map((file) => <div key={file.id}>{fileCard(file)}<small className="rd-muted">{file.author.displayName} · {new Date(file.createdAt).toLocaleDateString()}</small></div>)}</div>
          : <div className="msgs-thread" aria-live="polite">
            {hasMore && <button type="button" className="rd-btn rd-btn--soft msgs-older" onClick={() => void older()}>{t('msg.older')}</button>}
            {visible.length === 0 && <p className="rd-muted msgs-hello">{t('msg.conversationEmpty')}</p>}
            {visible.map((message, index) => <div key={message.id}>{(index === 0 || dayOf(visible[index - 1].createdAt) !== dayOf(message.createdAt)) && <p className="msgs-day"><span>{dayTitle(message.createdAt)}</span></p>}{renderMessage(message, false)}{thread?.root.id === message.id && <div className="msgs-inline" aria-label={t('msg.thread')}>{thread.replies.map((reply) => renderMessage(reply, true))}{!readOnly && <Composer label={t('msg.reply')} members={members} selfId={user.id} onSend={(body, fileIds) => post(body, fileIds, thread.root.id)} compact />}</div>}</div>)}
            <div ref={endRef} />
          </div>}
          {readOnly ? <p className="workspace-settings-note">{t('msg.guests')}</p> : <Composer label={t('msg.composerLabel', { name: label(channel) })} members={members} selfId={user.id} onSend={(body, fileIds) => post(body, fileIds)} />}
        </div>
      </>}
    </div>
    {sideOpen && channel && <aside className="msgs-side" aria-label={t('msg.info')}>
      <>
        <header><h2>{t('msg.info')}</h2><button type="button" className="rd-iconbtn" onClick={() => setInfo(false)} aria-label={t('msg.close')}><Icon name="close" size={18} /></button></header>
        <div className="msgs-info"><h3>{label(channel)}</h3><p className="rd-muted">{channel.topic || t(channel.kind === 'CHANNEL' ? 'msg.kind.channel' : channel.kind === 'GROUP' ? 'msg.kind.group' : 'msg.kind.direct')}</p>
          <h4>{t('msg.members')} <span>{roster.length}</span></h4>
          <ul className="msgs-roster">{roster.map((person) => { const id = 'userId' in person ? person.userId : ''; return <li key={id}><Avatar name={person.displayName} size={34} online={online.includes(id)} /><span><strong>{person.displayName}</strong><small>{({ OWNER: t('role.owner'), ADMINISTRATOR: t('role.administrator'), MANAGER: t('role.manager'), MEMBER: t('role.member'), GUEST: t('role.guest') } as Record<string, string>)[person.role] ?? person.role.toLowerCase()}</small></span></li>; })}</ul>
          <h4>{t('msg.sharedHere')} <span>{sharedFiles.length}</span></h4>
          {sharedFiles.length === 0 ? <p className="rd-muted">{t('msg.noFiles')}</p> : <div className="msgs-files">{sharedFiles.slice(0, 5).map(fileCard)}</div>}
        </div></>
    </aside>}
  </section>;
}
