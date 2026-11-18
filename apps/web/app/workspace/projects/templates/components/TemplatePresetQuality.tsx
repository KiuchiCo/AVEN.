import { getTemplatePresetQualityPlaybook } from '../presets/quality-playbook';

const headings = {
  evidence: 'Evidence to keep',
  reviewQuestions: 'Questions for reviewers',
  riskSignals: 'Signals to watch',
  completionCriteria: 'Completion criteria',
} as const;

export function TemplatePresetQuality({ presetId }: { presetId: string }) {
  const playbook = getTemplatePresetQualityPlaybook(presetId);
  if (!playbook) return null;
  return <details className="project-template-preset-quality"><summary>Open the review playbook <span>Evidence · questions · risks · completion</span></summary>{(Object.keys(headings) as (keyof typeof headings)[]).map((key) => <section key={key} aria-labelledby={`preset-quality-${key}`}><h5 id={`preset-quality-${key}`}>{headings[key]}</h5><ul>{playbook[key].map((entry, index) => <li key={`${key}-${index}`}>{entry}</li>)}</ul></section>)}</details>;
}
