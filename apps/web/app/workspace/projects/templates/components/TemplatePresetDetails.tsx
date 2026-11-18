import { formatTemplateOffset } from '../offset-label';
import type { TemplatePreset } from '../presets/types';
import { TemplatePresetGuide } from './TemplatePresetGuide';
import { TemplatePresetQuality } from './TemplatePresetQuality';
import { TemplateTaskCoaching } from './TemplateTaskCoaching';

export function TemplatePresetDetails({ preset }: { preset: TemplatePreset }) {
  return <section className="project-template-preset-details" aria-label={`${preset.name} starter plan details`}><header><div><span>{preset.category}</span><h4>{preset.name}</h4></div><span>{preset.tasks.length} tasks · {preset.milestones.length} milestones</span></header><p>{preset.description}</p><ol>{preset.tasks.map((task, index) => <li key={`${preset.id}-${index}`}><div><strong>{task.title}</strong><small>{task.priority.toLowerCase()} · {formatTemplateOffset(task.daysFromToday)}{task.dependsOnIndexes.length ? ` · follows ${task.dependsOnIndexes.map((dependency) => dependency + 1).join(', ')}` : ''}</small></div>{task.description && <p>{task.description}</p>}<TemplateTaskCoaching presetId={preset.id} taskIndex={index} /></li>)}</ol><h5>Milestones</h5><ul>{preset.milestones.map((milestone, index) => <li key={`${preset.id}-milestone-${index}`}><span>{milestone.title}</span><small>{formatTemplateOffset(milestone.daysFromToday)}</small></li>)}</ul>{preset.operatingGuide && <TemplatePresetGuide guide={preset.operatingGuide} />}<TemplatePresetQuality presetId={preset.id} /></section>;
}
