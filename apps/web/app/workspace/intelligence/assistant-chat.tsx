'use client';

import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { AgentsPanel, type AgentInfo } from './agents-panel';
import { encodeBlocks, textToBlocks, titleFromText } from './text-to-blocks';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const actionLabels: Record<string, string> = { create_task: 'Proposed task', update_task: 'Proposed change', create_document: 'Proposed document', create_event: 'Proposed event' };
const confirmLabels: Record<string, string> = { create_task: 'Create task', update_task: 'Apply change', create_document: 'Create document', create_event: 'Add to calendar' };

type Source = { type: string; id: string; title: string; href: string };
type Action = { id: string; tool: string; summary?: string; details?: string[]; input: { title?: string }; status: 'pending' | 'confirmed' | 'declined' | 'failed'; result?: { id: string; title: string; href: string }; error?: string };
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; citations: Source[]; actions: Action[] };
type Conversation = { id: string; title: string; agentKey: string };
type Status = { configured: boolean; model: string; creditsUsed: number; creditsLimit: number | null; resetsAt: string };
type StreamEvent = { type: 'delta'; text: string } | { type: 'status'; text: string } | { type: 'citations'; sources: Source[] } | { type: 'action'; action: Action } | { type: 'done'; messageId: string } | { type: 'error'; message: string };

export function AssistantChat() {
  const startingText = useSearchParams().get('q') ?? '';
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const base = `${apiBase}/workspaces/${workspace.id}/ai`;
  const [status, setStatus] = useState<Status | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentKey, setAgentKey] = useState('general');
  const [saved, setSaved] = useState<Record<string, { id: string; title: string }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(startingText.slice(0, 8000));
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const call = useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${base}${path}`, { method: init.method ?? 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error((body as { message?: string } | null)?.message ?? 'AVEN could not complete that request.');
    return body as T;
  }, [base, getToken]);

  const refresh = useCallback(async () => {
    const [state, list, roster] = await Promise.all([call<Status>('/status'), call<Conversation[]>('/conversations'), call<AgentInfo[]>('/agents')]);
    setStatus(state); setConversations(list); setAgents(roster);
  }, [call]);

  useEffect(() => {
    let live = true;
    void Promise.all([call<Status>('/status'), call<Conversation[]>('/conversations'), call<AgentInfo[]>('/agents')])
      .then(([state, list, roster]) => { if (live) { setStatus(state); setConversations(list); setAgents(roster); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load the assistant.'); });
    return () => { live = false; };
  }, [call]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages, working]);

  async function open(id: string) {
    setActiveId(id); setError('');
    try { const opened = await call<{ agentKey: string; messages: ChatMessage[] }>(`/conversations/${id}`); setAgentKey(opened.agentKey); setMessages(opened.messages); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this conversation.'); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this conversation?')) return;
    try { await call(`/conversations/${id}`, { method: 'DELETE' }); if (activeId === id) { setActiveId(null); setMessages([]); } await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the conversation.'); }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError(''); setDraft('');
    try {
      let id = activeId;
      if (!id) { const created = await call<Conversation>('/conversations', { method: 'POST', body: { agentKey } }); id = created.id; setActiveId(id); }
      const mine: ChatMessage = { id: `local-${Date.now()}`, role: 'user', text, citations: [], actions: [] };
      const reply: ChatMessage = { id: `reply-${Date.now()}`, role: 'assistant', text: '', citations: [], actions: [] };
      setMessages((current) => [...current, mine, reply]);
      const token = await getToken();
      abort.current = new AbortController();
      const response = await fetch(`${base}/conversations/${id}/messages`, { method: 'POST', signal: abort.current.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!response.ok || !response.body) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? 'The assistant could not answer.'); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      const apply = (item: StreamEvent) => {
        if (item.type === 'status') setWorking(item.text);
        else if (item.type === 'error') setError(item.message);
        else setMessages((current) => current.map((message) => message.id !== reply.id ? message : item.type === 'delta' ? { ...message, text: message.text + item.text } : item.type === 'citations' ? { ...message, citations: item.sources } : item.type === 'action' ? { ...message, actions: [...message.actions, item.action] } : message));
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); if (frame.startsWith('data: ')) apply(JSON.parse(frame.slice(6)) as StreamEvent); }
      }
      await refresh();
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'The assistant could not answer.');
    } finally {
      setBusy(false); setWorking(''); abort.current = null;
    }
  }

  async function saveAsDocument(message: ChatMessage) {
    setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: titleFromText(message.text), content: encodeBlocks(textToBlocks(message.text)) }) });
      const body = await response.json().catch(() => null) as { id?: string; title?: string; message?: string } | null;
      if (!response.ok || !body?.id) throw new Error(body?.message ?? 'Could not save this as a document.');
      setSaved((current) => ({ ...current, [message.id]: { id: body.id!, title: body.title ?? 'Document' } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this as a document.'); }
  }

  function downloadMarkdown(message: ChatMessage) {
    const url = URL.createObjectURL(new Blob([message.text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${titleFromText(message.text).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note'}.md`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function decide(conversationId: string, action: Action, decision: 'confirm' | 'decline') {
    try {
      const updated = await call<Action>(`/conversations/${conversationId}/actions/${action.id}`, { method: 'POST', body: { decision } });
      setMessages((current) => current.map((message) => ({ ...message, actions: message.actions.map((item) => item.id === action.id ? updated : item) })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not apply your choice.'); }
  }

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  const percent = status?.creditsLimit ? Math.min(100, Math.round((status.creditsUsed / status.creditsLimit) * 100)) : 0;

  if (status && !status.configured) return <section className="assistant assistant--off" aria-label="Assistant">
    <p className="workspace-eyebrow">ASK AVEN</p><h2>The assistant needs a model provider</h2>
    <p>AVEN Intelligence answers with a real AI model, so it stays off until one is connected. To turn it on, add your key to the API’s environment and restart the API:</p>
    <pre>ANTHROPIC_API_KEY=your-key-here</pre>
    <p className="assistant__note">Optional settings: <code>AI_MODEL</code>, <code>AI_MONTHLY_CREDITS</code>, <code>AI_MAX_OUTPUT_TOKENS</code>. Nothing is sent to a model until you do this.</p>
  </section>;

  return <section className="assistant" aria-label="Assistant">
    <div className="assistant__heading"><div><p className="workspace-eyebrow">ASK AVEN</p><h2>Ask about your work</h2></div>
      {status && <div className="assistant__credits" title={`Resets ${new Date(status.resetsAt).toLocaleDateString()}`}><span>{status.creditsLimit === null ? `${status.creditsUsed} AI credits used this month` : `${status.creditsUsed} of ${status.creditsLimit} AI credits this month`}</span>{status.creditsLimit !== null && <div className="assistant__bar" role="img" aria-label={`${percent}% of credits used`}><span style={{ width: `${percent}%` }} /></div>}</div>}</div>
    <div className="assistant__layout">
      <aside className="assistant__list" aria-label="Conversations">
        <label className="assistant__agent">Agent<select value={agentKey} disabled={activeId !== null} onChange={(event) => setAgentKey(event.target.value)}>{agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.name}</option>)}</select></label>
        {agents.find((agent) => agent.key === agentKey) && <p className="assistant__agent-note">{agents.find((agent) => agent.key === agentKey)!.description}</p>}
        <button type="button" onClick={() => { setActiveId(null); setMessages([]); setError(''); setAgentKey('general'); }}>＋ New conversation</button>
        <ul>{conversations.map((conversation) => <li key={conversation.id} className={conversation.id === activeId ? 'is-active' : ''}><button type="button" onClick={() => void open(conversation.id)} title={agents.find((agent) => agent.key === conversation.agentKey)?.name}>{conversation.title}</button><button type="button" aria-label={`Delete ${conversation.title}`} onClick={() => void remove(conversation.id)}>✕</button></li>)}</ul>
      </aside>
      <div className="assistant__thread">
        <div className="assistant__messages" aria-live="polite">
          {messages.length === 0 && <div className="assistant__empty"><p>Try asking:</p><ul>{['What is overdue this week?', 'Summarise my open projects.', 'What does the Quarterly plan say?', 'Create a task to follow up with the supplier.'].map((example) => <li key={example}><button type="button" onClick={() => setDraft(example)}>{example}</button></li>)}</ul></div>}
          {messages.map((message) => <article key={message.id} className={`assistant__message assistant__message--${message.role}`}>
            {message.text ? <p>{message.text}</p> : message.role === 'assistant' && busy && !message.actions.length ? <p className="assistant__working">{working || 'Thinking…'}</p> : null}
            {message.citations.length > 0 && <div className="assistant__sources"><span>Sources</span>{message.citations.map((source) => <Link key={`${source.type}-${source.id}`} href={source.href}>{source.title}</Link>)}</div>}
            {message.actions.map((action) => <div key={action.id} className={`assistant__action assistant__action--${action.status}`}>
              <strong>{actionLabels[action.tool] ?? 'Proposed change'}</strong><p>{action.summary ?? action.input.title}</p>
              <small>{(action.details ?? []).join(' · ') || 'Nothing changes until you confirm.'}</small>
              {action.status === 'pending' && activeId && <div><button type="button" onClick={() => void decide(activeId, action, 'confirm')}>{confirmLabels[action.tool] ?? 'Confirm'}</button><button type="button" onClick={() => void decide(activeId, action, 'decline')}>Dismiss</button></div>}
              {action.status === 'confirmed' && (action.result ? <p>Done — <Link href={action.result.href}>open {action.result.title.length > 40 ? 'it' : `“${action.result.title}”`}</Link></p> : <p>Working…</p>)}
              {action.status === 'declined' && <p>Dismissed. Nothing was changed.</p>}
              {action.status === 'failed' && <p role="alert">Couldn’t do it: {action.error}</p>}
            </div>)}
            {message.role === 'assistant' && message.text && !busy && <div className="assistant__export">
              <button type="button" onClick={() => void saveAsDocument(message)}>Save as document</button><button type="button" onClick={() => downloadMarkdown(message)}>Download .md</button>
              {saved[message.id] && <span>Saved — <Link href={`/workspace/documents/${saved[message.id].id}`}>open “{saved[message.id].title}”</Link></span>}
            </div>}
          </article>)}
          {busy && working && messages.at(-1)?.text && <p className="assistant__working">{working}</p>}
          <div ref={bottom} />
        </div>
        {error && <p className="productivity-error" role="alert">{error}</p>}
        <form className="assistant__composer" onSubmit={(event) => void send(event)}>
          <textarea value={draft} rows={2} maxLength={8000} placeholder="Ask about tasks, projects, documents or this week…" aria-label="Message" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKey} disabled={busy} />
          {busy ? <button type="button" onClick={() => abort.current?.abort()}>Stop</button> : <button type="submit" disabled={!draft.trim()}>Send</button>}
        </form>
        <p className="assistant__note">Answers use only this workspace, can be wrong, and never change anything until you confirm.</p>
      </div>
    </div>
    <AgentsPanel agents={agents} call={call} onChanged={refresh} />
  </section>;
}
