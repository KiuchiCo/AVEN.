import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { SyncDocument, type Operation } from '@aven/collab';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { DocumentEvents } from './document-events.js';
import { textBlockIds, textOfBlock, withBlockTexts } from './text-blocks.js';

type Session = { doc: SyncDocument; dirty: boolean };
const maxParts = 1000, maxInsertedCharacters = 50_000, keepRevisions = 300, saveAfterMs = 800;
const blockIdPattern = /^[\w-]{1,64}$/;

/**
 * Live, keystroke-level editing of the text inside one block. While a document is open, the text of each block being edited is held
 * here as the authoritative copy; edits arrive written against some revision, are moved past anything accepted since, broadcast to
 * everyone with the document open, and written back to the saved document a moment later. Structure (adding, moving and removing
 * blocks) still goes through the normal save, which takes the live text from here so the two never disagree.
 * shortcut: in memory, so it works with one API process; with several, route a document's sessions to one instance or keep them in Redis.
 */
@Injectable()
export class TextSessions implements OnModuleDestroy {
  private readonly sessions = new Map<string, Map<string, Session>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly saving = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService, private readonly events: DocumentEvents) {
    events.onEmpty((documentId) => { void this.close(documentId); });
  }

  /** The block's current text and the revision to write edits against. */
  async text(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, blockId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const session = await this.session(workspaceId, documentId, this.blockId(blockId));
    return { text: session.doc.text, revision: session.doc.revision };
  }

  /** Accepts one edit. Answers with the edit as applied (it may have been moved past others) and the new revision. */
  async receive(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, blockId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const input = (body && typeof body === 'object' ? body : {}) as { revision?: unknown; operation?: unknown; clientId?: unknown };
    if (typeof input.revision !== 'number' || !Number.isInteger(input.revision) || input.revision < 0) throw new BadRequestException('revision must be a whole number.');
    const clientId = input.clientId === undefined || input.clientId === null ? null : typeof input.clientId === 'string' && /^[\w-]{1,64}$/.test(input.clientId) ? input.clientId : this.reject('clientId must be a short identifier.');
    const operation = this.operation(input.operation);
    const id = this.blockId(blockId);
    const session = await this.session(workspaceId, documentId, id);
    let result: { operation: Operation; revision: number };
    try { result = session.doc.receive(input.revision, operation); }
    catch (error) { throw new ConflictException({ message: error instanceof Error ? error.message : 'The edit could not be applied.', resync: true }); }
    session.dirty = true;
    if (result.revision - 1 > keepRevisions) session.doc.forgetBefore(result.revision - keepRevisions);
    const name = this.events.viewers(documentId).find((viewer) => viewer.id === userId)?.name ?? 'Someone';
    this.events.publish(documentId, { type: 'text', blockId: id, revision: result.revision, operation: result.operation, by: { id: userId, name }, clientId });
    this.scheduleSave(documentId);
    return result;
  }

  /** Puts the live text into a document that is about to be saved the normal way, and forgets sessions for blocks that are gone. */
  reconcile(documentId: string, content: string): string {
    const open = this.sessions.get(documentId);
    if (!open) return content;
    const ids = textBlockIds(content);
    if (!ids) return content;
    for (const blockId of [...open.keys()]) if (!ids.has(blockId)) open.delete(blockId);
    return withBlockTexts(content, new Map([...open].map(([blockId, session]) => [blockId, session.doc.text])));
  }

  /** Writes any live text to the saved document now, so a snapshot of the document includes everything typed so far. */
  async settle(documentId: string) { clearTimeout(this.timers.get(documentId)); this.timers.delete(documentId); await this.save(documentId); }

  /** Forgets live text for a document whose content was replaced wholesale (a restored version, a deletion). Open editors are told to reload when their next edit is refused. */
  drop(documentId: string) { clearTimeout(this.timers.get(documentId)); this.timers.delete(documentId); this.sessions.delete(documentId); }

  async onModuleDestroy() { for (const documentId of [...this.sessions.keys()]) await this.close(documentId); }

  private reject(message: string): never { throw new BadRequestException(message); }

  private blockId(value: string) { return blockIdPattern.test(value) ? value : this.reject('That is not a block id.'); }

  private operation(raw: unknown): Operation {
    if (!Array.isArray(raw) || raw.length > maxParts) throw new BadRequestException('operation must be a list of at most 1000 parts.');
    let inserted = 0;
    for (const part of raw) {
      if (typeof part === 'string') { inserted += part.length; if (!part) throw new BadRequestException('operation contains an empty insert.'); }
      else if (typeof part !== 'number' || !Number.isInteger(part) || part === 0) throw new BadRequestException('operation parts must be text or non-zero whole numbers.');
    }
    if (inserted > maxInsertedCharacters) throw new BadRequestException('operation inserts too much text at once.');
    return raw as Operation;
  }

  private async session(workspaceId: string, documentId: string, blockId: string): Promise<Session> {
    const existing = this.sessions.get(documentId)?.get(blockId);
    if (existing) return existing;
    const document = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { content: true } });
    if (!document) throw new NotFoundException('Document not found in this workspace.');
    const text = textOfBlock(document.content, blockId);
    if (text === null) throw new ConflictException({ message: 'Live editing needs a block-based document and a text block that still exists.', resync: true });
    const open = this.sessions.get(documentId) ?? new Map<string, Session>();
    this.sessions.set(documentId, open);
    const raced = open.get(blockId); // another request may have opened it while this one was reading
    if (raced) return raced;
    const created = { doc: new SyncDocument(text), dirty: false };
    open.set(blockId, created);
    return created;
  }

  private scheduleSave(documentId: string) {
    if (this.timers.has(documentId)) return; // one save per interval, however much is typed
    const timer = setTimeout(() => { this.timers.delete(documentId); void this.save(documentId); }, saveAfterMs);
    timer.unref?.();
    this.timers.set(documentId, timer);
  }

  /** Writes the live text of edited blocks into the saved document. Saves for one document run one after another. */
  private save(documentId: string): Promise<void> {
    const run = (this.saving.get(documentId) ?? Promise.resolve()).then(async () => {
      const open = this.sessions.get(documentId);
      if (!open) return;
      const edited = [...open].filter(([, session]) => session.dirty);
      if (!edited.length) return;
      edited.forEach(([, session]) => { session.dirty = false; });
      const texts = new Map(edited.map(([blockId, session]) => [blockId, session.doc.text]));
      try {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const current = await this.prisma.document.findUnique({ where: { id: documentId }, select: { content: true, updatedAt: true } });
          if (!current) return;
          const next = withBlockTexts(current.content, texts);
          if (next === current.content) return;
          const written = await this.prisma.document.updateMany({ where: { id: documentId, updatedAt: current.updatedAt }, data: { content: next } });
          if (written.count === 1) return;
        }
        throw new Error('The document kept changing while its live text was being saved.');
      } catch (error) {
        edited.forEach(([, session]) => { session.dirty = true; }); // try again with the next edit or when the document closes
        throw error;
      }
    }).catch(() => undefined);
    this.saving.set(documentId, run);
    return run;
  }

  private async close(documentId: string) {
    clearTimeout(this.timers.get(documentId)); this.timers.delete(documentId);
    await this.save(documentId);
    if (!this.events.isOpen(documentId)) this.sessions.delete(documentId);
  }
}
