'use client';

import { useT } from '../../../../i18n';
import { formatTemplateOffset } from '../offset-label';
import type { Key } from '../../../../i18n/en';
import type { TemplatePreset } from '../presets/types';
import { TemplatePresetGuide } from './TemplatePresetGuide';
import { TemplatePresetQuality } from './TemplatePresetQuality';
import { TemplateTaskCoaching } from './TemplateTaskCoaching';

export function TemplatePresetDetails({ preset }: { preset: TemplatePreset }) {
  const t = useT();
  return <section className="project-template-preset-details" aria-label={t('tpl.pr.aria', { name: preset.name })}><header><div><span>{preset.category}</span><h4>{preset.name}</h4></div><span>{t('tpl.pr.counts', { tasks: preset.tasks.length, milestones: preset.milestones.length })}</span></header><p>{preset.description}</p><ol>{preset.tasks.map((task, index) => <li key={`${preset.id}-${index}`}><div><strong>{task.title}</strong><small>{t(`prio.${task.priority.toLowerCase()}` as Key)} · {formatTemplateOffset(task.daysFromToday, t)}{task.dependsOnIndexes.length ? t('tpl.pr.follows', { list: task.dependsOnIndexes.map((dependency) => dependency + 1).join(', ') }) : ''}</small></div>{task.description && <p>{task.description}</p>}<TemplateTaskCoaching presetId={preset.id} taskIndex={index} /></li>)}</ol><h5>{t('tpl.milestones')}</h5><ul>{preset.milestones.map((milestone, index) => <li key={`${preset.id}-milestone-${index}`}><span>{milestone.title}</span><small>{formatTemplateOffset(milestone.daysFromToday, t)}</small></li>)}</ul>{preset.operatingGuide && <TemplatePresetGuide guide={preset.operatingGuide} />}<TemplatePresetQuality presetId={preset.id} /></section>;
}
