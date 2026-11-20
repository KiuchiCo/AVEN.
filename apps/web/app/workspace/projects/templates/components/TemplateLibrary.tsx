'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useT } from '../../../../i18n';
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

function TemplateComposerLoading() { const t = useT(); return <p className="productivity-message" role="status">{t('tpl.lib.opening')}</p>; }

const TemplateComposer = dynamic(() => import('./TemplateComposer').then((module) => module.TemplateComposer), {
  ssr: false,
  loading: () => <TemplateComposerLoading />,
});

type Props = { workspaceId: string; templates: ProjectTemplate[]; favoritesReady: boolean; busy: boolean; selectedId: string; onEdit: (value: ProjectTemplate) => void; onUse: (value: ProjectTemplate) => void; onDuplicate: (value: ProjectTemplate) => Promise<void>; onDelete: (value: ProjectTemplate) => void; onImport: (value: ProjectTemplateFile['template']) => Promise<void>; onCreate: (value: { name: string; description: string; taskTemplates: ProjectTemplate['taskTemplates']; milestoneTemplates: ProjectTemplate['milestoneTemplates'] }) => Promise<void> };

export function TemplateLibrary({ workspaceId, templates, favoritesReady, busy, selectedId, onEdit, onUse, onDuplicate, onDelete, onImport, onCreate }: Props) {
  const t = useT();
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
  return <section className="project-template-library" aria-labelledby="project-template-title"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('tpl.lib.eyebrow')}</p><h2 id="project-template-title">{t('tpl.lib.title')}</h2></div><div className="project-template-library__summary"><span>{t('tpl.lib.count', { n: visible.length, total: templates.length })}</span><button type="button" onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? t('tpl.lib.closeCreator') : t('tpl.lib.new')}</button></div></div><TemplateImport busy={busy} onImport={onImport} />{composerOpen && <TemplateComposer busy={busy} onCreate={onCreate} onClose={() => setComposerOpen(false)} />}<div className={`project-template-toolbar ${styles.toolbar}`}><TemplateSearch value={query} onChange={setQuery} /><TemplateFilters scope={scope} sort={sort} onScope={setScope} onSort={setSort} /><label className="project-template-favorites-filter"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> {t('tpl.lib.favOnly')}</label></div>{compareError && <p className="productivity-error" role="status">{compareError}</p>}{compareIds.length > 0 && <div className="project-template-compare-bar"><span>{t('tpl.lib.selectedCount', { n: compareIds.length, max: TEMPLATE_COMPARE_LIMIT })}</span><button type="button" disabled={compareIds.length < 2} onClick={() => setComparisonOpen(true)}>{t('tpl.lib.compareSelected')}</button><button type="button" onClick={() => { setCompareIds([]); setCompareError(''); }}>{t('tpl.lib.clearSel')}</button></div>}{visible.length === 0 ? <p className="productivity-message">{favoriteOnly && templates.length ? t('tpl.lib.emptyFav') : templates.length ? t('tpl.lib.emptyFilter') : t('tpl.lib.emptyNone')}</p> : <div className={`project-template-grid ${styles.grid}`}>{visible.map((template) => <TemplateCard key={template.id} template={template} selected={selectedId === template.id} busy={busy} favorite={favorites.isFavorite(template.id)} compared={compareIds.includes(template.id)} comparisonFull={compareIds.length >= TEMPLATE_COMPARE_LIMIT} onFavorite={() => favorites.toggle(template.id)} onCompare={() => toggleCompare(template.id)} onPreview={() => setPreview(template)} onEdit={() => onEdit(template)} onUse={() => onUse(template)} onDuplicate={() => onDuplicate(template)} onDelete={() => onDelete(template)} />)}</div>}<TemplatePreview template={preview} onClose={() => setPreview(null)} /><TemplateComparison templates={comparisonOpen ? compareTemplates : []} onClose={() => setComparisonOpen(false)} /></section>;
}
