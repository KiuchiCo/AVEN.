'use client';

import { useMemo, useState } from 'react';
import { searchTemplatePresets } from './search';
import { templatePresetCategories } from './categories';
import type { TemplatePreset } from './types';

export function usePresetSearch(presets: TemplatePreset[]) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const visible = useMemo(() => searchTemplatePresets(presets, query, category), [presets, query, category]);
  return { query, setQuery, category, setCategory, visible, categories: templatePresetCategories };
}
