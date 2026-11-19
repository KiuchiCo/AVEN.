'use client';

import { useState, type FormEvent } from 'react';

export type AgentInfo = { key: string; name: string; description: string; instructions: string; tools: string[]; writeTools: string[]; system: boolean; canManage: boolean; creditsThisMonth: number; conversations: number };
type Call = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

const toolLabels: Record<string, string> = {
  search_workspace: 'Search the workspace', list_tasks: 'Look at tasks', list_projects: 'Look at projects', get_document: 'Read documents', get_briefing: 'Weekly briefing',
  create_task: 'Propose new tasks', update_task: 'Propose task changes', create_document: 'Draft documents', create_event: 'Propose calendar events',
};
const writeTools = new Set(['create_task', 'update_task', 'create_document', 'create_event']);

export function AgentsPanel({ agents, call, onChanged }: { agents: AgentInfo[]; call: Call; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<AgentInfo | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get('name'), description: form.get('description') ?? '', instructions: form.get('instructions'), tools: form.getAll('tools') };
    setBusy(true); setError('');
    try {
      await (editing === 'new' ? call('/agents', { method: 'POST', body }) : call(`/agents/${(editing as AgentInfo).key}`, { method: 'PATCH', body }));
      setEditing(null); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this agent.'); }
    finally { setBusy(false); }
  }

  async function remove(agent: AgentInfo) {
    if (!window.confirm(`Delete “${agent.name}”? Its conversations stay and continue with the general assistant.`)) return;
    setBusy(true); setError('');
    try { await call(`/agents/${agent.key}`, { method: 'DELETE' }); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this agent.'); }
    finally { setBusy(false); }
  }

  const current = editing && editing !== 'new' ? editing : null;
  return <details className="agents-panel">
    <summary>Agents <span>{agents.length}</span></summary>
    <p className="assistant__note">An agent is a role for the assistant: its own instructions and the tools it may use. Anything that changes your workspace still waits for your confirmation.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    <ul className="agents-panel__list">{agents.map((agent) => <li key={agent.key}>
      <div><strong>{agent.name}</strong>{agent.system && <span className="task-badge">built-in</span>}<p>{agent.description || 'No description.'}</p>
        <div className="agents-panel__tools">{agent.tools.map((tool) => <span key={tool} className={writeTools.has(tool) ? 'is-write' : ''} title={writeTools.has(tool) ? 'Needs your confirmation before anything changes' : 'Read-only'}>{toolLabels[tool] ?? tool}</span>)}{agent.tools.length === 0 && <span>No tools: conversation only</span>}</div>
        <small>{agent.creditsThisMonth} credits this month · {agent.conversations} {agent.conversations === 1 ? 'conversation' : 'conversations'}</small></div>
      {agent.canManage && <div className="agents-panel__actions"><button type="button" disabled={busy} onClick={() => { setError(''); setEditing(agent); }}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(agent)}>Delete</button></div>}
    </li>)}</ul>
    {editing === null ? <button type="button" className="agents-panel__new" onClick={() => { setError(''); setEditing('new'); }}>＋ New agent</button> : <form key={current?.key ?? 'new'} className="agents-panel__form" onSubmit={(event) => void save(event)}>
      <h3>{current ? `Edit ${current.name}` : 'New agent'}</h3>
      <label>Name<input name="name" required maxLength={80} defaultValue={current?.name ?? ''} placeholder="Onboarding buddy" /></label>
      <label>Description <span>(optional)</span><input name="description" maxLength={240} defaultValue={current?.description ?? ''} placeholder="What is this agent for?" /></label>
      <label>Instructions<textarea name="instructions" required maxLength={4000} rows={5} defaultValue={current?.instructions ?? ''} placeholder="How should it behave? For example: be brief, explain our process step by step, always ask which project first." /></label>
      <fieldset><legend>Tools it can use</legend>{Object.entries(toolLabels).map(([tool, label]) => <label key={tool} className="agents-panel__tool"><input type="checkbox" name="tools" value={tool} defaultChecked={current ? current.tools.includes(tool) : !writeTools.has(tool)} />{label}{writeTools.has(tool) && <small>asks you to confirm</small>}</label>)}</fieldset>
      <div><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save agent'}</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
  </details>;
}
