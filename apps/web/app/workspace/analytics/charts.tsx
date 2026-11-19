type Daily = { date: string; created: number; completed: number };

const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const label = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));

/** Created and completed tasks per day, side by side. A text table below carries the same numbers for screen readers. */
export function ActivityChart({ daily }: { daily: Daily[] }) {
  const max = Math.max(1, ...daily.map((day) => Math.max(day.created, day.completed)));
  const width = 720; const height = 200; const pad = 24; const slot = (width - pad * 2) / daily.length; const bar = Math.max(2, Math.min(14, slot / 2 - 1));
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const every = Math.ceil(daily.length / 8);
  return <figure className="analytics-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tasks created and completed each day">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="analytics-axis" />
      {[0.5, 1].map((fraction) => <g key={fraction}><line x1={pad} x2={width - pad} y1={y(max * fraction)} y2={y(max * fraction)} className="analytics-grid" /><text x={2} y={y(max * fraction) + 4} className="analytics-tick">{Math.round(max * fraction)}</text></g>)}
      {daily.map((day, index) => { const x = pad + index * slot + slot / 2; return <g key={day.date}>
        <rect x={x - bar - 1} width={bar} y={y(day.created)} height={height - pad - y(day.created)} className="analytics-bar analytics-bar--created"><title>{label(day.date)}: {day.created} created</title></rect>
        <rect x={x + 1} width={bar} y={y(day.completed)} height={height - pad - y(day.completed)} className="analytics-bar analytics-bar--completed"><title>{label(day.date)}: {day.completed} completed</title></rect>
        {index % every === 0 && <text x={x} y={height - 6} textAnchor="middle" className="analytics-tick">{label(day.date)}</text>}
      </g>; })}
    </svg>
    <figcaption><span className="analytics-key analytics-key--created">Created</span><span className="analytics-key analytics-key--completed">Completed</span></figcaption>
    <details><summary>Show as a table</summary><table className="analytics-table"><thead><tr><th>Day</th><th>Created</th><th>Completed</th></tr></thead><tbody>{daily.map((day) => <tr key={day.date}><td>{label(day.date)}</td><td>{day.created}</td><td>{day.completed}</td></tr>)}</tbody></table></details>
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
  const max = Math.max(1, ...values); const width = 320; const height = 70;
  const points = values.map((value, index) => `${values.length > 1 ? (index / (values.length - 1)) * width : 0},${height - 6 - (value / max) * (height - 12)}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="analytics-spark" role="img" aria-label={`AI credits used each day, up to ${max} a day`}><polyline points={points} fill="none" className="analytics-line" /><title>{labels[0]} to {labels[labels.length - 1]}</title></svg>;
}
