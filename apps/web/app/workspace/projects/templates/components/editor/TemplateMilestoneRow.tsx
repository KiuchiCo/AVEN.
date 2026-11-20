'use client';

import { useT } from '../../../../../i18n';
import { formatTemplateOffset } from '../../offset-label';
import type { TemplateMilestone } from '../../types';

export function TemplateMilestoneRow({ milestone, index, onEdit, onRemove }: { milestone: TemplateMilestone; index: number; onEdit: (milestone: TemplateMilestone) => void; onRemove: () => void }) {
  const t = useT();
  return <article className="project-template-editor-milestone"><label>{t('tpl.ed.milestoneN', { n: index + 1 })}<input required maxLength={160} value={milestone.title} onChange={(event) => onEdit({ ...milestone, title: event.target.value })} /></label><label>{t('tpl.ed.milestoneOffset')}<input type="number" min={-3650} max={3650} value={milestone.daysFromToday ?? ''} placeholder={t('tpl.ed.noDate')} onChange={(event) => onEdit({ ...milestone, daysFromToday: event.target.value === '' ? null : Number(event.target.value) })} /><small>{formatTemplateOffset(milestone.daysFromToday, t)}</small></label><button type="button" onClick={onRemove}>{t('tpl.ed.removeMilestone')}</button></article>;
}
