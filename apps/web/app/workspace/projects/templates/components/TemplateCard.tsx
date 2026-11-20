'use client';

import { useT } from '../../../../i18n';
import { TemplateStats } from './TemplateStats';
import { TemplateActions } from './TemplateActions';
import type { ProjectTemplate } from '../types';
import styles from './TemplateCard.module.css';
import { TemplateFavoriteButton } from './TemplateFavoriteButton';
import { TemplateCompareCheckbox } from './TemplateCompareCheckbox';

export function TemplateCard({ template, selected, busy, favorite, compared, comparisonFull, onFavorite, onCompare, onPreview, onEdit, onUse, onDuplicate, onDelete }: { template: ProjectTemplate; selected: boolean; busy: boolean; favorite: boolean; compared: boolean; comparisonFull: boolean; onFavorite: () => void; onCompare: () => void; onPreview: () => void; onEdit: () => void; onUse: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const t = useT();
  return <article className={`project-template-card ${styles.card}${selected ? ' project-template-card--selected' : ''}`}><div className="project-template-card__topline"><span className="workspace-eyebrow">{t('tpl.eyebrow')}</span><TemplateFavoriteButton favorite={favorite} onToggle={onFavorite} /></div><h3><button className={`project-template-card__title ${styles.title}`} type="button" onClick={onPreview}>{template.name}</button></h3><p>{template.description || t('tpl.defaultDesc')}</p><TemplateStats template={template} /><p className="project-template-card__usage">{t(template.useCount === 1 ? 'tpl.usedOne' : 'tpl.usedMany', { n: template.useCount })}{template.lastUsedAt ? t('tpl.lastUsed', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(template.lastUsedAt)) }) : ''}</p><footer><button type="button" disabled={busy} onClick={onEdit}>{t('tpl.edit')}</button><button type="button" disabled={busy} onClick={onUse}>{selected ? t('tpl.selected') : t('tpl.use')}</button><TemplateActions template={template} busy={busy} onDuplicate={onDuplicate} onDelete={onDelete} /><TemplateCompareCheckbox checked={compared} disabled={!compared && comparisonFull} onChange={onCompare} /></footer></article>;
}
