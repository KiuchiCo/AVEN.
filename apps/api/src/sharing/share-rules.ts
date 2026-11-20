import { BadRequestException } from '@nestjs/common';
import { parseBlocks, type SavedBlock } from '../export/document-model.js';
import { safeHref } from '../export/inline.js';

export const shareLimits = { activePerDocument: 10, expiryDays: [7, 30, 90] as const } as const;
export type PublicBlock = {
  type: string; text: string; checked?: boolean; rows?: string[][]; image?: string | null; level?: number; indent?: number; tab?: number;
  href?: string; tabs?: string[]; meta?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plainTypes = new Set(['PARAGRAPH', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CODE', 'CALLOUT', 'EQUATION', 'MERMAID', 'SYNCED', 'DIVIDER']);
/** Blocks that point at something private to the workspace. A reader sees that something is here, never what it is. */
const restrictedLabels: Record<string, string> = { PAGE_LINK: 'A linked page', FILE: 'An attached file', VIDEO: 'A video', AUDIO: 'An audio file', DATABASE: 'A database', DATABASE_LINK: 'A database view' };

/** Files that the document's image blocks point at. Only these may be served through a share link. */
export function imageFileIds(content: string): string[] {
  return [...new Set(parseBlocks(content).filter((block) => block.type === 'IMAGE' && typeof block.fileId === 'string' && uuid.test(block.fileId)).map((block) => (block.fileId as string).toLowerCase()))];
}

/** Databases the document embeds, so the owner's "show embedded databases" choice can be applied to exactly these. */
export function embeddedDatabaseIds(content: string): string[] {
  return [...new Set(parseBlocks(content).filter((block) => (block.type === 'DATABASE' || block.type === 'DATABASE_LINK') && typeof block.databaseId === 'string' && uuid.test(block.databaseId)).map((block) => (block.databaseId as string).toLowerCase()))];
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const clipRows = (rows: unknown): string[][] => (Array.isArray(rows) ? rows : []).slice(0, 200).map((row) => (Array.isArray(row) ? row.slice(0, 12).map((cell) => (typeof cell === 'string' ? cell.slice(0, 500) : '')) : []));

/**
 * What an outside reader gets: the document's text and structure, nothing else. Unknown block types and fields are dropped, anything private
 * becomes a "restricted" marker, and an image becomes an address under this share link, never a file id someone could use elsewhere.
 * `embeds` holds the rows of embedded databases the owner chose to show (null: none are shown).
 */
export function publicBlocks(content: string, imageUrl: (fileId: string) => string, embeds: Map<string, string[][]> | null = null): PublicBlock[] {
  const out: PublicBlock[] = [];
  for (const block of parseBlocks(content) as SavedBlock[]) {
    const type = typeof block.type === 'string' ? block.type : '';
    const layout = { ...(block.indent && block.indent > 0 ? { indent: Math.min(5, Math.floor(block.indent)) } : {}), ...(block.tab && block.tab > 0 ? { tab: Math.floor(block.tab) } : {}) };
    const text = clip(block.text, 20_000);
    if (plainTypes.has(type)) out.push({ type, text, ...(type === 'TODO' ? { checked: block.checked === true } : {}), ...layout });
    else if (type === 'TABLE') out.push({ type, text: '', rows: clipRows(block.rows), ...layout });
    else if (type === 'IMAGE') out.push({ type, text: text.slice(0, 300), image: typeof block.fileId === 'string' && uuid.test(block.fileId) ? imageUrl(block.fileId.toLowerCase()) : null, ...layout });
    else if (type === 'TOGGLE') out.push({ type, text, level: typeof block.level === 'number' && block.level >= 0 && block.level <= 3 ? Math.floor(block.level) : 0, ...layout });
    else if (type === 'TABS') out.push({ type, text: '', tabs: (Array.isArray(block.tabs) ? block.tabs : []).slice(0, 8).map((tab) => clip(tab?.title, 60)), ...layout });
    else if (type === 'MEETING') out.push({ type, text: text.slice(0, 300), meta: [clip(block.date, 40), clip(block.attendees, 400)].filter(Boolean).join(' · '), ...layout });
    else if (type === 'BOOKMARK') { const href = block.url ? safeHref(block.url) : null; out.push({ type, text: text.slice(0, 300) || href || '', ...(href ? { href } : {}), ...layout }); }
    else if (type === 'TOC') out.push({ type, text: '' });
    else if (type === 'DATABASE' || type === 'DATABASE_LINK') {
      const rows = embeds && typeof block.databaseId === 'string' ? embeds.get(block.databaseId.toLowerCase()) : undefined;
      out.push(rows ? { type: 'TABLE', text: '', rows, ...layout } : { type: 'RESTRICTED', text: restrictedLabels[type], ...layout });
    } else if (restrictedLabels[type]) out.push({ type: 'RESTRICTED', text: restrictedLabels[type], ...layout });
    // buttons, breadcrumbs and anything unknown are workspace controls, not content: they are left out
  }
  return out;
}

export function parseExpiry(value: unknown, now = Date.now()): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !(shareLimits.expiryDays as readonly number[]).includes(value)) throw new BadRequestException(`Choose ${shareLimits.expiryDays.join(', ')} days, or no expiry.`);
  return new Date(now + value * 86_400_000);
}

export type ShareOptions = { allowDownload: boolean; allowPrint: boolean; includeEmbeds: boolean };
/** The options a request may set. Anything not sent keeps its current (or default) value; only booleans are accepted. */
export function parseShareOptions(input: unknown, current: ShareOptions = { allowDownload: false, allowPrint: true, includeEmbeds: false }): ShareOptions {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const next = { ...current };
  for (const key of ['allowDownload', 'allowPrint', 'includeEmbeds'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') throw new BadRequestException(`${key} must be true or false.`);
    next[key] = body[key];
  }
  return next;
}

export type ShareState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export const shareState = (share: { revokedAt: Date | null; expiresAt: Date | null }, now = Date.now()): ShareState => (share.revokedAt ? 'REVOKED' : share.expiresAt && share.expiresAt.getTime() <= now ? 'EXPIRED' : 'ACTIVE');
