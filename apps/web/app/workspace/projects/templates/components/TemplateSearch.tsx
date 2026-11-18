import type { ChangeEvent } from 'react';

export function TemplateSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="project-template-search"><span>Search templates</span><input type="search" value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} placeholder="Name, task, label, milestone…" /></label>;
}
