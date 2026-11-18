'use client';

import { useState } from 'react';
import { useTemplateLibrary } from '../use-template-library';
import { TemplateSearch } from './TemplateSearch';
import { TemplateFilters } from './TemplateFilters';
import { TemplateCard } from './TemplateCard';
import { TemplatePreview } from './TemplatePreview';
import { TemplateImport } from './TemplateImport';
import type { ProjectTemplate, ProjectTemplateFile } from '../types';
import styles from './TemplateLibrary.module.css';

type Props = { templates: ProjectTemplate[]; busy: boolean; selectedId: string; onEdit: (value: ProjectTemplate) => void; onUse: (value: ProjectTemplate) => void; onDuplicate: (value: ProjectTemplate) => Promise<void>; onDelete: (value: ProjectTemplate) => void; onImport: (value: ProjectTemplateFile['template']) => Promise<void> };

export function TemplateLibrary({ templates, busy, selectedId, onEdit, onUse, onDuplicate, onDelete, onImport }: Props) {
  const { query, setQuery, scope, setScope, sort, setSort, results } = useTemplateLibrary(templates);
  const [preview, setPreview] = useState<ProjectTemplate | null>(null);
  return <section className="project-template-library" aria-labelledby="project-template-title"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">REPEATABLE WORKFLOWS</p><h2 id="project-template-title">Project templates</h2></div><span>{results.length} of {templates.length}</span></div><TemplateImport busy={busy} onImport={onImport} /><div className={`project-template-toolbar ${styles.toolbar}`}><TemplateSearch value={query} onChange={setQuery} /><TemplateFilters scope={scope} sort={sort} onScope={setScope} onSort={setSort} /></div>{results.length === 0 ? <p className="productivity-message">{templates.length ? 'No templates match these filters. Clear the search or choose another view.' : 'No templates yet. Save a project above and reuse its setup in this workspace.'}</p> : <div className={`project-template-grid ${styles.grid}`}>{results.map((template) => <TemplateCard key={template.id} template={template} selected={selectedId === template.id} busy={busy} onPreview={() => setPreview(template)} onEdit={() => onEdit(template)} onUse={() => onUse(template)} onDuplicate={() => onDuplicate(template)} onDelete={() => onDelete(template)} />)}</div>}<TemplatePreview template={preview} onClose={() => setPreview(null)} /></section>;
}
