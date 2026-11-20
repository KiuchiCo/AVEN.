import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { ProductivityService } from '../productivity/productivity.service.js';
import { buildExportDocument, contentDisposition, exportFilename, type Resolver } from './document-model.js';
import { renderDocx } from './docx.js';
import { renderPdf } from './pdf.js';

export type ExportFormat = 'pdf' | 'docx';
export const parseFormat = (value: unknown): ExportFormat => { if (value === 'pdf' || value === 'docx') return value; throw new BadRequestException('Choose pdf or docx.'); };
const MIME: Record<ExportFormat, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; const MAX_IMAGES = 40; const MAX_CONCURRENT = 3;

async function readAll(stream: NodeJS.ReadableStream, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of stream) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string); size += buffer.length; if (size > limit) throw new Error('too large'); chunks.push(buffer); }
  return Buffer.concat(chunks);
}

@Injectable()
export class ExportService {
  private readonly log = new Logger('Export');
  private running = 0;
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService, private readonly productivity: ProductivityService) {}

  /** What a reader of this export may see. `public` is a shared link: only images in the document, and databases only when the owner allowed embeds. */
  private resolver(workspaceId: string, mode: { kind: 'member' } | { kind: 'public'; includeEmbeds: boolean }): Resolver {
    let images = 0;
    return {
      image: async (fileId) => {
        if (images >= MAX_IMAGES) return null; images += 1;
        try {
          const image = await this.files.publicImage(workspaceId, fileId);
          const raw = await readAll(image.stream, MAX_IMAGE_BYTES);
          const pipeline = sharp(raw, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 1600, withoutEnlargement: true });
          const jpeg = image.mimeType === 'image/jpeg';
          const { data, info } = await (jpeg ? pipeline.jpeg({ quality: 88 }) : pipeline.png()).toBuffer({ resolveWithObject: true });
          return { data, mime: jpeg ? 'image/jpeg' as const : 'image/png' as const, width: info.width, height: info.height };
        } catch { return null; }
      },
      file: async (fileId) => (mode.kind === 'public' ? null : this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { name: true } })),
      page: async (id) => (mode.kind === 'public' ? null : this.prisma.document.findFirst({ where: { id, workspaceId }, select: { title: true } })),
      database: async (id) => {
        if (mode.kind === 'public' && !mode.includeEmbeds) return null;
        const database = await this.prisma.workspaceDatabase.findFirst({ where: { id, workspaceId }, select: { name: true, properties: true } });
        if (!database) return null;
        const records = await this.prisma.databaseRecord.findMany({ where: { databaseId: id, workspaceId }, orderBy: { createdAt: 'asc' }, take: 500, select: { values: true } });
        const properties = (Array.isArray(database.properties) ? database.properties : []).filter((p): p is { id: string; name: string; type: string } => Boolean(p) && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string').map((p) => ({ id: p.id, name: String(p.name ?? p.id), type: String(p.type ?? 'text') }));
        return { name: database.name, properties, records: records.map((record) => ({ values: (record.values && typeof record.values === 'object' && !Array.isArray(record.values) ? record.values : {}) as Record<string, unknown> })) };
      },
    };
  }

  /** Builds the file from a saved snapshot. Errors are logged without any of the document's content. */
  async render(source: { id: string; title: string; content: string; updatedAt: Date }, workspaceId: string, format: ExportFormat, mode: { kind: 'member' } | { kind: 'public'; includeEmbeds: boolean }) {
    // shortcut: documents are built in memory, a few at a time per API process; a very large export queue would belong in a background job
    if (this.running >= MAX_CONCURRENT) throw new HttpException('Exports are busy. Please try again in a moment.', 503);
    this.running += 1;
    try {
      const model = await buildExportDocument(source, this.resolver(workspaceId, mode));
      const body = format === 'pdf' ? await renderPdf(model) : await renderDocx(model);
      return { body, contentType: MIME[format], filename: exportFilename(source.title, format) };
    } catch (error) {
      this.log.error(`Export of document ${source.id} as ${format} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new HttpException('The document could not be exported. Please try again.', 500);
    } finally { this.running -= 1; }
  }

  headers(file: { body: Buffer; contentType: string; filename: string }) {
    return { 'Content-Type': file.contentType, 'Content-Length': String(file.body.length), 'Content-Disposition': contentDisposition(file.filename), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
  }

  /** A member exports with their own permissions; the content includes text typed in the last moment. */
  async exportForMember(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, requested: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId); // not a member: 404, like every other workspace route, before anything else is looked at
    const format = parseFormat(requested);
    const document = await this.productivity.getDocument(identity, workspaceId, documentId); // also folds in text typed in the last moment
    const file = await this.render({ id: document.id, title: document.title, content: document.content, updatedAt: document.updatedAt }, workspaceId, format, { kind: 'member' });
    await this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `exported “${document.title}” as ${format.toUpperCase()}`.slice(0, 240) } }).catch(() => undefined);
    return file;
  }
}
