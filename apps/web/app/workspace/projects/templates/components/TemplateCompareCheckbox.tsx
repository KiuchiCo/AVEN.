'use client';

export function TemplateCompareCheckbox({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  return <label className="project-template-compare-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /><span>Compare</span></label>;
}
