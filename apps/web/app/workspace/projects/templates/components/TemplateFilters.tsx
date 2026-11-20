'use client';

import { useT } from '../../../../i18n';
import type { TemplateScope, TemplateSort } from '../types';

export function TemplateFilters({ scope, sort, onScope, onSort }: { scope: TemplateScope; sort: TemplateSort; onScope: (value: TemplateScope) => void; onSort: (value: TemplateSort) => void }) {
  const t = useT();
  return <div className="project-template-filters"><label>{t('tpl.f.show')}<select value={scope} onChange={(event) => onScope(event.target.value as TemplateScope)}><option value="ALL">{t('tpl.f.all')}</option><option value="HAS_DEPENDENCIES">{t('tpl.f.deps')}</option><option value="HAS_SCHEDULE">{t('tpl.f.schedule')}</option><option value="HAS_MILESTONES">{t('tpl.f.milestones')}</option></select></label><label>{t('tpl.f.sort')}<select value={sort} onChange={(event) => onSort(event.target.value as TemplateSort)}><option value="UPDATED">{t('tpl.s.updated')}</option><option value="NAME">{t('tpl.s.name')}</option><option value="MOST_USED">{t('tpl.s.mostUsed')}</option><option value="RECENTLY_USED">{t('tpl.s.recentlyUsed')}</option></select></label></div>;
}
