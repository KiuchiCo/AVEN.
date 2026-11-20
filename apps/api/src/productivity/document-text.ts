type Block = { type?: string; text?: string; rows?: unknown; body?: unknown; url?: unknown };

/**
 * The words in a document, for search and excerpts. Documents are stored as JSON blocks; older ones are plain text.
 * Table cells and image captions count as text, so they can be found too.
 */
export function documentPlainText(value: string): string {
  try {
    const parsed = JSON.parse(value) as { format?: string; blocks?: Block[] };
    if (parsed.format === 'aven-doc-v1' && Array.isArray(parsed.blocks)) {
      return parsed.blocks.map((block) => {
        if (block.type === 'TABLE' && Array.isArray(block.rows)) return (block.rows as unknown[]).map((row) => (Array.isArray(row) ? row.filter((cell) => typeof cell === 'string' && cell.trim()).join(' ') : '')).filter(Boolean).join(' ');
        const own = typeof block.text === 'string' ? block.text : '';
        // folded toggle content and bookmark titles are words in the document too, so search can find them
        return block.type === 'TOGGLE' && typeof block.body === 'string' ? `${own} ${block.body}`.trim() : own;
      }).filter(Boolean).join(' ');
    }
  } catch { /* Older documents store plain text. */ }
  return value;
}
