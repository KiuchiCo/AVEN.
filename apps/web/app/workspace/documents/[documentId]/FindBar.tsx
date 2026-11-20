'use client';

import { useEffect, useRef } from 'react';
import { useT } from '../../../i18n';

/** Find and replace for the open document. The matches themselves are highlighted inside the editor; this is only the small control bar. */
export function FindBar({ query, replace, count, current, readOnly, onQuery, onReplaceText, onStep, onReplace, onClose }: {
  query: string; replace: string; count: number; current: number; readOnly: boolean;
  onQuery: (value: string) => void; onReplaceText: (value: string) => void; onStep: (step: 1 | -1) => void; onReplace: (all: boolean) => void; onClose: () => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <div className="aven-find-bar" role="search" aria-label={t('ed.find')} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <input ref={input} type="search" value={query} placeholder={t('ed.findPh')} aria-label={t('ed.find')} onChange={(event) => onQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onStep(event.shiftKey ? -1 : 1); } }} />
    <span className="aven-find-bar__count" role="status">{query ? (count ? t('ed.findCount', { n: current + 1, total: count }) : t('ed.noMatches')) : ''}</span>
    <button type="button" onClick={() => onStep(-1)} disabled={!count} aria-label={t('ed.findPrev')} title={t('ed.findPrev')}>↑</button>
    <button type="button" onClick={() => onStep(1)} disabled={!count} aria-label={t('ed.findNext')} title={t('ed.findNext')}>↓</button>
    {!readOnly && <>
      <input type="text" value={replace} placeholder={t('ed.replaceWith')} aria-label={t('ed.replaceWith')} onChange={(event) => onReplaceText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onReplace(false); } }} />
      <button type="button" onClick={() => onReplace(false)} disabled={!count}>{t('ed.replaceOne')}</button>
      <button type="button" onClick={() => onReplace(true)} disabled={!count}>{t('ed.replaceAll')}</button>
    </>}
    <button type="button" onClick={onClose} aria-label={t('ed.close')}>×</button>
  </div>;
}
