'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';

type TaskLabelsProps = {
  labels: string[];
  taskTitle?: string;
  disabled?: boolean;
  onSave?: (labels: string[]) => void;
  compact?: boolean;
};

export function TaskLabels({ labels, taskTitle, disabled = false, onSave, compact = false }: TaskLabelsProps) {
  const [value, setValue] = useState(labels.join(', '));
  const inputId = useId();
  useEffect(() => setValue(labels.join(', ')), [labels]);
  const normalized = value.split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean);
  const invalid = normalized.some((label) => label.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(label)) || new Set(normalized).size > 10;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invalid) onSave?.([...new Set(normalized)]);
  }

  return (
    <div className={`task-labels${compact ? ' task-labels--compact' : ''}`}>
      <div className="task-labels__items" aria-label={taskTitle ? `Labels for ${taskTitle}` : 'Task labels'}>
        {labels.length ? labels.map((label) => <Link key={label} className="task-label" href={`/workspace/tasks?label=${encodeURIComponent(label)}`} title={`Show tasks labelled ${label}`}>#{label}</Link>) : <span className="task-labels__empty">No labels</span>}
      </div>
      {onSave && <form className="task-labels__editor" onSubmit={submit}>
        <label className="visually-hidden" htmlFor={inputId}>Labels, comma separated{taskTitle ? ` for ${taskTitle}` : ''}</label>
        <input id={inputId} value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} placeholder="Add labels, comma separated" maxLength={330} />
        <button type="submit" disabled={disabled || invalid || value === labels.join(', ')}>Save</button>
        {invalid && <span className="task-labels__error" role="status">Use up to 10 labels, each 1–32 letters, numbers, underscores, or hyphens.</span>}
      </form>}
    </div>
  );
}

export function TaskLabelFilter({ labels, value, onChange }: { labels: string[]; value: string; onChange: (label: string) => void }) {
  return <label className="task-filter">Label<select aria-label="Filter tasks by label" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All labels</option>{labels.map((label) => <option key={label} value={label}>#{label}</option>)}</select></label>;
}
