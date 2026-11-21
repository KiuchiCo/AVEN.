'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { TemplateLibrary } from './templates/components/TemplateLibrary';
import { TemplateEditor } from './templates/components/editor/TemplateEditor';
import { templateDraft } from './templates/editor/normalize';
import type { ProjectTemplate, TemplateMilestone, TemplateTask } from './templates/types';
import { messageOf, useProjectApi } from './project-api';
import { Modal } from './project-ui';

type Draft = Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>;

/** Project templates, kept apart from live projects. Every template action the old page had is still here. */
export function TemplatesTab({ templates, ready, reload, onUse, onMessage, onError }: { templates: ProjectTemplate[]; ready: boolean; reload: () => Promise<void>; onUse: (template: ProjectTemplate) => void; onMessage: (message: string) => void; onError: (message: string) => void }) {
  const t = useT();
  const { request, workspace } = useProjectApi();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<TemplateTask[]>([]); const [milestones, setMilestones] = useState<TemplateMilestone[]>([]);

  async function run(action: () => Promise<void>, fallback: string, rethrow = false) {
    setBusy(true); onError('');
    try { await action(); } catch (reason) { onError(messageOf(reason, fallback)); if (rethrow) throw reason; } finally { setBusy(false); }
  }
  const post = (path: string, body: unknown, method = 'POST') => request(`/projects/project-templates${path}`, { method, body: JSON.stringify(body) });

  function edit(template: ProjectTemplate) { const draft = templateDraft(template); setEditingId(template.id); setName(draft.name); setDescription(draft.description); setTasks(draft.tasks); setMilestones(draft.milestones); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => { await post(`/${editingId}`, { name, description: description || null, taskTemplates: tasks, milestoneTemplates: milestones }, 'PATCH'); setEditingId(''); await reload(); onMessage(t('pw.templateUpdated', { name })); }, 'Could not update this project template.');
  }
  return <>
    <TemplateLibrary workspaceId={workspace.id} templates={templates} favoritesReady={ready} busy={busy} selectedId="" onEdit={edit} onUse={onUse}
      onDuplicate={(template) => run(async () => { await post(`/${template.id}/duplicate`, {}); await reload(); onMessage(t('pj.tplDuplicated', { name: template.name })); }, 'Could not duplicate this template.')}
      onDelete={(template) => void run(async () => { await request(`/projects/project-templates/${template.id}`, { method: 'DELETE' }); if (editingId === template.id) setEditingId(''); await reload(); onMessage(t('pw.templateDeleted', { name: template.name })); }, 'Could not delete this template.')}
      onImport={(template: Draft) => run(async () => { await post('/import', template); await reload(); onMessage(t('pj.tplImported', { name: template.name })); }, 'Could not import this template.', true)}
      onCreate={(template: Draft) => run(async () => { await post('', template); await reload(); onMessage(t('pj.tplCreated', { name: template.name })); }, 'Could not create this template.', true)} />
    {editingId && <Modal title={t('pw.editTemplate')} size="lg" onClose={() => setEditingId('')}>
      <TemplateEditor name={name} description={description} tasks={tasks} milestones={milestones} busy={busy} onName={setName} onDescription={setDescription} onTasks={setTasks} onMilestones={setMilestones} onSubmit={(event) => void save(event)} onCancel={() => setEditingId('')} />
    </Modal>}
  </>;
}
