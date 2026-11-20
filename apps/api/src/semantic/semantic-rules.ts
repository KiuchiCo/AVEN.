import { createHash } from 'node:crypto';

export const chunkSize = 1200;
export const maxChunksPerItem = 8;

/** Splits text into overlapping pieces on sentence/space boundaries, so each embeds one idea. Text past the cap is not indexed (shortcut: first ~9,600 characters only). */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < maxChunksPerItem) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) { const cut = Math.max(clean.lastIndexOf('. ', end), clean.lastIndexOf(' ', end)); if (cut > start + chunkSize / 2) end = cut + 1; }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - 150, start + 1);
  }
  return chunks.filter(Boolean);
}

export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Best chunk per item, highest score first. Anything under `minScore` is too loosely related to show. */
export function rankChunks<T extends { entityType: string; entityId: string; vector: number[] }>(chunks: T[], query: number[], limit: number, minScore = 0.25) {
  const best = new Map<string, { chunk: T; score: number }>();
  for (const chunk of chunks) {
    const score = cosine(chunk.vector, query);
    const key = `${chunk.entityType}:${chunk.entityId}`;
    if (score >= minScore && score > (best.get(key)?.score ?? -1)) best.set(key, { chunk, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
