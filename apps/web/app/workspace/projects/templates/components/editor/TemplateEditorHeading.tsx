'use client';

import { useT } from '../../../../../i18n';

export function TemplateEditorHeading({ onCancel, title, eyebrow }: { onCancel: () => void; title?: string; eyebrow?: string }) {
  const t = useT();
  return <div className="project-template-editor__heading"><div><p className="workspace-eyebrow">{eyebrow ?? t('tpl.ed.eyebrow')}</p><h3>{title ?? t('tpl.ed.title')}</h3></div><button type="button" onClick={onCancel}>{t('tpl.ed.cancel')}</button></div>;
}
