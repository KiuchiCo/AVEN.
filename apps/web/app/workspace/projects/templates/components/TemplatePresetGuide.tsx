import type { TemplatePresetGuide as Guide } from '../presets/types';

const sections: { key: keyof Guide; title: string; intro: string }[] = [
  { key: 'preparation', title: 'Before you begin', intro: 'Make sure people, access, and decisions are ready.' },
  { key: 'qualityChecks', title: 'Quality checks', intro: 'Review evidence and the result against the agreed bar.' },
  { key: 'riskSignals', title: 'Watch for these risks', intro: 'Raise these signals while there is still room to respond.' },
  { key: 'handoff', title: 'Handoff checklist', intro: 'Leave clear ownership and a route for follow-up.' },
];

export function TemplatePresetGuide({ guide }: { guide: Guide }) {
  return <details className="project-template-preset-guide"><summary>Open the full planning guide <span>Preparation · quality · risks · handoff</span></summary>{sections.map(({ key, title, intro }) => <section key={key} aria-labelledby={`preset-guide-${key}`}><div><h5 id={`preset-guide-${key}`}>{title}</h5><p>{intro}</p></div><ul>{guide[key].map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul></section>)}</details>;
}
