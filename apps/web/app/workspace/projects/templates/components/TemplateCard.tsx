'use client';

import { TemplateStats } from './TemplateStats';
import { TemplateActions } from './TemplateActions';
import type { ProjectTemplate } from '../types';
import styles from './TemplateCard.module.css';

export function TemplateCard({ template, selected, busy, onPreview, onEdit, onUse, onDuplicate, onDelete }: { template: ProjectTemplate; selected: boolean; busy: boolean; onPreview: () => void; onEdit: () => void; onUse: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return <article className={`project-template-card ${styles.card}${selected ? ' project-template-card--selected' : ''}`}><div><span className="workspace-eyebrow">PROJECT STARTER</span><h3><button className={`project-template-card__title ${styles.title}`} type="button" onClick={onPreview}>{template.name}</button></h3><p>{template.description || 'A reusable project setup for your workspace.'}</p></div><TemplateStats template={template} /><p className="project-template-card__usage">Used {template.useCount} times{template.lastUsedAt ? ` · last used ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(template.lastUsedAt))}` : ''}</p><footer><button type="button" disabled={busy} onClick={onEdit}>Edit</button><button type="button" disabled={busy} onClick={onUse}>{selected ? 'Selected' : 'Use template'}</button><TemplateActions template={template} busy={busy} onDuplicate={onDuplicate} onDelete={onDelete} /></footer></article>;
}
