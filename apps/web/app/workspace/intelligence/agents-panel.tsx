'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';

export type AgentInfo = { key: string; name: string; description: string; instructions: string; tools: string[]; writeTools: string[]; system: boolean; canManage: boolean; creditsThisMonth: number; conversations: number };
type Call = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

const toolLabels: Record<string, Key> = {
  search_workspace: 'ag.search_workspace', search_web: 'ag.search_web', list_tasks: 'ag.list_tasks', list_projects: 'ag.list_projects', get_document: 'ag.get_document', get_briefing: 'ag.get_briefing',
  create_task: 'ag.create_task', update_task: 'ag.update_task', create_document: 'ag.create_document', create_event: 'ag.create_event',
};
const writeTools = new Set(['create_task', 'update_task', 'create_document', 'create_event']);

export function AgentsPanel({ agents, call, onChanged }: { agents: AgentInfo[]; call: Call; onChanged: () => Promise<void> }) {
  const t = useT();
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
    if (!window.confirm(t('ag.confirmDelete', { name: agent.name }))) return;
    setBusy(true); setError('');
    try { await call(`/agents/${agent.key}`, { method: 'DELETE' }); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this agent.'); }
    finally { setBusy(false); }
  }

  const current = editing && editing !== 'new' ? editing : null;
  return <details className="agents-panel">
    <summary>{t('ag.agents')} <span>{agents.length}</span></summary>
    <p className="assistant__note">{t('ag.intro')}</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    <ul className="agents-panel__list">{agents.map((agent) => <li key={agent.key}>
      <div><strong>{agent.name}</strong>{agent.system && <span className="task-badge">{t('ag.builtIn')}</span>}<p>{agent.description || t('ag.noDescription')}</p>
        <div className="agents-panel__tools">{agent.tools.map((tool) => <span key={tool} className={writeTools.has(tool) ? 'is-write' : ''} title={writeTools.has(tool) ? t('ag.writeTitle') : t('ag.readOnly')}>{toolLabels[tool] ? t(toolLabels[tool]) : tool}</span>)}{agent.tools.length === 0 && <span>{t('ag.noTools')}</span>}</div>
        <small>{t('ag.creditsMonth', { credits: agent.creditsThisMonth })} · {t(agent.conversations === 1 ? 'ag.convOne' : 'ag.convMany', { n: agent.conversations })}</small></div>
      {agent.canManage && <div className="agents-panel__actions"><button type="button" disabled={busy} onClick={() => { setError(''); setEditing(agent); }}>{t('ag.edit')}</button><button type="button" disabled={busy} onClick={() => void remove(agent)}>{t('ag.delete')}</button></div>}
    </li>)}</ul>
    {editing === null ? <button type="button" className="agents-panel__new" onClick={() => { setError(''); setEditing('new'); }}>{t('ag.newAgent')}</button> : <form key={current?.key ?? 'new'} className="agents-panel__form" onSubmit={(event) => void save(event)}>
      <h3>{current ? t('ag.editName', { name: current.name }) : t('ag.newTitle')}</h3>
      <label>{t('ag.name')}<input name="name" required maxLength={80} defaultValue={current?.name ?? ''} placeholder={t('ag.namePh')} /></label>
      <label>{t('ag.descriptionOpt')} <span>{t('doc.optional')}</span><input name="description" maxLength={240} defaultValue={current?.description ?? ''} placeholder={t('ag.descPh')} /></label>
      <label>{t('ag.instructions')}<textarea name="instructions" required maxLength={4000} rows={5} defaultValue={current?.instructions ?? ''} placeholder={t('ag.instructionsPh')} /></label>
      <fieldset><legend>{t('ag.toolsLegend')}</legend>{Object.entries(toolLabels).map(([tool, label]) => <label key={tool} className="agents-panel__tool"><input type="checkbox" name="tools" value={tool} defaultChecked={current ? current.tools.includes(tool) : !writeTools.has(tool)} />{t(label)}{writeTools.has(tool) && <small>{t('ag.asksConfirm')}</small>}</label>)}</fieldset>
      <div><button type="submit" disabled={busy}>{busy ? t('set.saving') : t('ag.save')}</button><button type="button" onClick={() => setEditing(null)}>{t('msg.cancel')}</button></div>
    </form>}
  </details>;
}
