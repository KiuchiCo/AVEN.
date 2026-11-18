'use client';

import { useRef } from 'react';
import { useTemplateFile } from '../use-template-file';
import type { ProjectTemplateFile } from '../types';

export function TemplateImport({ busy, onImport }: { busy: boolean; onImport: (template: ProjectTemplateFile['template']) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const { file, error, read, clear, reportError } = useTemplateFile();
  async function submit() { if (!file) return; try { await onImport(file.template); clear(); if (input.current) input.current.value = ''; } catch (reason) { reportError(reason instanceof Error ? reason.message : 'Could not import this template.'); } }
  return <div className="project-template-import"><input ref={input} type="file" accept=".json,.aven-template.json,application/json" aria-label="Choose an AVEN template JSON file" onChange={(event) => void read(event.target.files?.[0])} /><button type="button" disabled={busy || !file} onClick={() => void submit()}>Import template</button>{error && <p role="alert">{error}</p>}{file && <p role="status">Ready to import “{file.template.name}” · {file.template.taskTemplates.length} tasks · {file.template.milestoneTemplates.length} milestones</p>}</div>;
}
