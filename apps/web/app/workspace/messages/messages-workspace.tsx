'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { readEvents } from './sse';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Channel = { id: string; name: string; topic: string; unread: number };
type Message = { id: string; channelId: string; body: string; createdAt: string; editedAt: string | null; deletedAt: string | null; author: { id: string; displayName: string } };
type LiveEvent = { type: 'message' | 'message_updated'; channelId: string; message: Message } | { type: 'message_deleted'; channelId: string; id: string } | { type: 'channel'; channel: Channel };

export function MessagesWorkspace() {
  const { workspace, user } = useWorkspaceSession();
  const { getToken } = useAuth();
  const readOnly = workspace.role === 'GUEST';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const active = useRef<string | null>(null);
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
  const loadChannels = useCallback(() => call<Channel[]>('').then((list) => { setChannels(list); setActiveId((current) => current ?? list[0]?.id ?? null); }).catch(fail), [call]);
  const loadMessages = useCallback((id: string) => call<{ messages: Message[]; hasMore: boolean }>(`/${id}/messages`).then((page) => { if (active.current === id) { setMessages(page.messages); setHasMore(page.hasMore); } }).catch(fail), [call]);

  useEffect(() => { void loadChannels(); }, [loadChannels]);
  useEffect(() => {
    active.current = activeId;
    if (!activeId) return;
    void loadMessages(activeId);
    void call(`/${activeId}/read`, 'POST').then(() => setChannels((list) => list.map((item) => (item.id === activeId ? { ...item, unread: 0 } : item)))).catch(() => undefined);
  }, [activeId, call, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, activeId]);

  // Live updates. If the connection drops it retries, and catches up on anything missed meanwhile.
  useEffect(() => {
    const abort = new AbortController(); let first = true;
    const handle = (event: LiveEvent) => {
      if (event.type === 'channel') { setChannels((list) => (list.some((item) => item.id === event.channel.id) ? list : [...list, event.channel].sort((a, b) => a.name.localeCompare(b.name)))); return; }
      const inActive = event.channelId === active.current;
      if (event.type === 'message_deleted') { if (inActive) setMessages((list) => list.map((item) => (item.id === event.id ? { ...item, body: '', deletedAt: new Date().toISOString() } : item))); return; }
      if (event.type === 'message') {
        if (inActive) { setMessages((list) => (list.some((item) => item.id === event.message.id) ? list : [...list, event.message])); void call(`/${event.channelId}/read`, 'POST').catch(() => undefined); }
        else void loadChannels();
      } else if (inActive) setMessages((list) => list.map((item) => (item.id === event.message.id ? event.message : item)));
    };
    (async () => {
      while (!abort.signal.aborted) {
        try {
          const token = await getToken();
          const response = await fetch(`${apiBase}/workspaces/${workspace.id}/channels/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
          if (!response.ok || !response.body) throw new Error('stream refused');
          setLive(true);
          if (!first) { void loadChannels(); if (active.current) void loadMessages(active.current); }
          first = false;
          for await (const event of readEvents<LiveEvent>(response.body)) handle(event);
        } catch { /* fall through to retry */ }
        setLive(false);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    })();
    return () => abort.abort();
  }, [call, getToken, loadChannels, loadMessages, workspace.id]);

  async function send(event: FormEvent) {
    event.preventDefault(); const body = draft.trim(); if (!body || !activeId) return; setError('');
    try { const message = await call<Message>(`/${activeId}/messages`, 'POST', { body }); setDraft(''); setMessages((list) => (list.some((item) => item.id === message.id) ? list : [...list, message])); }
    catch (reason) { fail(reason); }
  }
  async function createChannel(event: FormEvent) {
    event.preventDefault(); setError('');
    try { const channel = await call<Channel>('', 'POST', { name: newChannel }); setNewChannel(''); setChannels((list) => (list.some((item) => item.id === channel.id) ? list : [...list, channel].sort((a, b) => a.name.localeCompare(b.name)))); setActiveId(channel.id); }
    catch (reason) { fail(reason); }
  }
  async function saveEdit() {
    if (!editing || !activeId) return;
    try { const message = await call<Message>(`/${activeId}/messages/${editing.id}`, 'PATCH', { body: editing.body }); setMessages((list) => list.map((item) => (item.id === message.id ? message : item))); setEditing(null); }
    catch (reason) { fail(reason); }
  }
  async function remove(message: Message) {
    if (!activeId || !window.confirm('Delete this message?')) return;
    try { await call(`/${activeId}/messages/${message.id}`, 'DELETE'); setMessages((list) => list.map((item) => (item.id === message.id ? { ...item, body: '', deletedAt: new Date().toISOString() } : item))); }
    catch (reason) { fail(reason); }
  }
  async function older() {
    if (!activeId || !messages.length) return;
    try { const page = await call<{ messages: Message[]; hasMore: boolean }>(`/${activeId}/messages?before=${encodeURIComponent(messages[0].createdAt)}`); setMessages((list) => [...page.messages, ...list]); setHasMore(page.hasMore); }
    catch (reason) { fail(reason); }
  }

  const channel = channels.find((item) => item.id === activeId);
  const visible = messages.filter((message) => message.channelId === activeId);
  const canModerate = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';
  return <section className="chat">
    <aside className="chat-channels" aria-label="Channels">
      <h2>Channels <span className={`chat-live${live ? ' chat-live--on' : ''}`} title={live ? 'Live' : 'Reconnecting…'} role="status" aria-label={live ? 'Live updates on' : 'Reconnecting'} /></h2>
      <ul>{channels.map((item) => <li key={item.id}><button aria-current={item.id === activeId} onClick={() => setActiveId(item.id)}># {item.name}{item.unread > 0 && <span className="chat-unread" aria-label={`${item.unread} unread`}>{item.unread}</span>}</button></li>)}</ul>
      {!readOnly && <form onSubmit={createChannel}><label className="visually-hidden" htmlFor="new-channel">New channel name</label><input id="new-channel" value={newChannel} maxLength={40} placeholder="New channel" onChange={(event) => setNewChannel(event.target.value)} /><button disabled={!newChannel.trim()}>Add</button></form>}
    </aside>
    <div className="chat-main">
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
      {!channel ? <p className="workspace-settings-note">{channels.length ? 'Choose a channel.' : readOnly ? 'No channels yet.' : 'Create the first channel to start talking.'}</p> : <>
        <header><h1># {channel.name}</h1>{channel.topic && <p>{channel.topic}</p>}</header>
        <div className="chat-thread" aria-live="polite">
          {hasMore && <button className="chat-older" onClick={() => void older()}>Load earlier messages</button>}
          {visible.map((message) => <article key={message.id} className="chat-message">
            <header><strong>{message.author.displayName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>{message.editedAt && !message.deletedAt && <small>edited</small>}</header>
            {message.deletedAt ? <p className="chat-deleted">This message was deleted.</p> : editing?.id === message.id ? <div className="chat-edit"><textarea value={editing.body} maxLength={4000} onChange={(event) => setEditing({ id: message.id, body: event.target.value })} aria-label="Edit message" /><button onClick={() => void saveEdit()} disabled={!editing.body.trim()}>Save</button><button onClick={() => setEditing(null)}>Cancel</button></div> : <p>{message.body}</p>}
            {!message.deletedAt && !readOnly && editing?.id !== message.id && (message.author.id === user.id || canModerate) && <div className="chat-actions">{message.author.id === user.id && <button onClick={() => setEditing({ id: message.id, body: message.body })}>Edit</button>}<button onClick={() => void remove(message)}>Delete</button></div>}
          </article>)}
          <div ref={endRef} />
        </div>
        {readOnly ? <p className="workspace-settings-note">Guests can read channels but not post.</p> : <form className="chat-compose" onSubmit={send}><label className="visually-hidden" htmlFor="chat-draft">Message #{channel.name}</label><textarea id="chat-draft" value={draft} maxLength={4000} rows={2} placeholder={`Message #${channel.name}`} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="workspace-settings-save" disabled={!draft.trim()}>Send</button></form>}
      </>}
    </div>
  </section>;
}
