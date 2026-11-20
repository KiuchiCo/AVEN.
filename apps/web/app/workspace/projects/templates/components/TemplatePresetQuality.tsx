'use client';

import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
import { getTemplatePresetQualityPlaybook } from '../presets/quality-playbook';

const headings: Record<'evidence' | 'reviewQuestions' | 'riskSignals' | 'completionCriteria', Key> = {
  evidence: 'tpl.q.evidence',
  reviewQuestions: 'tpl.q.questions',
  riskSignals: 'tpl.q.signals',
  completionCriteria: 'tpl.q.completion',
};

export function TemplatePresetQuality({ presetId }: { presetId: string }) {
  const t = useT();
  const playbook = getTemplatePresetQualityPlaybook(presetId);
  if (!playbook) return null;
  return <details className="project-template-preset-quality"><summary>{t('tpl.q.open')} <span>{t('tpl.q.openSub')}</span></summary>{(Object.keys(headings) as (keyof typeof headings)[]).map((key) => <section key={key} aria-labelledby={`preset-quality-${key}`}><h5 id={`preset-quality-${key}`}>{t(headings[key])}</h5><ul>{playbook[key].map((entry, index) => <li key={`${key}-${index}`}>{entry}</li>)}</ul></section>)}</details>;
}
