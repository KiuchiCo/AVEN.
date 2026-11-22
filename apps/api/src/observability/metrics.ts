type Labels = Record<string, string>;
const BUCKETS = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const MAX_SERIES = 2000; // a runaway label can never grow memory without bound

const keyOf = (labels?: Labels) => (labels ? Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${v.replace(/[\\"\n]/g, '_').slice(0, 80)}"`).join(',') : '');

/** Counters, gauges and latency histograms in memory, rendered in the Prometheus text format. Labels must be few and fixed (a route pattern, a status class), never ids or addresses. */
export class Metrics {
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly gauges = new Map<string, Map<string, number>>();
  private readonly histograms = new Map<string, Map<string, { buckets: number[]; sum: number; count: number }>>();
  private readonly help = new Map<string, string>();

  describe(name: string, text: string) { this.help.set(name, text); }

  inc(name: string, labels?: Labels, by = 1) {
    const series = this.counters.get(name) ?? new Map<string, number>(); this.counters.set(name, series);
    const key = keyOf(labels);
    if (!series.has(key) && series.size >= MAX_SERIES) return;
    series.set(key, (series.get(key) ?? 0) + by);
  }

  set(name: string, value: number, labels?: Labels) {
    const series = this.gauges.get(name) ?? new Map<string, number>(); this.gauges.set(name, series);
    const key = keyOf(labels);
    if (!series.has(key) && series.size >= MAX_SERIES) return;
    series.set(key, value);
  }

  observe(name: string, seconds: number, labels?: Labels) {
    const series = this.histograms.get(name) ?? new Map(); this.histograms.set(name, series);
    const key = keyOf(labels);
    let entry = series.get(key);
    if (!entry) { if (series.size >= MAX_SERIES) return; entry = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }; series.set(key, entry); }
    BUCKETS.forEach((bound, index) => { if (seconds <= bound) entry.buckets[index] += 1; });
    entry.sum += seconds; entry.count += 1;
  }

  render(): string {
    const lines: string[] = [];
    const head = (name: string, type: string) => { const text = this.help.get(name); if (text) lines.push(`# HELP ${name} ${text}`); lines.push(`# TYPE ${name} ${type}`); };
    const wrap = (key: string) => (key ? `{${key}}` : '');
    for (const [name, series] of this.counters) { head(name, 'counter'); for (const [key, value] of series) lines.push(`${name}${wrap(key)} ${value}`); }
    for (const [name, series] of this.gauges) { head(name, 'gauge'); for (const [key, value] of series) lines.push(`${name}${wrap(key)} ${value}`); }
    for (const [name, series] of this.histograms) {
      head(name, 'histogram');
      for (const [key, entry] of series) {
        const join = (extra: string) => `{${[key, extra].filter(Boolean).join(',')}}`;
        BUCKETS.forEach((bound, index) => lines.push(`${name}_bucket${join(`le="${bound}"`)} ${entry.buckets[index]}`));
        lines.push(`${name}_bucket${join('le="+Inf"')} ${entry.count}`, `${name}_sum${wrap(key)} ${entry.sum}`, `${name}_count${wrap(key)} ${entry.count}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  reset() { this.counters.clear(); this.gauges.clear(); this.histograms.clear(); }
}

export const metrics = new Metrics();
metrics.describe('http_requests_total', 'Requests by method, route pattern and status class.');
metrics.describe('http_request_duration_seconds', 'Request duration by method and route pattern.');
metrics.describe('db_query_duration_seconds', 'Database query duration.');
metrics.describe('db_connection_failures_total', 'Readiness checks that could not reach the database.');
metrics.describe('auth_failures_total', 'Requests refused because the sign-in token was missing or invalid.');
metrics.describe('rate_limit_rejections_total', 'Requests refused by a rate limit.');
metrics.describe('rate_limit_store_failures_total', 'Times the shared rate-limit store could not be used.');
metrics.describe('background_job_failures_total', 'Background job runs that failed, by job.');
metrics.describe('integration_failures_total', 'Calls to outside services that failed, by integration.');
metrics.describe('file_upload_failures_total', 'Uploads that were refused or failed.');
metrics.describe('ai_request_failures_total', 'AI answers that ended in an error.');
metrics.describe('client_errors_total', 'Errors reported by browsers.');
metrics.describe('error_reports_total', 'Errors passed to the error tracker, and ones dropped.');
