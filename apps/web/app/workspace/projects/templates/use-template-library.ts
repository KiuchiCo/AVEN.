'use client';

import { useMemo, useState } from 'react';
import { filterProjectTemplates } from './filter';
import { searchProjectTemplates } from './search';
import { sortProjectTemplates } from './sort';
import type { ProjectTemplate, TemplateScope, TemplateSort } from './types';

export function useTemplateLibrary(templates: ProjectTemplate[]) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<TemplateScope>('ALL');
  const [sort, setSort] = useState<TemplateSort>('UPDATED');
  const results = useMemo(() => sortProjectTemplates(filterProjectTemplates(searchProjectTemplates(templates, query), scope), sort), [templates, query, scope, sort]);
  return { query, setQuery, scope, setScope, sort, setSort, results };
}
