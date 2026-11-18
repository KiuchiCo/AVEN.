'use client';

import { useEffect, useRef } from 'react';
import { TemplateStats } from './TemplateStats';
import { TemplateSchedule } from './TemplateSchedule';
import { TemplateDependencies } from './TemplateDependencies';
import { TemplateTaskPreview } from './TemplateTaskPreview';
import { TemplateMilestonePreview } from './TemplateMilestonePreview';
import { TemplateSummary } from './TemplateSummary';
import type { ProjectTemplate } from '../types';
import styles from './TemplatePreview.module.css';
import { templateDialogKeydown } from '../dialog-keyboard';

export function TemplatePreview({ template, onClose }: { template: ProjectTemplate | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!template) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) { if (dialogRef.current) templateDialogKeydown(event, dialogRef.current, onClose); }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [template, onClose]);
  if (!template) return null;
  return <div className={`project-template-preview-backdrop ${styles.backdrop}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className={`project-template-preview ${styles.panel}`} role="dialog" aria-modal="true" aria-labelledby="template-preview-title"><header><div><p className="workspace-eyebrow">TEMPLATE PREVIEW</p><h2 id="template-preview-title">{template.name}</h2></div><button type="button" onClick={onClose} aria-label="Close template preview">Close</button></header><p>{template.description || 'A reusable project setup for your workspace.'}</p><TemplateSummary template={template} /><TemplateStats template={template} /><h3>Task outline</h3><ol className="project-template-preview__tasks">{template.taskTemplates.map((task, index) => <TemplateTaskPreview key={`${index}-${task.title}`} task={task} index={index} />)}</ol><h3>Prerequisites</h3><TemplateDependencies tasks={template.taskTemplates} /><h3>Milestones</h3>{template.milestoneTemplates.length ? <ol className="project-template-preview__milestones">{template.milestoneTemplates.map((milestone, index) => <TemplateMilestonePreview key={`${index}-${milestone.title}`} milestone={milestone} index={index} />)}</ol> : <p>No starter milestones.</p>}<h3>Relative schedule</h3><TemplateSchedule tasks={template.taskTemplates} milestones={template.milestoneTemplates} /></section></div>;
}
