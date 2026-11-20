import { BadRequestException } from '@nestjs/common';

export const shareLimits = { activePerDocument: 10, expiryDays: [7, 30, 90] as const } as const;
export type PublicBlock = { type: string; text: string; checked?: boolean; rows?: string[][]; image?: string | null; body?: string; level?: number };

const blockTypes = new Set(['PARAGRAPH', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CODE', 'CALLOUT', 'TOGGLE', 'DIVIDER', 'TABLE', 'IMAGE']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Raw = { type?: unknown; text?: unknown; checked?: unknown; rows?: unknown; fileId?: unknown; body?: unknown; level?: unknown };

function blocksOf(content: string): Raw[] | null {
  try {
    const parsed = JSON.parse(content) as { format?: string; blocks?: unknown };
    if (parsed.format === 'aven-doc-v1' && Array.isArray(parsed.blocks)) return parsed.blocks.filter((block): block is Raw => Boolean(block) && typeof block === 'object').slice(0, 2000);
  } catch { /* A plain-text document. */ }
  return null;
}

/** Files that the document's image blocks point at. Only these may be served through a share link. */
export function imageFileIds(content: string): string[] {
  return [...new Set((blocksOf(content) ?? []).filter((block) => block.type === 'IMAGE' && typeof block.fileId === 'string' && uuid.test(block.fileId)).map((block) => (block.fileId as string).toLowerCase()))];
}

/**
 * What an outside reader gets: the document's text and structure, nothing else. Unknown block types and fields are
 * dropped, and an image becomes an address under this share link, never a file id someone could use elsewhere.
 */
export function publicBlocks(content: string, imageUrl: (fileId: string) => string): PublicBlock[] {
  const blocks = blocksOf(content);
  if (!blocks) return content.trim() ? [{ type: 'PARAGRAPH', text: content }] : [];
  return blocks.filter((block) => typeof block.type === 'string' && blockTypes.has(block.type)).map((block): PublicBlock => {
    const type = block.type as string; const text = typeof block.text === 'string' ? block.text.slice(0, 20_000) : '';
    if (type === 'TABLE') return { type, text: '', rows: (Array.isArray(block.rows) ? block.rows : []).slice(0, 30).map((row) => (Array.isArray(row) ? row.slice(0, 8).map((cell) => (typeof cell === 'string' ? cell.slice(0, 500) : '')) : [])) };
    if (type === 'IMAGE') return { type, text: text.slice(0, 300), image: typeof block.fileId === 'string' && uuid.test(block.fileId) ? imageUrl(block.fileId.toLowerCase()) : null };
    if (type === 'TOGGLE') return { type, text, body: typeof block.body === 'string' ? block.body.slice(0, 20_000) : '', level: typeof block.level === 'number' && block.level >= 0 && block.level <= 3 ? Math.floor(block.level) : 0 };
    return { type, text, ...(type === 'TODO' ? { checked: block.checked === true } : {}) };
  });
}

export function parseExpiry(value: unknown, now = Date.now()): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !(shareLimits.expiryDays as readonly number[]).includes(value)) throw new BadRequestException(`Choose ${shareLimits.expiryDays.join(', ')} days, or no expiry.`);
  return new Date(now + value * 86_400_000);
}

export type ShareState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export const shareState = (share: { revokedAt: Date | null; expiresAt: Date | null }, now = Date.now()): ShareState => (share.revokedAt ? 'REVOKED' : share.expiresAt && share.expiresAt.getTime() <= now ? 'EXPIRED' : 'ACTIVE');
