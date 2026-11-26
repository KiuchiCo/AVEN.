import { useT } from '../../../../i18n';
export function TaskDetailLoading() {
  const t = useT();
  return <div className="workspace-section-page task-detail"><p className="workspace-eyebrow">{t('td.eyebrow')}</p><h1>{t('td.opening')}</h1><div className="task-detail__skeleton" aria-hidden="true"><span /><span /><span /></div></div>;
}
