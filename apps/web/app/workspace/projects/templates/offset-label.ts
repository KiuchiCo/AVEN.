import type { Key } from '../../../i18n/en';

type Translate = (key: Key, values?: Record<string, string | number>) => string;

export function formatTemplateOffset(offset: number | null, t: Translate) {
  if (offset === null) return t('tpl.off.none');
  if (offset === 0) return t('tpl.off.today');
  const n = Math.abs(offset);
  return t(`tpl.off.${offset < 0 ? 'before' : 'after'}${n === 1 ? 'One' : 'Many'}`, { n });
}
