'use client';

import { useT } from '../../../../i18n';

export function TemplateCompareCheckbox({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  const t = useT();
  return <label className="project-template-compare-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /><span>{t('tpl.compare')}</span></label>;
}
