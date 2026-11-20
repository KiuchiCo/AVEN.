'use client';

import { useRef } from 'react';
import { useT } from '../../../../i18n';
import { useTemplateFile } from '../use-template-file';
import type { ProjectTemplateFile } from '../types';

export function TemplateImport({ busy, onImport }: { busy: boolean; onImport: (template: ProjectTemplateFile['template']) => Promise<void> }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const { file, error, read, clear, reportError } = useTemplateFile();
  async function submit() { if (!file) return; try { await onImport(file.template); clear(); if (input.current) input.current.value = ''; } catch (reason) { reportError(reason instanceof Error ? reason.message : t('tpl.imp.failed')); } }
  return <div className="project-template-import"><input ref={input} type="file" accept=".json,.aven-template.json,application/json" aria-label={t('tpl.imp.aria')} onChange={(event) => void read(event.target.files?.[0])} /><button type="button" disabled={busy || !file} onClick={() => void submit()}>{t('tpl.imp.btn')}</button>{error && <p role="alert">{error}</p>}{file && <p role="status">{t('tpl.imp.ready', { name: file.template.name, tasks: file.template.taskTemplates.length, milestones: file.template.milestoneTemplates.length })}</p>}</div>;
}
