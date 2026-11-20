'use client';

import { useT } from '../../../../i18n';
import { usePresetSearch } from '../presets/use-preset-search';
import type { TemplatePreset } from '../presets/types';
import { TemplatePresetDetails } from './TemplatePresetDetails';

export function TemplatePresetPicker({ presets, selectedId, onSelect, onLoad }: { presets: TemplatePreset[]; selectedId: string; onSelect: (id: string) => void; onLoad: () => void }) {
  const t = useT();
  const { query, setQuery, category, setCategory, visible, categories } = usePresetSearch(presets);
  const selected = presets.find((preset) => preset.id === selectedId) ?? null;
  return <div className="project-template-preset-picker"><div className="project-template-preset-picker__filters"><label>{t('tpl.pk.search')}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('tpl.pk.placeholder')} /></label><label>{t('tpl.pk.category')}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">{t('tpl.pk.allCategories')}</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><div className="project-template-preset-picker__select"><label>{t('tpl.pk.choose')}<select value={selectedId} onChange={(event) => onSelect(event.target.value)}><option value="">{t('tpl.pk.scratch')}</option>{visible.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><button type="button" disabled={!selected} onClick={onLoad}>{t('tpl.pk.load')}</button><span>{t('tpl.pk.available', { n: visible.length })}</span></div>{selected ? <TemplatePresetDetails preset={selected} /> : <p>{t('tpl.pk.blank')}</p>}</div>;
}
