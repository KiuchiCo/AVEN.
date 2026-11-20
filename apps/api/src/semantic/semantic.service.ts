import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { documentPlainText } from '../productivity/document-text.js';
import { chunkText, hashText, rankChunks } from './semantic-rules.js';
import { EMBEDDINGS, type OptionalEmbeddings } from './tokens.js';

type Kind = 'DOCUMENT' | 'KNOWLEDGE';
/** How many changed items one request will embed; the rest are picked up by the next search, so a first search never hangs. */
const itemsPerSync = 20;
const chunksPerRequest = 64;

@Injectable()
export class SemanticService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService, @Inject(EMBEDDINGS) private readonly embeddings: OptionalEmbeddings) {}

  /** What the page needs to know: is it set up, is it allowed on this plan, and how much is indexed. Never throws for a missing key or plan. */
  async status(identity: AuthenticatedIdentity, workspaceId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const configured = Boolean(this.embeddings), entitled = await this.entitlements.hasFeature(workspaceId, 'aiAgents');
    if (!configured || !entitled) return { configured, entitled, total: 0, pending: 0 };
    const { items, stale } = await this.plan(workspaceId);
    return { configured, entitled, total: items.length, pending: stale.length };
  }

  async search(identity: AuthenticatedIdentity, workspaceId: string, rawQuery: unknown) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    if (typeof rawQuery !== 'string' || rawQuery.trim().length < 2 || rawQuery.trim().length > 200) throw new BadRequestException('Search must be between 2 and 200 characters.');
    await this.entitlements.assertFeature(workspaceId, 'aiAgents', 'Semantic search');
    if (!this.embeddings) throw new ServiceUnavailableException('Semantic search is awaiting an embeddings provider. Set EMBEDDINGS_API_KEY on the API.');
    const query = rawQuery.trim();
    const pending = await this.sync(workspaceId);
    const [queryVector] = await this.embeddings.embed([query]);
    const rows = await this.prisma.searchEmbedding.findMany({ where: { workspaceId, model: this.embeddings.model }, select: { entityType: true, entityId: true, vector: true, excerpt: true } });
    const ranked = rankChunks(rows, queryVector, 12);
    const ids = (kind: Kind) => ranked.filter((hit) => hit.chunk.entityType === kind).map((hit) => hit.chunk.entityId);
    const [documents, knowledge] = await Promise.all([
      this.prisma.document.findMany({ where: { workspaceId, id: { in: ids('DOCUMENT') } }, select: { id: true, title: true, updatedAt: true } }),
      this.prisma.knowledgeItem.findMany({ where: { workspaceId, archivedAt: null, id: { in: ids('KNOWLEDGE') } }, select: { id: true, title: true, updatedAt: true } }),
    ]);
    type Found = { id: string; title: string; updatedAt: Date; type: string; href: string };
    const byId = new Map<string, Found>([...documents.map((d): [string, Found] => [d.id, { ...d, type: 'Document', href: `/workspace/documents/${d.id}` }]), ...knowledge.map((k): [string, Found] => [k.id, { ...k, type: 'Knowledge', href: '/workspace/knowledge' }])]);
    const results = ranked.flatMap(({ chunk, score }) => {
      const item = byId.get(chunk.entityId);
      return item ? [{ id: item.id, type: item.type, title: item.title, detail: chunk.excerpt, href: item.href, updatedAt: item.updatedAt, score: Math.round(score * 100) / 100 }] : [];
    });
    return { query, results, pending };
  }

  /** Everything that should be indexed, and which of it is missing or older than the item itself. */
  private async plan(workspaceId: string) {
    const [documents, knowledge, existing] = await Promise.all([
      this.prisma.document.findMany({ where: { workspaceId }, select: { id: true, updatedAt: true } }),
      this.prisma.knowledgeItem.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, updatedAt: true } }),
      this.prisma.searchEmbedding.groupBy({ by: ['entityType', 'entityId', 'model'], where: { workspaceId, chunkIndex: 0 }, _max: { createdAt: true } }),
    ]);
    const done = new Map(existing.map((row) => [`${row.entityType}:${row.entityId}`, row]));
    const items = [...documents.map((d) => ({ kind: 'DOCUMENT' as Kind, ...d })), ...knowledge.map((k) => ({ kind: 'KNOWLEDGE' as Kind, ...k }))];
    const stale = items.filter((item) => { const row = done.get(`${item.kind}:${item.id}`); return !row || row.model !== this.embeddings?.model || (row._max.createdAt ?? 0) < item.updatedAt; });
    return { items, stale };
  }

  /** Brings the index up to date for a bounded number of items. Returns how many are still waiting. */
  private async sync(workspaceId: string) {
    const embeddings = this.embeddings!;
    const { items, stale } = await this.plan(workspaceId);
    // Removed and archived items must stop being searchable.
    for (const kind of ['DOCUMENT', 'KNOWLEDGE'] as Kind[]) await this.prisma.searchEmbedding.deleteMany({ where: { workspaceId, entityType: kind, entityId: { notIn: items.filter((item) => item.kind === kind).map((item) => item.id) } } });
    const batch = stale.slice(0, itemsPerSync);
    const [documents, knowledge] = await Promise.all([
      this.prisma.document.findMany({ where: { workspaceId, id: { in: batch.filter((i) => i.kind === 'DOCUMENT').map((i) => i.id) } }, select: { id: true, title: true, content: true } }),
      this.prisma.knowledgeItem.findMany({ where: { workspaceId, id: { in: batch.filter((i) => i.kind === 'KNOWLEDGE').map((i) => i.id) } }, select: { id: true, title: true, content: true } }),
    ]);
    const texts = [...documents.map((d) => ({ kind: 'DOCUMENT' as Kind, id: d.id, title: d.title, text: documentPlainText(d.content) })), ...knowledge.map((k) => ({ kind: 'KNOWLEDGE' as Kind, id: k.id, title: k.title, text: k.content }))];
    const pieces = texts.flatMap((item) => { const hash = hashText(`${item.title}\n${item.text}`); return chunkText(`${item.title}. ${item.text}`).map((chunk, chunkIndex) => ({ ...item, hash, chunk, chunkIndex })); });
    const vectors: number[][] = [];
    for (let i = 0; i < pieces.length; i += chunksPerRequest) vectors.push(...await embeddings.embed(pieces.slice(i, i + chunksPerRequest).map((piece) => piece.chunk)));
    for (const item of texts) {
      const mine = pieces.map((piece, index) => ({ piece, vector: vectors[index] })).filter(({ piece }) => piece.kind === item.kind && piece.id === item.id);
      // A concurrent search may have indexed the same item a moment ago; the unique key makes that safe, so just move on.
      await this.prisma.$transaction([
        this.prisma.searchEmbedding.deleteMany({ where: { workspaceId, entityType: item.kind, entityId: item.id } }),
        this.prisma.searchEmbedding.createMany({ data: mine.map(({ piece, vector }) => ({ workspaceId, entityType: item.kind, entityId: item.id, chunkIndex: piece.chunkIndex, contentHash: piece.hash, model: embeddings.model, excerpt: piece.chunk.slice(0, 400), vector })) }),
      ]).catch(() => undefined);
    }
    return Math.max(0, stale.length - batch.length);
  }
}
