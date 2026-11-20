import { useT } from '../../i18n';

type Daily = { date: string; created: number; completed: number };

const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const label = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));

/** Created and completed tasks per day, side by side. A text table below carries the same numbers for screen readers. */
export function ActivityChart({ daily }: { daily: Daily[] }) {
  const t = useT();
  const max = Math.max(1, ...daily.map((day) => Math.max(day.created, day.completed)));
  const width = 720; const height = 200; const pad = 24; const slot = (width - pad * 2) / daily.length; const bar = Math.max(2, Math.min(14, slot / 2 - 1));
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const every = Math.ceil(daily.length / 8);
  return <figure className="analytics-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('an.chartAria')}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="analytics-axis" />
      {[0.5, 1].map((fraction) => <g key={fraction}><line x1={pad} x2={width - pad} y1={y(max * fraction)} y2={y(max * fraction)} className="analytics-grid" /><text x={2} y={y(max * fraction) + 4} className="analytics-tick">{Math.round(max * fraction)}</text></g>)}
      {daily.map((day, index) => { const x = pad + index * slot + slot / 2; return <g key={day.date}>
        <rect x={x - bar - 1} width={bar} y={y(day.created)} height={height - pad - y(day.created)} className="analytics-bar analytics-bar--created"><title>{t('an.createdOn', { date: label(day.date), n: day.created })}</title></rect>
        <rect x={x + 1} width={bar} y={y(day.completed)} height={height - pad - y(day.completed)} className="analytics-bar analytics-bar--completed"><title>{t('an.completedOn', { date: label(day.date), n: day.completed })}</title></rect>
        {index % every === 0 && <text x={x} y={height - 6} textAnchor="middle" className="analytics-tick">{label(day.date)}</text>}
      </g>; })}
    </svg>
    <figcaption><span className="analytics-key analytics-key--created">{t('an.created')}</span><span className="analytics-key analytics-key--completed">{t('an.completed')}</span></figcaption>
    <details><summary>{t('an.showTable')}</summary><table className="analytics-table"><thead><tr><th>{t('an.day')}</th><th>{t('an.created')}</th><th>{t('an.completed')}</th></tr></thead><tbody>{daily.map((day) => <tr key={day.date}><td>{label(day.date)}</td><td>{day.created}</td><td>{day.completed}</td></tr>)}</tbody></table></details>
  </figure>;
}

/** A labelled horizontal bar per row, scaled to the biggest. */
export function HorizontalBars({ rows, empty }: { rows: { label: string; value: number; note?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="analytics-empty">{empty}</p>;
  return <ul className="analytics-bars">{rows.map((row) => <li key={row.label}><span>{row.label}</span><div className="analytics-bars__track"><span style={{ width: `${(row.value / max) * 100}%` }} /></div><strong>{row.value}</strong>{row.note && <small>{row.note}</small>}</li>)}</ul>;
}

/** A small line of daily values, used for AI credits. */
export function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const t = useT();
  const max = Math.max(1, ...values); const width = 320; const height = 70;
  const points = values.map((value, index) => `${values.length > 1 ? (index / (values.length - 1)) * width : 0},${height - 6 - (value / max) * (height - 12)}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="analytics-spark" role="img" aria-label={t('an.sparkAria', { n: max })}><polyline points={points} fill="none" className="analytics-line" /><title>{labels[0]} to {labels[labels.length - 1]}</title></svg>;
}

/** Two smooth lines (completed and created per day) with a soft area under the completed one. */
export function VelocityChart({ daily }: { daily: Daily[] }) {
  const t = useT();
  const width = 520; const height = 220; const left = 34; const bottom = 28; const top = 12; const right = 12;
  const max = Math.max(4, ...daily.map((day) => Math.max(day.created, day.completed)));
  const ceiling = Math.ceil(max / 4) * 4;
  const x = (index: number) => left + (daily.length > 1 ? (index / (daily.length - 1)) * (width - left - right) : 0);
  const y = (value: number) => height - bottom - (value / ceiling) * (height - bottom - top);
  const smooth = (values: number[]) => values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const completed = daily.map((day) => day.completed); const created = daily.map((day) => day.created);
  const every = Math.max(1, Math.ceil(daily.length / 5));
  return <figure className="analytics-chart analytics-velocity">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('an.chartAria')}>
      {[0, 1, 2, 3, 4].map((step) => <g key={step}><line x1={left} x2={width - right} y1={y((ceiling / 4) * step)} y2={y((ceiling / 4) * step)} className="analytics-grid" /><text x={left - 8} y={y((ceiling / 4) * step) + 4} textAnchor="end" className="analytics-tick">{Math.round((ceiling / 4) * step)}</text></g>)}
      {daily.length > 1 && <path d={`${smooth(completed)} L${x(daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="analytics-area" />}
      <path d={smooth(created)} className="analytics-line analytics-line--created" fill="none" /><path d={smooth(completed)} className="analytics-line analytics-line--completed" fill="none" />
      {daily.map((day, index) => index % every === 0 && <text key={day.date} x={x(index)} y={height - 8} textAnchor="middle" className="analytics-tick">{label(day.date)}</text>)}
    </svg>
    <figcaption><span className="analytics-key analytics-key--completed">{t('an.completed')}</span><span className="analytics-key analytics-key--created">{t('an.created')}</span></figcaption>
  </figure>;
}

/** A ring split into coloured arcs, with the share of the first slice in the middle. */
export function Donut({ slices, centre, caption }: { slices: { value: number; className: string }[]; centre: string; caption: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 54; const circumference = 2 * Math.PI * radius; let offset = 0;
  return <div className="analytics-donut"><svg viewBox="0 0 140 140" role="img" aria-label={`${centre} ${caption}`}><circle cx="70" cy="70" r={radius} className="analytics-donut__base" />{total > 0 && slices.map((slice, index) => { const length = (slice.value / total) * circumference; const arc = <circle key={index} cx="70" cy="70" r={radius} className={slice.className} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />; offset += length; return arc; })}<text x="70" y="68" textAnchor="middle" className="analytics-donut__centre">{centre}</text><text x="70" y="88" textAnchor="middle" className="analytics-donut__caption">{caption}</text></svg></div>;
}
