'use client';

import { useT } from '../../../i18n';
import { Avatar } from '../../ui';
import type { Workload } from '../project-model';

/** Open work per person as a bar, longest first. The same component serves the overview summary and the Team tab. */
export function WorkloadBars({ rows, compact }: { rows: Workload[]; compact?: boolean }) {
  const t = useT();
  const peak = Math.max(1, ...rows.map((row) => row.outstanding));
  if (rows.length === 0) return <p className="pw-muted">{t('pj.membersEmpty')}</p>;
  return <ul className={`pw-load${compact ? ' pw-load--compact' : ''}`}>{rows.map((row) => <li key={row.userId ?? 'none'}>
    <span className="pw-load__name">{row.userId ? <Avatar name={row.name} size={compact ? 24 : 30} /> : <span className="pw-load__blank" aria-hidden="true" />}<strong>{row.name}</strong></span>
    <span className="pw-load__bar" role="img" aria-label={t('pw.loadAria', { name: row.name, open: row.outstanding, done: row.completed })}><i className={row.userId === null ? 'is-none' : ''} style={{ width: `${row.outstanding ? Math.max(6, row.outstanding / peak * 100) : 0}%` }} /></span>
    <span className="pw-load__n"><b>{row.outstanding}</b> {t('pw.open')}{row.overdue > 0 && <em> · {row.overdue} {t('pj.overdue').toLocaleLowerCase()}</em>}</span>
  </li>)}</ul>;
}
