'use client';

import { useState, type SyntheticEvent } from 'react';
import { useT } from '../../../../i18n';
import type { TemplateTaskCoaching as Coaching } from '../presets/task-coaching/types';
import { TaskWorksheet } from './TaskWorksheet';

export function TemplateTaskCoaching({ presetId, taskIndex }: { presetId: string; taskIndex: number }) {
  const t = useT();
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
      <summary>{t('tpl.co.summary')} <span>{t('tpl.co.sub')}</span></summary>
      {loading && <p role="status">{t('tpl.co.loading')}</p>}
      {coaching && <><ol>{coaching.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.guidance}</p></li>)}</ol><TaskWorksheet presetId={presetId} taskIndex={taskIndex} prompts={coaching.worksheet} readinessRubric={coaching.readinessRubric} /></>}
    </details>
  );
}
