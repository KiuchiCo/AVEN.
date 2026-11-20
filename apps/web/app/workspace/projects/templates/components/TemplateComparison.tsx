'use client';

import { useEffect, useRef } from 'react';
import { useT } from '../../../../i18n';
import type { ProjectTemplate } from '../types';
import { templateDialogKeydown } from '../dialog-keyboard';
import { sharedLabels, unionLabels } from '../compare/labels';
import { TemplateMetricsTable } from './TemplateMetricsTable';
import { TemplateTaskComparison } from './TemplateTaskComparison';
import { TemplateMilestoneComparison } from './TemplateMilestoneComparison';

export function TemplateComparison({ templates, onClose }: { templates: ProjectTemplate[]; onClose: () => void }) {
  const t = useT();
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
  return <div className="project-template-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="project-template-comparison" role="dialog" aria-modal="true" aria-labelledby="template-comparison-title"><header><div><p className="workspace-eyebrow">{t('tpl.cmp.eyebrow')}</p><h2 id="template-comparison-title">{t('tpl.cmp.title', { n: templates.length })}</h2><p>{t('tpl.cmp.intro')}</p></div><button type="button" onClick={onClose}>{t('tpl.close')}</button></header><h3>{t('tpl.cmp.glance')}</h3><TemplateMetricsTable templates={templates} /><h3>{t('tpl.cmp.sequence')}</h3><TemplateTaskComparison templates={templates} /><h3>{t('tpl.milestones')}</h3><TemplateMilestoneComparison templates={templates} /><h3>{t('tpl.labels')}</h3><p>{common.length ? t('tpl.cmp.shared', { labels: common.map((label) => `#${label}`).join(' ') }) : t('tpl.cmp.noShared')}</p><p>{t('tpl.cmp.all', { labels: allLabels.length ? allLabels.map((label) => `#${label}`).join(' ') : t('tpl.cmp.noLabels') })}</p></section></div>;
}
