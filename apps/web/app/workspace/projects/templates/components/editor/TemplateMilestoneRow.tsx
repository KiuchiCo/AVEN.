import { formatTemplateOffset } from '../../offset-label';
import type { TemplateMilestone } from '../../types';

export function TemplateMilestoneRow({ milestone, index, onEdit, onRemove }: { milestone: TemplateMilestone; index: number; onEdit: (milestone: TemplateMilestone) => void; onRemove: () => void }) {
  return <article className="project-template-editor-milestone"><label>Milestone {index + 1}<input required maxLength={160} value={milestone.title} onChange={(event) => onEdit({ ...milestone, title: event.target.value })} /></label><label>Days from template date<input type="number" min={-3650} max={3650} value={milestone.daysFromToday ?? ''} placeholder="No date" onChange={(event) => onEdit({ ...milestone, daysFromToday: event.target.value === '' ? null : Number(event.target.value) })} /><small>{formatTemplateOffset(milestone.daysFromToday)}</small></label><button type="button" onClick={onRemove}>Remove milestone</button></article>;
}
