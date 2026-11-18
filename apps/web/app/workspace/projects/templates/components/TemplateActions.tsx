'use client';

import { downloadProjectTemplate } from '../transfer';
import type { ProjectTemplate } from '../types';

export function TemplateActions({ template, busy, onDuplicate, onDelete }: { template: ProjectTemplate; busy: boolean; onDuplicate: () => void; onDelete: () => void }) {
  return <div className="project-template-card__actions"><button type="button" disabled={busy} onClick={() => downloadProjectTemplate(template)}>Export JSON</button><button type="button" disabled={busy} onClick={onDuplicate}>Duplicate</button><button type="button" disabled={busy} onClick={onDelete}>Delete</button></div>;
}
