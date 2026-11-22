/** What the browser tells the API when a script error or an unhandled promise rejection happens. Only the message, a short stack, the page path and the release: no page content, no user details, no query string. */
export type ClientErrorReport = { message: string; stack?: string; path: string; kind: 'error' | 'unhandledrejection'; release?: string };

const MAX_PER_PAGE = 5;
const noise = /^(script error\.?|resizeobserver loop|non-error promise rejection captured)/i;

export function buildClientReport(reason: unknown, kind: ClientErrorReport['kind'], path: string, release?: string): ClientErrorReport | null {
  const error = reason instanceof Error ? reason : null;
  const message = (error?.message ?? (typeof reason === 'string' ? reason : '')).trim().slice(0, 500);
  if (!message || noise.test(message)) return null; // cross-origin and browser-internal notices carry nothing to act on
  return { message, stack: error?.stack?.slice(0, 4000), path: path.split(/[?#]/)[0].slice(0, 300), kind, release };
}

/** Sends reports, at most a few per page and never the same one twice, so a render loop cannot flood the API. */
export function createReporter(endpoint: string | undefined, send: (url: string, body: string) => void, release?: string) {
  const seen = new Set<string>(); let count = 0;
  return (reason: unknown, kind: ClientErrorReport['kind'], path: string) => {
    if (!endpoint || count >= MAX_PER_PAGE) return false;
    const report = buildClientReport(reason, kind, path, release);
    if (!report || seen.has(report.message)) return false;
    seen.add(report.message); count += 1;
    try { send(endpoint, JSON.stringify(report)); } catch { /* reporting must never cause an error of its own */ }
    return true;
  };
}
