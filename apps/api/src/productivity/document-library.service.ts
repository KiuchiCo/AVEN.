import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { depthOf, duplicateTitle, MAX_BULK, MAX_FOLDER_DEPTH, subtreeHeight, wouldCycle } from './document-library-rules.js';

const input = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('A JSON object is required.');
  return value as Record<string, unknown>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const folderName = (value: unknown) => {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 120) throw new BadRequestException('Folder name must be 1–120 characters.');
  if (/[\\/]/.test(name)) throw new BadRequestException('Folder names cannot contain slashes.');
  return name;
};
const optionalId = (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new BadRequestException(`${label} is not valid.`);
  return value;
};

/** Folders, duplicates and bulk actions for documents. Documents themselves are still created and edited by ProductivityService. */
@Injectable()
export class DocumentLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  private member(identity: AuthenticatedIdentity, workspaceId: string, write = false) { return requireWorkspaceMember(this.prisma, identity, workspaceId, write); }
  private activity(workspaceId: string, actorId: string, entityId: string, message: string, entityType = 'DOCUMENT') {
    return this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType, entityId, message: message.slice(0, 240) } });
  }
  private allFolders(workspaceId: string) { return this.prisma.documentFolder.findMany({ where: { workspaceId }, select: { id: true, parentId: true, name: true, createdAt: true, updatedAt: true, createdBy: { select: { id: true, displayName: true } } }, orderBy: { name: 'asc' } }); }

  async listFolders(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.member(identity, workspaceId);
    const [folders, docCounts] = await Promise.all([this.allFolders(workspaceId), this.prisma.document.groupBy({ by: ['folderId'], where: { workspaceId, folderId: { not: null } }, _count: { _all: true } })]);
    const docs = new Map(docCounts.map((row) => [row.folderId, row._count._all]));
    const kids = new Map<string | null, number>();
    for (const folder of folders) kids.set(folder.parentId, (kids.get(folder.parentId) ?? 0) + 1);
    return folders.map((folder) => ({ ...folder, documentCount: docs.get(folder.id) ?? 0, folderCount: kids.get(folder.id) ?? 0 }));
  }

  private async assertUniqueName(workspaceId: string, parentId: string | null, name: string, exceptId?: string) {
    const clash = await this.prisma.documentFolder.findFirst({ where: { workspaceId, parentId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new ConflictException('A folder with that name already exists here.');
  }

  async createFolder(identity: AuthenticatedIdentity, workspaceId: string, raw: unknown) {
    const actorId = await this.member(identity, workspaceId, true);
    const body = input(raw);
    const name = folderName(body.name);
    const parentId = optionalId(body.parentId, 'Parent folder');
    const folders = await this.allFolders(workspaceId);
    if (parentId && !folders.some((folder) => folder.id === parentId)) throw new NotFoundException('Parent folder not found in this workspace.');
    if (depthOf(folders, parentId) >= MAX_FOLDER_DEPTH) throw new BadRequestException(`Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep.`);
    await this.assertUniqueName(workspaceId, parentId, name);
    const folder = await this.prisma.documentFolder.create({ data: { workspaceId, parentId, createdById: actorId, name } });
    await this.activity(workspaceId, actorId, folder.id, `created the “${name}” document folder`, 'DOCUMENT_FOLDER');
    return folder;
  }

  async updateFolder(identity: AuthenticatedIdentity, workspaceId: string, folderId: string, raw: unknown) {
    const actorId = await this.member(identity, workspaceId, true);
    const body = input(raw);
    const folders = await this.allFolders(workspaceId);
    const current = folders.find((folder) => folder.id === folderId);
    if (!current) throw new NotFoundException('Folder not found in this workspace.');
    const data: { name?: string; parentId?: string | null } = {};
    if ('name' in body) data.name = folderName(body.name);
    if ('parentId' in body) {
      const parentId = optionalId(body.parentId, 'Parent folder');
      if (parentId && !folders.some((folder) => folder.id === parentId)) throw new NotFoundException('Destination folder not found in this workspace.');
      if (wouldCycle(folders, folderId, parentId)) throw new BadRequestException('A folder cannot be moved into itself or one of its own subfolders.');
      if (depthOf(folders, parentId) + subtreeHeight(folders, folderId) > MAX_FOLDER_DEPTH) throw new BadRequestException(`Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep.`);
      data.parentId = parentId;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide a new name or destination.');
    await this.assertUniqueName(workspaceId, 'parentId' in data ? data.parentId ?? null : current.parentId, data.name ?? current.name, folderId);
    const folder = await this.prisma.documentFolder.update({ where: { id: folderId }, data });
    await this.activity(workspaceId, actorId, folderId, `${'name' in data ? 'renamed' : 'moved'} the “${folder.name}” document folder`, 'DOCUMENT_FOLDER');
    return folder;
  }

  /** Deleting a folder never deletes what is inside it: documents and subfolders move up to the folder's parent. */
  async deleteFolder(identity: AuthenticatedIdentity, workspaceId: string, folderId: string) {
    const actorId = await this.member(identity, workspaceId, true);
    const folder = await this.prisma.documentFolder.findFirst({ where: { id: folderId, workspaceId } });
    if (!folder) throw new NotFoundException('Folder not found in this workspace.');
    const siblings = await this.prisma.documentFolder.findMany({ where: { workspaceId, parentId: folder.parentId, id: { not: folderId } }, select: { name: true } });
    const taken = new Set(siblings.map((row) => row.name.toLocaleLowerCase()));
    const children = await this.prisma.documentFolder.findMany({ where: { workspaceId, parentId: folderId }, select: { id: true, name: true } });
    const clash = children.find((child) => taken.has(child.name.toLocaleLowerCase()));
    if (clash) throw new ConflictException(`“${clash.name}” would clash with a folder of the same name in the parent. Rename it first.`);
    const moved = await this.prisma.$transaction(async (tx) => {
      const docs = await tx.document.findMany({ where: { workspaceId, folderId }, select: { id: true, updatedAt: true } });
      for (const doc of docs) await tx.document.update({ where: { id: doc.id }, data: { folderId: folder.parentId, updatedAt: doc.updatedAt } });
      await tx.documentFolder.updateMany({ where: { workspaceId, parentId: folderId }, data: { parentId: folder.parentId } });
      await tx.documentFolder.delete({ where: { id: folderId } });
      return { documents: docs.length, folders: children.length };
    });
    await this.activity(workspaceId, actorId, folderId, `deleted the “${folder.name}” document folder`, 'DOCUMENT_FOLDER');
    return { id: folderId, deleted: true, ...moved };
  }

  async duplicate(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    const actorId = await this.member(identity, workspaceId, true);
    const source = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId } });
    if (!source) throw new NotFoundException('Document not found in this workspace.');
    const copy = await this.prisma.document.create({
      data: { workspaceId, projectId: source.projectId, folderId: source.folderId, docType: source.docType, createdById: actorId, title: duplicateTitle(source.title), content: source.content },
      include: { project: { select: { id: true, name: true } }, createdBy: { select: { id: true, displayName: true } } },
    });
    await this.activity(workspaceId, actorId, copy.id, `duplicated document “${source.title.slice(0, 100)}”`);
    return copy;
  }

  /** Moves or deletes several documents at once. A move keeps each document's "last modified" date. */
  async bulk(identity: AuthenticatedIdentity, workspaceId: string, raw: unknown) {
    const actorId = await this.member(identity, workspaceId, true);
    const body = input(raw);
    const ids = Array.isArray(body.documentIds) ? [...new Set(body.documentIds.map((value) => optionalId(value, 'Document')).filter((value): value is string => Boolean(value)))] : [];
    if (ids.length < 1 || ids.length > MAX_BULK) throw new BadRequestException(`Choose between 1 and ${MAX_BULK} documents.`);
    const docs = await this.prisma.document.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, title: true, updatedAt: true } });
    if (docs.length !== ids.length) throw new NotFoundException('One or more documents were not found in this workspace.');
    if (body.action === 'move') {
      if (!('folderId' in body)) throw new BadRequestException('Choose a destination folder, or null for the top level.');
      const folderId = optionalId(body.folderId, 'Folder');
      if (folderId && !await this.prisma.documentFolder.findFirst({ where: { id: folderId, workspaceId }, select: { id: true } })) throw new NotFoundException('Destination folder not found in this workspace.');
      await this.prisma.$transaction(docs.map((doc) => this.prisma.document.update({ where: { id: doc.id }, data: { folderId, updatedAt: doc.updatedAt } })));
      await this.activity(workspaceId, actorId, docs[0].id, docs.length === 1 ? `moved document “${docs[0].title.slice(0, 100)}”` : `moved ${docs.length} documents`);
      return { action: 'move', count: docs.length };
    }
    if (body.action === 'delete') {
      const result = await this.prisma.document.deleteMany({ where: { workspaceId, id: { in: ids } } });
      await this.activity(workspaceId, actorId, docs[0].id, result.count === 1 ? `deleted document “${docs[0].title.slice(0, 100)}”` : `deleted ${result.count} documents`);
      return { action: 'delete', count: result.count, ids };
    }
    throw new BadRequestException('Action must be "move" or "delete".');
  }
}

