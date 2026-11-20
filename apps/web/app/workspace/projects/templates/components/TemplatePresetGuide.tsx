'use client';

import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
import type { TemplatePresetGuide as Guide } from '../presets/types';

const sections: { key: keyof Guide; title: Key; intro: Key }[] = [
  { key: 'preparation', title: 'tpl.g.preparation', intro: 'tpl.g.preparationIntro' },
  { key: 'qualityChecks', title: 'tpl.g.quality', intro: 'tpl.g.qualityIntro' },
  { key: 'riskSignals', title: 'tpl.g.risks', intro: 'tpl.g.risksIntro' },
  { key: 'handoff', title: 'tpl.g.handoff', intro: 'tpl.g.handoffIntro' },
];

export function TemplatePresetGuide({ guide }: { guide: Guide }) {
  const t = useT();
  return <details className="project-template-preset-guide"><summary>{t('tpl.g.open')} <span>{t('tpl.g.openSub')}</span></summary>{sections.map(({ key, title, intro }) => <section key={key} aria-labelledby={`preset-guide-${key}`}><div><h5 id={`preset-guide-${key}`}>{t(title)}</h5><p>{t(intro)}</p></div><ul>{guide[key].map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul></section>)}</details>;
}
