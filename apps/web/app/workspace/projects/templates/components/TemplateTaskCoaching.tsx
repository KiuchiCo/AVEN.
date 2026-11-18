'use client';

import { useState, type SyntheticEvent } from 'react';
import type { TemplateTaskCoaching as Coaching } from '../presets/task-coaching/types';

export function TemplateTaskCoaching({ presetId, taskIndex }: { presetId: string; taskIndex: number }) {
  const [coaching, setCoaching] = useState<Coaching | null>(null);
  const [loading, setLoading] = useState(false);

  function loadChecklist(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || coaching || loading) return;
    setLoading(true);
    void import('../presets/task-coaching').then(({ getTemplateTaskCoaching }) =>
      getTemplateTaskCoaching(presetId, taskIndex).then(setCoaching),
    ).finally(() => setLoading(false));
  }

  return (
    <details className="project-template-task-coaching" onToggle={loadChecklist}>
      <summary>Task execution checklist <span>8 reviewable steps</span></summary>
      {loading && <p role="status">Loading checklist…</p>}
      {coaching && <ol>{coaching.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.guidance}</p></li>)}</ol>}
    </details>
  );
}
