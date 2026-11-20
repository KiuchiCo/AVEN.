'use client';

import { useT } from '../../../../i18n';

export function TemplateFavoriteButton({ favorite, onToggle }: { favorite: boolean; onToggle: () => void }) {
  const t = useT();
  return <button type="button" className="project-template-favorite" aria-pressed={favorite} aria-label={favorite ? t('tpl.fav.remove') : t('tpl.fav.add')} onClick={onToggle}>{favorite ? '★' : '☆'}<span>{favorite ? t('tpl.fav.saved') : t('tpl.fav.label')}</span></button>;
}
