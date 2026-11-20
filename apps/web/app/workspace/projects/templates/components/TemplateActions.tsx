'use client';

import { useT } from '../../../../i18n';
import { downloadProjectTemplate } from '../transfer';
import type { ProjectTemplate } from '../types';

export function TemplateActions({ template, busy, onDuplicate, onDelete }: { template: ProjectTemplate; busy: boolean; onDuplicate: () => void; onDelete: () => void }) {
  const t = useT();
  return <div className="project-template-card__actions"><button type="button" disabled={busy} onClick={() => downloadProjectTemplate(template)}>{t('tpl.export')}</button><button type="button" disabled={busy} onClick={onDuplicate}>{t('tpl.duplicate')}</button><button type="button" disabled={busy} onClick={onDelete}>{t('tpl.delete')}</button></div>;
}
