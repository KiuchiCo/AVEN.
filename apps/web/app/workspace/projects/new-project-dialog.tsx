'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../home-icons';
import { messageOf, useProjectApi } from './project-api';
import { projectStatuses, type Member, type Project } from './project-model';
import { Field, Modal, statusKey } from './project-ui';
import type { ProjectTemplate } from './templates/types';

/** Two ways to start: from nothing, or from a template. Only the essentials are asked for; the rest is behind "More options". */
export function NewProjectDialog({ templates, members, initialTemplateId, onClose }: { templates: ProjectTemplate[]; members: Member[]; initialTemplateId?: string; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const { request, user } = useProjectApi();
  const [mode, setMode] = useState<'SCRATCH' | 'TEMPLATE'>(initialTemplateId ? 'TEMPLATE' : 'SCRATCH');
  const [templateId, setTemplateId] = useState(initialTemplateId ?? templates[0]?.id ?? '');
  const [name, setName] = useState(() => { const first = templates.find((template) => template.id === initialTemplateId); return first ? `${first.name} project` : ''; });
  const [description, setDescription] = useState(() => templates.find((template) => template.id === initialTemplateId)?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const template = templates.find((item) => item.id === templateId);
  const owners = members.filter((member) => member.role !== 'GUEST');

  function pickTemplate(id: string) {
    const next = templates.find((item) => item.id === id);
    if (next && (!name.trim() || name === `${template?.name} project`)) setName(`${next.name} project`);
    if (next && (!description.trim() || description === (template?.description ?? ''))) setDescription(next.description ?? '');
    setTemplateId(id);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    if (text('startAt') && text('dueAt') && text('startAt') > text('dueAt')) { setProblem(t('pw.startAfterDue')); return; }
    setBusy(true); setProblem('');
    try {
      const common = { name: text('name'), description: text('description') || undefined, ownerId: text('ownerId') || undefined, startAt: text('startAt') || undefined, dueAt: text('dueAt') || undefined };
      let project: Project;
      if (mode === 'TEMPLATE') {
        if (!templateId) throw new Error(t('pw.chooseTemplate'));
        project = await request<Project>(`/projects/project-templates/${templateId}/apply`, { method: 'POST', body: JSON.stringify({ ...common, description: text('description') || null }) });
        const extra: Record<string, unknown> = {};
        if (text('status') && text('status') !== 'PLANNING') extra.status = text('status');
        if (text('budgetTotal')) extra.budgetTotal = text('budgetTotal');
        if (text('visibility') && text('visibility') !== 'WORKSPACE') extra.visibility = text('visibility');
        if (Object.keys(extra).length) await request(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(extra) });
      } else {
        project = await request<Project>('/projects', { method: 'POST', body: JSON.stringify({ ...common, status: text('status') || 'PLANNING', budgetTotal: text('budgetTotal') || undefined, visibility: text('visibility') || undefined }) });
      }
      router.push(`/workspace/projects/${project.id}`);
    } catch (reason) { setProblem(messageOf(reason, t('pw.createFailed'))); setBusy(false); }
  }

  return <Modal title={t('pj.newProject')} description={t('pw.newProjectHint')} size="md" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <div className="pw-start" role="radiogroup" aria-label={t('pw.startFrom')}>
        {([['SCRATCH', 'pw.scratch', 'pw.scratchHint', 'plus'], ['TEMPLATE', 'pw.useTemplate', 'pw.useTemplateHint', 'layers']] as const).map(([value, title, hint, icon]) => <label key={value} className={mode === value ? 'is-on' : ''}>
          <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} /><Icon name={icon} size={22} /><span><strong>{t(title)}</strong><small>{t(hint)}</small></span></label>)}
      </div>
      {mode === 'TEMPLATE' && (templates.length === 0 ? <p className="pw-notice pw-notice--error" role="status">{t('pw.noTemplates')}</p> : <Field label={t('pw.template')}>
        <select value={templateId} onChange={(event) => pickTemplate(event.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {t('pw.tplCounts', { tasks: item.taskCount ?? 0, milestones: item.milestoneCount ?? 0 })}</option>)}</select>
      </Field>)}
      <Field label={t('pj.projectName')}><input name="name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pj.projectNamePh')} data-autofocus /></Field>
      <Field label={<>{t('db.description')} <small>{t('doc.optional')}</small></>}><textarea name="description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('pj.descPh')} /></Field>
      <div className="pw-form__row">
        <Field label={t('pw.owner')}><select name="ownerId" defaultValue={owners.some((member) => member.userId === user.id) ? user.id : owners[0]?.userId ?? ''}>{owners.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></Field>
        <Field label={<>{t('pj.startDate')} <small>{t('doc.optional')}</small></>}><input name="startAt" type="date" /></Field>
        <Field label={<>{t('pj.dueDate')} <small>{t('doc.optional')}</small></>}><input name="dueAt" type="date" /></Field>
      </div>
      <details className="pw-more"><summary>{t('pw.moreOptions')}</summary>
        <div className="pw-form"><div className="pw-form__row">
          <Field label={t('pj.status')}><select name="status" defaultValue="PLANNING">{projectStatuses.filter((status) => status !== 'ARCHIVED').map((status) => <option key={status} value={status}>{t(statusKey[status])}</option>)}</select></Field>
          <Field label={<>{t('pj.budget')} <small>{t('pj.budgetHint')}</small></>}><input name="budgetTotal" type="number" min="0" step="0.01" placeholder="25000.00" /></Field>
          <Field label={t('pw.visibility')}><select name="visibility" defaultValue="WORKSPACE"><option value="WORKSPACE">{t('pw.vis.workspace')}</option><option value="TEAM">{t('pw.vis.team')}</option></select></Field>
        </div></div>
      </details>
      {mode === 'TEMPLATE' && template && <p className="pw-muted">{t('pj.startHint')}</p>}
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy || (mode === 'TEMPLATE' && !templateId)}>{busy ? t('pj.creating') : t('pj.createProject')}{!busy && <Icon name="arrow" size={16} />}</button></div>
    </form>
  </Modal>;
}
