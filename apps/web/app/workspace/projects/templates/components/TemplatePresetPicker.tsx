'use client';

import { usePresetSearch } from '../presets/use-preset-search';
import type { TemplatePreset } from '../presets/types';
import { TemplatePresetDetails } from './TemplatePresetDetails';

export function TemplatePresetPicker({ presets, selectedId, onSelect, onLoad }: { presets: TemplatePreset[]; selectedId: string; onSelect: (id: string) => void; onLoad: () => void }) {
  const { query, setQuery, category, setCategory, visible, categories } = usePresetSearch(presets);
  const selected = presets.find((preset) => preset.id === selectedId) ?? null;
  return <div className="project-template-preset-picker"><div className="project-template-preset-picker__filters"><label>Search starter plans<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try roadmap, research, launch…" /></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All categories</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><div className="project-template-preset-picker__select"><label>Choose a starter plan<select value={selectedId} onChange={(event) => onSelect(event.target.value)}><option value="">Start from scratch</option>{visible.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><button type="button" disabled={!selected} onClick={onLoad}>Load starter</button><span>{visible.length} plans available</span></div>{selected ? <TemplatePresetDetails preset={selected} /> : <p>Start blank, or search the library and choose a starter plan to inspect its tasks and schedule.</p>}</div>;
}
