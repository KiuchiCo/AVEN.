'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTemplateLibrary } from '../use-template-library';
import { TemplateSearch } from './TemplateSearch';
import { TemplateFilters } from './TemplateFilters';
import { TemplateCard } from './TemplateCard';
import { TemplatePreview } from './TemplatePreview';
import { TemplateImport } from './TemplateImport';
import type { ProjectTemplate, ProjectTemplateFile } from '../types';
import styles from './TemplateLibrary.module.css';
import { useTemplateFavorites } from '../use-template-favorites';
import { toggleComparedTemplate, TEMPLATE_COMPARE_LIMIT } from '../compare/selection';
import { TemplateComparison } from './TemplateComparison';

const TemplateComposer = dynamic(() => import('./TemplateComposer').then((module) => module.TemplateComposer), {
  ssr: false,
  loading: () => <p className="productivity-message" role="status">Opening the starter plan library…</p>,
});

type Props = { workspaceId: string; templates: ProjectTemplate[]; favoritesReady: boolean; busy: boolean; selectedId: string; onEdit: (value: ProjectTemplate) => void; onUse: (value: ProjectTemplate) => void; onDuplicate: (value: ProjectTemplate) => Promise<void>; onDelete: (value: ProjectTemplate) => void; onImport: (value: ProjectTemplateFile['template']) => Promise<void>; onCreate: (value: { name: string; description: string; taskTemplates: ProjectTemplate['taskTemplates']; milestoneTemplates: ProjectTemplate['milestoneTemplates'] }) => Promise<void> };

export function TemplateLibrary({ workspaceId, templates, favoritesReady, busy, selectedId, onEdit, onUse, onDuplicate, onDelete, onImport, onCreate }: Props) {
  const { query, setQuery, scope, setScope, sort, setSort, results } = useTemplateLibrary(templates);
  const favorites = useTemplateFavorites(workspaceId, templates.map((template) => template.id), favoritesReady);
  const [preview, setPreview] = useState<ProjectTemplate | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareError, setCompareError] = useState('');
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const visible = favoriteOnly ? results.filter((template) => favorites.isFavorite(template.id)) : results;
  const compareTemplates = templates.filter((template) => compareIds.includes(template.id));
  function toggleCompare(templateId: string) {
    const result = toggleComparedTemplate(compareIds, templateId);
    setCompareIds(result.ids); setCompareError(result.error);
  }
  return <section className="project-template-library" aria-labelledby="project-template-title"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">REPEATABLE WORKFLOWS</p><h2 id="project-template-title">Project templates</h2></div><div className="project-template-library__summary"><span>{visible.length} of {templates.length}</span><button type="button" onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? 'Close creator' : '+ New template'}</button></div></div><TemplateImport busy={busy} onImport={onImport} />{composerOpen && <TemplateComposer busy={busy} onCreate={onCreate} onClose={() => setComposerOpen(false)} />}<div className={`project-template-toolbar ${styles.toolbar}`}><TemplateSearch value={query} onChange={setQuery} /><TemplateFilters scope={scope} sort={sort} onScope={setScope} onSort={setSort} /><label className="project-template-favorites-filter"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> Favorites only</label></div>{compareError && <p className="productivity-error" role="status">{compareError}</p>}{compareIds.length > 0 && <div className="project-template-compare-bar"><span>{compareIds.length} of {TEMPLATE_COMPARE_LIMIT} templates selected</span><button type="button" disabled={compareIds.length < 2} onClick={() => setComparisonOpen(true)}>Compare selected</button><button type="button" onClick={() => { setCompareIds([]); setCompareError(''); }}>Clear selection</button></div>}{visible.length === 0 ? <p className="productivity-message">{favoriteOnly && templates.length ? 'No favorites match these filters. Star a template or turn off Favorites only.' : templates.length ? 'No templates match these filters. Clear the search or choose another view.' : 'No templates yet. Save a project above and reuse its setup in this workspace.'}</p> : <div className={`project-template-grid ${styles.grid}`}>{visible.map((template) => <TemplateCard key={template.id} template={template} selected={selectedId === template.id} busy={busy} favorite={favorites.isFavorite(template.id)} compared={compareIds.includes(template.id)} comparisonFull={compareIds.length >= TEMPLATE_COMPARE_LIMIT} onFavorite={() => favorites.toggle(template.id)} onCompare={() => toggleCompare(template.id)} onPreview={() => setPreview(template)} onEdit={() => onEdit(template)} onUse={() => onUse(template)} onDuplicate={() => onDuplicate(template)} onDelete={() => onDelete(template)} />)}</div>}<TemplatePreview template={preview} onClose={() => setPreview(null)} /><TemplateComparison templates={comparisonOpen ? compareTemplates : []} onClose={() => setComparisonOpen(false)} /></section>;
}
