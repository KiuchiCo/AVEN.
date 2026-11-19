/**
 * Knowledge items can reference each other with [[Another item's title]].
 * Links resolve by title (case-insensitive) when read, so there is nothing to keep in sync, but renaming an
 * item breaks links that used its old title.
 */
export function extractWikiLinks(content: string): string[] {
  const seen = new Map<string, string>();
  for (const match of content.matchAll(/\[\[([^\[\]\n]{1,200})\]\]/g)) {
    const title = match[1].trim().replace(/\s+/g, ' ');
    if (title && !seen.has(title.toLocaleLowerCase())) seen.set(title.toLocaleLowerCase(), title);
    if (seen.size >= 50) break;
  }
  return [...seen.values()];
}

/** Counts tags across items, most used first. Tags are already stored lower-case. */
export function tagCounts(rows: Array<{ tags: string[] }>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) for (const tag of new Set(row.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
