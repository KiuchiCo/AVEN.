'use client';

import { useT } from '../i18n';

export const pageSizes = [25, 50, 100, 200, 500] as const;
/** Most records the board, calendar, timeline and chart layouts load, because they draw from every record. Past it they say so and point at the Table. */
export const aggregateCap = 10_000;

export type PagingState = { total: number; loading: boolean; loaded: number; error: string; capped: boolean };

/** What the person needs to know about a long list of records: which ones they see, how many there are, where they are, and how to move. */
export function RecordPager({ mode, page, pageSize, state, onPage, onPageSize, onRetry }: { mode: 'pages' | 'all'; page: number; pageSize: number; state: PagingState; onPage: (page: number) => void; onPageSize: (size: number) => void; onRetry: () => void }) {
  const t = useT();
  const number = new Intl.NumberFormat();
  const pages = Math.max(1, Math.ceil(state.total / pageSize));
  const from = state.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(state.total, page * pageSize);
  if (state.error) return <div className="database-pager" role="alert"><span>{t('db.pager.error')}</span> <button type="button" onClick={onRetry}>{t('db.pager.retry')}</button></div>;
  if (mode === 'all') {
    return <div className="database-pager" aria-live="polite">
      {state.loading && state.loaded < Math.min(state.total, aggregateCap) ? <span role="status">{t('db.pager.loadingAll', { loaded: number.format(state.loaded), total: number.format(Math.min(state.total, aggregateCap)) })}</span>
        : state.capped ? <span role="status">{t('db.pager.capped', { n: number.format(aggregateCap), total: number.format(state.total) })}</span>
        : <span>{t('db.recordMany', { n: number.format(state.total) })}</span>}
    </div>;
  }
  return <nav className="database-pager" aria-label={t('db.pager.nav')}>
    <span role="status" aria-live="polite">{state.loading ? t('db.pager.loading') : state.total === 0 ? t('db.pager.none') : t('db.pager.showing', { from: number.format(from), to: number.format(to), total: number.format(state.total) })}</span>
    {state.total > pageSizes[0] && <label>{t('db.pager.size')} <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
    {/* One page needs no page controls: two disabled buttons only add noise. */}
    {(pages > 1 || page > 1) && <>
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1 || state.loading}>{t('db.pager.prev')}</button>
      <span>{t('db.pager.page', { page: number.format(page), pages: number.format(pages) })}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages || state.loading}>{t('db.pager.next')}</button>
    </>}
  </nav>;
}
