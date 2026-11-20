type DocBlock = { id: string; type?: string; text?: string; [key: string]: unknown };
type Parsed = { format: string; blocks: DocBlock[]; [key: string]: unknown };

/** Blocks with no text of their own: they are never edited as a live text session. */
const textless = new Set(['DIVIDER', 'TABLE', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'BOOKMARK', 'PAGE_LINK', 'DATABASE', 'DATABASE_LINK', 'TOC', 'BREADCRUMB', 'BUTTON']);
export const isTextBlock = (block: DocBlock) => typeof block.id === 'string' && typeof block.type === 'string' && !textless.has(block.type) && typeof block.text === 'string';

function parse(content: string): Parsed | null {
  try {
    const value = JSON.parse(content) as Parsed;
    return value && value.format === 'aven-doc-v1' && Array.isArray(value.blocks) ? value : null;
  } catch { return null; }
}

/** The text of one block, or null when the document isn't block-based or has no such text block. */
export function textOfBlock(content: string, blockId: string): string | null {
  const block = parse(content)?.blocks.find((candidate) => candidate.id === blockId);
  return block && isTextBlock(block) ? (block.text as string) : null;
}

/** The ids of the text blocks in a document (null when it isn't block-based). */
export function textBlockIds(content: string): Set<string> | null {
  const parsed = parse(content);
  return parsed ? new Set(parsed.blocks.filter(isTextBlock).map((block) => block.id)) : null;
}

/** The document with the given text written into the blocks it names. Blocks that are gone or have no text are skipped. Returns the same string when nothing changes. */
export function withBlockTexts(content: string, texts: ReadonlyMap<string, string>): string {
  const parsed = parse(content);
  if (!parsed) return content;
  let changed = false;
  const blocks = parsed.blocks.map((block) => {
    const text = texts.get(block.id);
    if (text === undefined || !isTextBlock(block) || block.text === text) return block;
    changed = true; return { ...block, text };
  });
  return changed ? JSON.stringify({ ...parsed, blocks }) : content;
}
