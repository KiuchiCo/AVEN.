'use client';

import { useEffect, useRef } from 'react';
import type { ProjectTemplate } from '../types';
import { templateDialogKeydown } from '../dialog-keyboard';
import { sharedLabels, unionLabels } from '../compare/labels';
import { TemplateMetricsTable } from './TemplateMetricsTable';
import { TemplateTaskComparison } from './TemplateTaskComparison';
import { TemplateMilestoneComparison } from './TemplateMilestoneComparison';

export function TemplateComparison({ templates, onClose }: { templates: ProjectTemplate[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!templates.length) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) { if (dialogRef.current) templateDialogKeydown(event, dialogRef.current, onClose); }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [templates, onClose]);
  if (!templates.length) return null;
  const common = sharedLabels(templates);
  const allLabels = unionLabels(templates);
  return <div className="project-template-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="project-template-comparison" role="dialog" aria-modal="true" aria-labelledby="template-comparison-title"><header><div><p className="workspace-eyebrow">COMPARE WORKFLOWS</p><h2 id="template-comparison-title">Compare {templates.length} templates</h2><p>Review their scope, schedule, and task structure before choosing a starting point.</p></div><button type="button" onClick={onClose}>Close</button></header><h3>At a glance</h3><TemplateMetricsTable templates={templates} /><h3>Task sequence</h3><TemplateTaskComparison templates={templates} /><h3>Milestones</h3><TemplateMilestoneComparison templates={templates} /><h3>Labels</h3><p>{common.length ? `Shared labels: ${common.map((label) => `#${label}`).join(' ')}` : 'No labels are shared across every selected template.'}</p><p>Across all selections: {allLabels.length ? allLabels.map((label) => `#${label}`).join(' ') : 'no labels'}</p></section></div>;
}
