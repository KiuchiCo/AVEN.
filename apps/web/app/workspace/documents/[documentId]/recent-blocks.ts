/** The blocks this person inserted most recently, newest first. Kept in the browser only; it never blocks the editor if storage is unavailable. */
const key = 'aven-recent-blocks';
export function readRecent(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown; return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 6) : []; } catch { return []; }
}
export function recordRecent(id: string) {
  try { window.localStorage.setItem(key, JSON.stringify([id, ...readRecent().filter((item) => item !== id)].slice(0, 6))); } catch { /* storage unavailable: recents are a convenience */ }
}
