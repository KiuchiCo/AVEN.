import { randomUUID } from 'node:crypto';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { Readable } from 'node:stream';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { cleanFileName, downloadHeaders, formatBytes, normalizeMimeType, uniqueName } from './file-rules.js';
import type { StorageDriver } from './storage.js';
import { extractText, titleFromFileName } from './text-extract.js';
import { FILE_LIMITS, STORAGE, type FileLimits } from './tokens.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fileSelect = {
  id: true, name: true, mimeType: true, sizeBytes: true, version: true, folderId: true, createdAt: true, updatedAt: true, deletedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.StoredFileSelect;
const MAX_FOLDER_DEPTH = 20;

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}

const READ_AS_TEXT_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(FILE_LIMITS) private readonly limits: FileLimits,
    private readonly entitlements: EntitlementsService,
  ) {}

  private member(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId, write);
  }

  // ---- browsing -------------------------------------------------------------------------------------------

  async list(identity: AuthenticatedIdentity, workspaceId: string, query: { folderId?: string; q?: string; deleted?: string }) {
    await this.member(identity, workspaceId);
    if (query.deleted === 'true') {
      const files = await this.prisma.storedFile.findMany({ where: { workspaceId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, take: 200, select: fileSelect });
      return { folder: null, path: [], folders: [], files };
    }
    const search = query.q?.trim();
    if (search) {
      if (search.length < 2 || search.length > 100) throw new BadRequestException('Search must be between 2 and 100 characters.');
      const [folders, files] = await Promise.all([
        this.prisma.fileFolder.findMany({ where: { workspaceId, name: { contains: search, mode: 'insensitive' } }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true, parentId: true, createdAt: true } }),
        this.prisma.storedFile.findMany({ where: { workspaceId, deletedAt: null, name: { contains: search, mode: 'insensitive' } }, orderBy: { updatedAt: 'desc' }, take: 100, select: fileSelect }),
      ]);
      return { folder: null, path: [], folders, files };
    }
    const folderId = query.folderId ? id(query.folderId, 'Folder') : null;
    const path = folderId ? await this.breadcrumbs(workspaceId, folderId) : [];
    const [folders, files] = await Promise.all([
      this.prisma.fileFolder.findMany({ where: { workspaceId, parentId: folderId }, orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true, createdAt: true } }),
      this.prisma.storedFile.findMany({ where: { workspaceId, folderId, deletedAt: null }, orderBy: { name: 'asc' }, select: fileSelect }),
    ]);
    return { folder: path.at(-1) ?? null, path, folders, files };
  }

  private async breadcrumbs(workspaceId: string, folderId: string) {
    const path: Array<{ id: string; name: string }> = [];
    let cursor: string | null = folderId;
    while (cursor && path.length < MAX_FOLDER_DEPTH) {
      const folder: { id: string; name: string; parentId: string | null } | null = await this.prisma.fileFolder.findFirst({ where: { id: cursor, workspaceId }, select: { id: true, name: true, parentId: true } });
      if (!folder) throw new NotFoundException('Folder not found in this workspace.');
      path.unshift({ id: folder.id, name: folder.name });
      cursor = folder.parentId;
    }
    return path;
  }

  async usage(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.member(identity, workspaceId);
    return { usedBytes: await this.usedBytes(this.prisma, workspaceId), quotaBytes: await this.entitlements.limit(workspaceId, 'storageBytes'), maxFileBytes: this.limits.maxUploadBytes };
  }

  /** Everything not yet permanently deleted counts: current files, files in the recycle bin, and old versions. */
  private async usedBytes(client: Pick<Prisma.TransactionClient, 'storedFile' | 'fileVersion'>, workspaceId: string) {
    // One after the other: inside a transaction both queries share a single connection.
    const files = await client.storedFile.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true } });
    const versions = await client.fileVersion.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true } });
    return (files._sum.sizeBytes ?? 0) + (versions._sum.sizeBytes ?? 0);
  }

  // ---- folders --------------------------------------------------------------------------------------------

  async createFolder(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.member(identity, workspaceId, true);
    const body = this.object(input);
    const parentId = body.parentId == null || body.parentId === '' ? null : id(body.parentId, 'Parent folder');
    if (parentId) {
      const depth = (await this.breadcrumbs(workspaceId, parentId)).length;
      if (depth >= MAX_FOLDER_DEPTH) throw new BadRequestException(`Folders can be nested ${MAX_FOLDER_DEPTH} levels deep.`);
    }
    const name = cleanFileName(body.name, 'Folder name');
    const siblings = await this.prisma.fileFolder.findMany({ where: { workspaceId, parentId }, select: { name: true } });
    if (siblings.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new ConflictException('A folder with that name already exists here.');
    return this.prisma.fileFolder.create({ data: { workspaceId, parentId, name, createdById: userId }, select: { id: true, name: true, parentId: true, createdAt: true } });
  }

  async renameFolder(identity: AuthenticatedIdentity, workspaceId: string, folderId: string, input: unknown) {
    await this.member(identity, workspaceId, true);
    const folder = await this.prisma.fileFolder.findFirst({ where: { id: folderId, workspaceId }, select: { id: true, parentId: true } });
    if (!folder) throw new NotFoundException('Folder not found in this workspace.');
    const name = cleanFileName(this.object(input).name, 'Folder name');
    const siblings = await this.prisma.fileFolder.findMany({ where: { workspaceId, parentId: folder.parentId, id: { not: folder.id } }, select: { name: true } });
    if (siblings.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new ConflictException('A folder with that name already exists here.');
    return this.prisma.fileFolder.update({ where: { id: folder.id }, data: { name }, select: { id: true, name: true, parentId: true, createdAt: true } });
  }

  async deleteFolder(identity: AuthenticatedIdentity, workspaceId: string, folderId: string) {
    await this.member(identity, workspaceId, true);
    const folder = await this.prisma.fileFolder.findFirst({ where: { id: folderId, workspaceId }, select: { id: true, _count: { select: { children: true, files: true } } } });
    if (!folder) throw new NotFoundException('Folder not found in this workspace.');
    if (folder._count.children || folder._count.files) throw new BadRequestException('Move or permanently delete everything inside this folder first.');
    await this.prisma.fileFolder.delete({ where: { id: folder.id } });
    return { id: folder.id, deleted: true };
  }

  // ---- upload / download ----------------------------------------------------------------------------------

  /**
   * Streams a raw request body to storage. `replaceFileId` uploads a new version of an existing file.
   * Quota is checked under a per-workspace lock so parallel uploads cannot overshoot it.
   */
  async upload(identity: AuthenticatedIdentity, workspaceId: string, request: Readable & { headers: Record<string, string | string[] | undefined> }, query: { name?: string; folderId?: string; replaceFileId?: string }) {
    const userId = await this.member(identity, workspaceId, true);
    const name = cleanFileName(query.name, 'File name');
    const folderId = query.folderId ? id(query.folderId, 'Folder') : null;
    const replaceFileId = query.replaceFileId ? id(query.replaceFileId, 'File') : null;
    if (folderId && !await this.prisma.fileFolder.findFirst({ where: { id: folderId, workspaceId }, select: { id: true } })) throw new NotFoundException('Folder not found in this workspace.');
    if (replaceFileId && !await this.prisma.storedFile.findFirst({ where: { id: replaceFileId, workspaceId, deletedAt: null }, select: { id: true } })) throw new NotFoundException('File not found in this workspace.');

    const declared = Number(request.headers['content-length']);
    const { maxUploadBytes } = this.limits;
    const storageQuotaBytes = (await this.entitlements.limit(workspaceId, 'storageBytes')) ?? Infinity;
    if (Number.isFinite(declared) && declared > maxUploadBytes) throw new PayloadTooLargeException(`Files can be up to ${formatBytes(maxUploadBytes)}.`);
    if (Number.isFinite(declared) && declared > 0 && await this.usedBytes(this.prisma, workspaceId) + declared > storageQuotaBytes) throw new PayloadTooLargeException('This workspace is out of storage space.');

    // Sent in X-File-Mime because Content-Type must stay application/octet-stream: the JSON body parser would consume a JSON upload.
    const mimeType = normalizeMimeType(request.headers['x-file-mime']);
    const storageKey = `${workspaceId}/${randomUUID()}`;
    const { size, checksum } = await this.storage.put(storageKey, request, maxUploadBytes);
    try {
      if (size === 0) throw new BadRequestException('The file is empty.');
      const file = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
        if (await this.usedBytes(transaction, workspaceId) + size > storageQuotaBytes) throw new PayloadTooLargeException('This workspace is out of storage space.');
        if (replaceFileId) {
          const current = await transaction.storedFile.findFirst({ where: { id: replaceFileId, workspaceId, deletedAt: null } });
          if (!current) throw new NotFoundException('File not found in this workspace.');
          await transaction.fileVersion.create({ data: { workspaceId, fileId: current.id, createdById: current.createdById, version: current.version, mimeType: current.mimeType, sizeBytes: current.sizeBytes, checksum: current.checksum, storageKey: current.storageKey } });
          return transaction.storedFile.update({ where: { id: current.id }, data: { storageKey, mimeType, sizeBytes: size, checksum, version: current.version + 1 }, select: fileSelect });
        }
        const taken = await transaction.storedFile.findMany({ where: { workspaceId, folderId, deletedAt: null }, select: { name: true } });
        const created = await transaction.storedFile.create({ data: { workspaceId, folderId, createdById: userId, name: uniqueName(name, taken.map((item) => item.name)), mimeType, sizeBytes: size, checksum, storageKey }, select: fileSelect });
        await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'FILE', entityId: created.id, message: `uploaded “${created.name}”` } });
        return created;
      });
      return file;
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(identity: AuthenticatedIdentity, workspaceId: string, fileId: string, query: { version?: string; inline?: string }) {
    await this.member(identity, workspaceId);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { id: true, name: true, mimeType: true, storageKey: true, sizeBytes: true, version: true } });
    if (!file) throw new NotFoundException('File not found in this workspace.');
    let target = { storageKey: file.storageKey, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
    if (query.version !== undefined && Number(query.version) !== file.version) {
      const version = Number(query.version);
      if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Version is invalid.');
      const old = await this.prisma.fileVersion.findFirst({ where: { fileId: file.id, workspaceId, version }, select: { storageKey: true, mimeType: true, sizeBytes: true } });
      if (!old) throw new NotFoundException('That version does not exist.');
      target = old;
    }
    let stored;
    try { stored = await this.storage.get(target.storageKey); }
    catch { throw new NotFoundException('The file contents are missing from storage.'); }
    return { stream: stored.stream, headers: { ...downloadHeaders(file.name, target.mimeType, query.inline === '1'), 'Content-Length': String(stored.size) } };
  }

  /** Reads a stored text file and saves its text as a Knowledge entry, so it can be searched, linked and cited like any other. */
  async addToKnowledge(identity: AuthenticatedIdentity, workspaceId: string, fileId: string, input: unknown) {
    const userId = await this.member(identity, workspaceId, true);
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { title?: unknown; tags?: unknown } : {};
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { name: true, mimeType: true, storageKey: true, sizeBytes: true } });
    if (!file) throw new NotFoundException('File not found in this workspace.');
    if (file.sizeBytes > READ_AS_TEXT_MAX_BYTES) throw new BadRequestException(`Only files up to ${formatBytes(READ_AS_TEXT_MAX_BYTES)} can be read as text.`);
    let bytes: Buffer;
    try { const stored = await this.storage.get(file.storageKey); const parts: Buffer[] = []; for await (const chunk of stored.stream) parts.push(Buffer.from(chunk as Buffer)); bytes = Buffer.concat(parts); }
    catch { throw new NotFoundException('The file contents are missing from storage.'); }
    const { text, truncated } = extractText(file.name, file.mimeType, bytes);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : titleFromFileName(file.name);
    const rawTags = body.tags === undefined || body.tags === null ? [] : body.tags;
    if (!Array.isArray(rawTags) || rawTags.length > 20 || rawTags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)) throw new BadRequestException('Use up to 20 tags of up to 40 characters.');
    const tags = [...new Set((rawTags as string[]).map((tag) => tag.trim().toLocaleLowerCase()))];
    const item = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.knowledgeItem.create({ data: { workspaceId, createdById: userId, title, content: text, tags }, select: { id: true, title: true } });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'KNOWLEDGE', entityId: created.id, message: `added “${title}” to Knowledge from a file` } });
      return created;
    });
    return { ...item, truncated };
  }

  async versions(identity: AuthenticatedIdentity, workspaceId: string, fileId: string) {
    await this.member(identity, workspaceId);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { id: true, version: true, sizeBytes: true, updatedAt: true, createdBy: { select: { displayName: true } } } });
    if (!file) throw new NotFoundException('File not found in this workspace.');
    const old = await this.prisma.fileVersion.findMany({ where: { fileId, workspaceId }, orderBy: { version: 'desc' }, select: { version: true, sizeBytes: true, createdAt: true, createdBy: { select: { displayName: true } } } });
    return [{ version: file.version, sizeBytes: file.sizeBytes, createdAt: file.updatedAt, createdBy: file.createdBy, current: true }, ...old.map((item) => ({ ...item, current: false }))];
  }

  // ---- renaming, moving, recycle bin ----------------------------------------------------------------------

  async updateFile(identity: AuthenticatedIdentity, workspaceId: string, fileId: string, input: unknown) {
    await this.member(identity, workspaceId, true);
    const body = this.object(input);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { id: true, name: true, folderId: true } });
    if (!file) throw new NotFoundException('File not found in this workspace.');
    const data: { name?: string; folderId?: string | null } = {};
    if ('folderId' in body) {
      data.folderId = body.folderId == null || body.folderId === '' ? null : id(body.folderId, 'Folder');
      if (data.folderId && !await this.prisma.fileFolder.findFirst({ where: { id: data.folderId, workspaceId }, select: { id: true } })) throw new NotFoundException('Folder not found in this workspace.');
    }
    if ('name' in body) data.name = cleanFileName(body.name, 'File name');
    if (!Object.keys(data).length) throw new BadRequestException('Provide a name or folder to change.');
    const folderId = 'folderId' in data ? data.folderId! : file.folderId;
    const taken = await this.prisma.storedFile.findMany({ where: { workspaceId, folderId, deletedAt: null, id: { not: file.id } }, select: { name: true } });
    data.name = uniqueName(data.name ?? file.name, taken.map((item) => item.name));
    return this.prisma.storedFile.update({ where: { id: file.id }, data, select: fileSelect });
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, fileId: string) {
    const userId = await this.member(identity, workspaceId, true);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { id: true, name: true } });
    if (!file) throw new NotFoundException('File not found in this workspace.');
    await this.prisma.$transaction([
      this.prisma.storedFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } }),
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'FILE', entityId: file.id, message: `moved “${file.name}” to the recycle bin` } }),
    ]);
    return { id: file.id, deleted: true };
  }

  async restore(identity: AuthenticatedIdentity, workspaceId: string, fileId: string) {
    await this.member(identity, workspaceId, true);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: { not: null } }, select: { id: true, name: true, folderId: true } });
    if (!file) throw new NotFoundException('That file is not in the recycle bin.');
    const taken = await this.prisma.storedFile.findMany({ where: { workspaceId, folderId: file.folderId, deletedAt: null }, select: { name: true } });
    return this.prisma.storedFile.update({ where: { id: file.id }, data: { deletedAt: null, name: uniqueName(file.name, taken.map((item) => item.name)) }, select: fileSelect });
  }

  /** Permanently removes a file that is already in the recycle bin, including every stored version. */
  async purge(identity: AuthenticatedIdentity, workspaceId: string, fileId: string) {
    const userId = await this.member(identity, workspaceId, true);
    const file = await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: { not: null } }, select: { id: true, name: true, storageKey: true, versions: { select: { storageKey: true } } } });
    if (!file) throw new NotFoundException('Only files in the recycle bin can be deleted permanently.');
    await this.prisma.$transaction([
      this.prisma.storedFile.delete({ where: { id: file.id } }),
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'FILE', entityId: file.id, message: `permanently deleted “${file.name}”` } }),
    ]);
    for (const key of [file.storageKey, ...file.versions.map((version) => version.storageKey)]) await this.storage.delete(key).catch(() => undefined);
    return { id: file.id, purged: true };
  }

  // ---- attachments ----------------------------------------------------------------------------------------

  async attachments(identity: AuthenticatedIdentity, workspaceId: string, query: { taskId?: string; documentId?: string; projectId?: string }) {
    await this.member(identity, workspaceId);
    const target = this.target(query);
    return this.prisma.fileAttachment.findMany({
      where: { workspaceId, ...target, file: { deletedAt: null } }, orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, file: { select: fileSelect } },
    });
  }

  async attach(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.member(identity, workspaceId, true);
    const body = this.object(input);
    const fileId = id(body.fileId, 'File');
    const target = this.target(body);
    if (!await this.prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null }, select: { id: true } })) throw new NotFoundException('File not found in this workspace.');
    const exists = 'taskId' in target ? await this.prisma.task.findFirst({ where: { id: target.taskId, workspaceId }, select: { id: true } })
      : 'documentId' in target ? await this.prisma.document.findFirst({ where: { id: target.documentId, workspaceId }, select: { id: true } })
      : await this.prisma.project.findFirst({ where: { id: target.projectId, workspaceId }, select: { id: true } });
    if (!exists) throw new NotFoundException('The item to attach to was not found in this workspace.');
    try {
      return await this.prisma.fileAttachment.create({ data: { workspaceId, fileId, createdById: userId, ...target }, select: { id: true, createdAt: true, file: { select: fileSelect } } });
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2002') throw new ConflictException('That file is already attached here.');
      throw error;
    }
  }

  async detach(identity: AuthenticatedIdentity, workspaceId: string, attachmentId: string) {
    await this.member(identity, workspaceId, true);
    const result = await this.prisma.fileAttachment.deleteMany({ where: { id: attachmentId, workspaceId } });
    if (result.count !== 1) throw new NotFoundException('Attachment not found in this workspace.');
    return { id: attachmentId, deleted: true };
  }

  // ---- helpers --------------------------------------------------------------------------------------------

  private target(source: { taskId?: unknown; documentId?: unknown; projectId?: unknown }): { taskId: string } | { documentId: string } | { projectId: string } {
    const given = (['taskId', 'documentId', 'projectId'] as const).filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '');
    if (given.length !== 1) throw new BadRequestException('Choose exactly one task, document, or project.');
    const key = given[0];
    return { [key]: id(source[key], key === 'taskId' ? 'Task' : key === 'documentId' ? 'Document' : 'Project') } as { taskId: string } | { documentId: string } | { projectId: string };
  }

  private object(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
    return input as Record<string, unknown>;
  }
}
