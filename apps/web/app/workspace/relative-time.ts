/** The page's language (set on <html lang> by the language provider), so relative times read in it. */
const pageLanguage = () => (typeof document !== 'undefined' && document.documentElement.lang) || 'en';

/** "now", "5 min. ago", "yesterday", "3 days ago", then a short date — in the reader's language. */
export function ago(value: string | Date, now = Date.now(), language = pageLanguage()): string {
  const then = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  const minutes = Math.round((now - then) / 60_000);
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  if (minutes < 1) return relative.format(0, 'second');
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-days, 'day');
  return new Date(then).toLocaleDateString(language, { day: 'numeric', month: 'short' });
}

/** A due date relative to today: "today", "tomorrow", "yesterday", or a short date. Overdue is for the caller to say. */
export function dueDay(dueAt: string, today: Date, language = pageLanguage()): { label: string; overdue: boolean } {
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  const diff = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) / 86_400_000);
  const label = Math.abs(diff) <= 1 ? new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(diff, 'day') : due.toLocaleDateString(language, { day: 'numeric', month: 'short' });
  return { label: label.replace(/^./, (c) => c.toLocaleUpperCase(language)), overdue: diff < 0 };
}
