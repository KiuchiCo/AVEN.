'use client';

import type { ChangeEvent } from 'react';
import { useT } from '../../../../i18n';

export function TemplateSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  return <label className="project-template-search"><span>{t('tpl.search')}</span><input type="search" value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} placeholder={t('tpl.searchPh')} /></label>;
}
