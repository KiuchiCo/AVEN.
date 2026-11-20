'use client';

import { useT } from '../../../../i18n';

export function TemplateLabels({ labels }: { labels: string[] }) {
  const t = useT();
  return labels.length ? <ul className="project-template-labels" aria-label={t('tpl.labelsAria')}>{labels.map((label) => <li key={label}>#{label}</li>)}</ul> : null;
}
