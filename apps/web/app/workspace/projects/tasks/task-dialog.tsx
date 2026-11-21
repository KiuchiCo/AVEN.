'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import { useProject } from '../project-context';
import { messageOf } from '../project-api';
import { dateOnly, taskPriorities, taskStatuses, type Task } from '../project-model';
import { ConfirmDialog, Field, Modal, capitalise, priorityKey, taskStatusKey } from '../project-ui';

const labelPattern = /^[\p{L}\p{N}_-]+$/u;

/** Create or edit one task. The essentials come first; the rest sits behind "More options". Used from every tab. */
export function TaskDialog() {
  const t = useT();
  const { project, tasks, milestones, members, labels, request, taskDialog, closeTask, saveTaskFields, reloadTasks, reloadMilestones, reload, say, busy, setBusy } = useProject();
  const editing = taskDialog?.task ?? null;
  const preset = taskDialog?.preset ?? {};
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prereqs, setPrereqs] = useState<string[]>(() => editing?.dependsOn.map((item) => item.id) ?? []);
  const assignable = members.filter((member) => member.role !== 'GUEST' || editing?.assignee?.id === member.userId);
  const others = tasks.filter((task) => task.id !== editing?.id);
  const archived = project.status === 'ARCHIVED';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const labelList = [...new Set(text('labels').split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))];
    if (labelList.length > 10 || labelList.some((label) => label.length > 32 || !labelPattern.test(label))) { setProblem(t('pw.labelsInvalid')); return; }
    if (text('startAt') && text('dueAt') && text('startAt') > text('dueAt')) { setProblem(t('pw.startAfterDue')); return; }
    setBusy(true); setProblem('');
    try {
      const fields = { title: text('title'), description: text('description') || null, status: text('status'), priority: text('priority'), assigneeId: text('assigneeId') || null, dueAt: text('dueAt') || null, startAt: text('startAt') || null, labels: labelList };
      const milestoneId = text('milestoneId') || null;
      let id = editing?.id;
      if (editing) {
        const changed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          const before = key === 'dueAt' ? dateOnly(editing.dueAt) || null : key === 'startAt' ? dateOnly(editing.startAt) || null : key === 'assigneeId' ? editing.assignee?.id ?? null : key === 'labels' ? editing.labels : (editing as unknown as Record<string, unknown>)[key];
          if (JSON.stringify(before) !== JSON.stringify(value)) changed[key] = value;
        }
        if (Object.keys(changed).length) await saveTaskFields(editing, changed);
        if ((editing.milestone?.id ?? null) !== milestoneId) await request(`/tasks/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ milestoneId }) });
      } else {
        const created = await request<{ id: string }>('/tasks', { method: 'POST', body: JSON.stringify({ ...fields, projectId: project.id, milestoneId }) });
        id = created.id;
      }
      const before = editing?.dependsOn.map((item) => item.id).sort() ?? [];
      if (id && JSON.stringify([...prereqs].sort()) !== JSON.stringify(before)) await request(`/tasks/${id}/dependencies`, { method: 'PUT', body: JSON.stringify({ dependsOnTaskIds: prereqs }) });
      await Promise.all([reloadTasks(), reloadMilestones()]);
      say(t(editing ? 'pw.taskSaved' : 'pw.taskCreated', { title: fields.title }));
      closeTask();
    } catch (reason) { setProblem(messageOf(reason, t('pw.taskFailed'))); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try { await request(`/tasks/${editing.id}`, { method: 'DELETE' }); await reload(); say(t('pw.taskDeleted', { title: editing.title })); closeTask(); }
    catch (reason) { setProblem(messageOf(reason, t('pw.taskFailed'))); setConfirmDelete(false); }
    finally { setBusy(false); }
  }

  const advancedOpen = Boolean(editing && (editing.startAt || editing.labels.length || editing.milestone || editing.dependsOn.length)) || Boolean(preset.milestoneId);
  return <>
    <Modal title={editing ? t('pw.editTask') : t('pj.newTask')} description={t('pw.taskIn', { name: project.name })} onClose={closeTask} footer={<>

        {editing && <Link className="pw-link" href={`/workspace/tasks/${editing.id}`}>{t('pw.openTaskPage')}</Link>}
        {editing && <button type="button" className="rd-btn rd-btn--soft pw-btn--danger-soft" onClick={() => setConfirmDelete(true)} disabled={busy}>{t('file.delete')}</button>}
        <span className="pw-spacer" />
        <button type="button" className="rd-btn rd-btn--soft" onClick={closeTask}>{t('msg.cancel')}</button>
        <button type="submit" form="pw-task-form" className="rd-btn" disabled={busy || archived}>{busy ? t('set.saving') : editing ? t('pw.saveChanges') : t('pj.createTask')}</button>
      </>}>
      <form id="pw-task-form" className="pw-form" onSubmit={(event) => void submit(event)}>
        <Field label={t('pj.taskName')}><input name="title" required maxLength={200} defaultValue={editing?.title ?? ''} placeholder={t('pj.taskNamePh')} data-autofocus /></Field>
        <Field label={<>{t('db.description')} <small>{t('doc.optional')}</small></>}><textarea name="description" rows={3} maxLength={5000} defaultValue={editing?.description ?? ''} placeholder={t('ph.taskDescPh')} /></Field>
        <div className="pw-form__row">
          <Field label={t('pj.status')}><select name="status" defaultValue={editing?.status ?? preset.status ?? 'TODO'}>{taskStatuses.map((status) => <option key={status} value={status}>{t(taskStatusKey[status])}</option>)}</select></Field>
          <Field label={t('pj.priority')}><select name="priority" defaultValue={editing?.priority ?? 'MEDIUM'}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{capitalise(t(priorityKey[priority]))}</option>)}</select></Field>
          <Field label={t('pj.assignee')}><select name="assigneeId" defaultValue={editing?.assignee?.id ?? ''}><option value="">{t('pj.unassigned')}</option>{assignable.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></Field>
          <Field label={t('pj.dueDate')}><input name="dueAt" type="date" defaultValue={dateOnly(editing?.dueAt)} /></Field>
        </div>
        <details className="pw-more" open={advancedOpen}>
          <summary>{t('pw.moreOptions')}</summary>
          <div className="pw-form">
            <div className="pw-form__row">
              <Field label={t('pj.startDate')}><input name="startAt" type="date" defaultValue={dateOnly(editing?.startAt)} /></Field>
              <Field label={t('pw.milestone')}><select name="milestoneId" defaultValue={editing?.milestone?.id ?? preset.milestoneId ?? ''}><option value="">{t('pw.noMilestone')}</option>{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></Field>
            </div>
            <Field label={t('pj.labels')} hint={t('pw.labelsHint')}><input name="labels" list="pw-label-list" maxLength={330} defaultValue={editing?.labels.join(', ') ?? ''} placeholder={t('pj.labelNamesPh')} /><datalist id="pw-label-list">{labels.map((item) => <option key={item.label} value={item.label} />)}</datalist></Field>
            <fieldset className="pw-prereqs"><legend>{t('pw.prereqs')}</legend>
              {others.length === 0 ? <p className="pw-muted">{t('pw.noOtherTasks')}</p> : <div>{others.map((other) => <label key={other.id}><input type="checkbox" checked={prereqs.includes(other.id)} onChange={(event) => setPrereqs((current) => event.target.checked ? [...current, other.id] : current.filter((id) => id !== other.id))} /><span>{other.title}</span></label>)}</div>}
            </fieldset>
          </div>
        </details>
        {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      </form>
    </Modal>
    {confirmDelete && editing && <ConfirmDialog title={t('pw.deleteTaskTitle')} confirmLabel={t('file.delete')} busy={busy} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)}>{t('pw.deleteTaskBody', { title: editing.title })}</ConfirmDialog>}
  </>;
}

export type { Task };
