import type { TemplateTask } from '../../types';

export function TemplateDependencyPicker({ tasks, onChange }: { tasks: TemplateTask[]; onChange: (index: number, dependencies: number[]) => void }) {
  return <fieldset className="project-template-dependency-picker"><legend>Task prerequisites</legend>{tasks.map((task, index) => <label key={index}><span>{task.title || `Task ${index + 1}`}</span><select aria-label={`Prerequisites for ${task.title || `task ${index + 1}`}`} multiple size={Math.min(4, Math.max(2, tasks.length - 1))} value={task.dependsOnIndexes.map(String)} onChange={(event) => onChange(index, [...event.currentTarget.selectedOptions].map((option) => Number(option.value)))}>{tasks.map((candidate, candidateIndex) => candidateIndex !== index && <option key={candidateIndex} value={candidateIndex}>{candidate.title || `Task ${candidateIndex + 1}`}</option>)}</select></label>)}<small>Select tasks that must finish before each task can begin.</small></fieldset>;
}
