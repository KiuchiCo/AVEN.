type Block = { type?: string; text?: string; rows?: unknown };

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
        return typeof block.text === 'string' ? block.text : '';
      }).filter(Boolean).join(' ');
    }
  } catch { /* Older documents store plain text. */ }
  return value;
}
