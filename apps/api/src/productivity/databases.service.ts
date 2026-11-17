import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class DatabasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.workspaceDatabase.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: { records: { orderBy: { updatedAt: 'desc' } }, views: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const name = textField(body.name, 'Database name', 160);
    const description = body.description == null || body.description === ''
      ? null
      : textField(body.description, 'Database description', 500);
    return this.prisma.workspaceDatabase.create({ data: { workspaceId, name, description } });
  }

  async createRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, properties: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const values = recordValues(database.properties, objectInput(input).values);
    return this.prisma.databaseRecord.create({ data: { workspaceId, databaseId, values } });
  }

  async addProperty(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const name = textField(body.name, 'Property name', 80);
    const type = enumValue(body.type, ['text', 'number', 'checkbox', 'date', 'status'] as const);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const properties = propertyList(database.properties);
    if (properties.some((property) => property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new BadRequestException('A property with that name already exists.');
    }
    const id = `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const nextProperties = [...properties, { id, name, type }];
    return this.prisma.workspaceDatabase.update({
      where: { id: database.id },
      data: { properties: nextProperties as Prisma.InputJsonValue },
    });
  }

  async saveView(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const name = textField(body.name, 'View name', 80);
    const filterQuery = optionalText(body.filterQuery, 'Filter', 200) ?? '';
    const sortPropertyId = body.sortPropertyId === undefined ? 'updatedAt' : textField(body.sortPropertyId, 'Sort property', 80);
    const sortDirection = enumValue(body.sortDirection, ['ASC', 'DESC'] as const, 'Sort direction', 'DESC');
    const layout = enumValue(body.layout, ['TABLE', 'BOARD', 'GALLERY'] as const, 'View layout', 'TABLE');
    const groupByPropertyId = body.groupByPropertyId === undefined ? 'status' : textField(body.groupByPropertyId, 'Group property', 80);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    if (sortPropertyId !== 'updatedAt' && !propertyList(database.properties).some((property) => property.id === sortPropertyId)) {
      throw new BadRequestException('Sort property must belong to this database.');
    }
    if (layout === 'BOARD' && !propertyList(database.properties).some((property) => property.id === groupByPropertyId && property.type === 'status')) {
      throw new BadRequestException('Board views must group by a status property in this database.');
    }
    if (await this.prisma.databaseView.findFirst({ where: { databaseId, name }, select: { id: true } })) {
      throw new BadRequestException('A saved view with that name already exists.');
    }
    return this.prisma.databaseView.create({
      data: { workspaceId, databaseId, name, filterQuery, sortPropertyId, sortDirection, layout, groupByPropertyId },
    });
  }

  async deleteView(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, viewId: string) {
    await this.requireMembership(identity, workspaceId);
    const result = await this.prisma.databaseView.deleteMany({ where: { id: viewId, databaseId, workspaceId } });
    if (result.count !== 1) throw new NotFoundException('Saved view not found in this database.');
    return { deleted: true };
  }

  async updateRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, recordId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const values = recordValues(database.properties, objectInput(input).values);
    const result = await this.prisma.databaseRecord.updateMany({
      where: { id: recordId, databaseId, workspaceId },
      data: { values },
    });
    if (result.count !== 1) throw new NotFoundException('Record not found in this database.');
    return this.prisma.databaseRecord.findFirstOrThrow({ where: { id: recordId, databaseId, workspaceId } });
  }

  private async requireMembership(identity: AuthenticatedIdentity, workspaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { userId: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found.');
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer.`);
  return value.trim();
}

function recordValues(propertiesValue: unknown, value: unknown): Record<string, string | number | boolean | null> {
  const values = objectInput(value);
  const properties = propertyList(propertiesValue);
  if (Object.keys(values).length > properties.length) throw new BadRequestException('Record values can only use properties defined in this database.');
  for (const [key, item] of Object.entries(values)) {
    const property = properties.find((candidate) => candidate.id === key);
    if (!property) throw new BadRequestException('Record values can only use properties defined in this database.');
    if (item !== null && !matchesType(item, property.type)) throw new BadRequestException(`${property.name} has an invalid value.`);
    if (typeof item === 'string' && item.length > 2000) throw new BadRequestException('Text values must be 2,000 characters or fewer.');
  }
  return values as Record<string, string | number | boolean | null>;
}

function propertyList(value: unknown): Array<{ id: string; name: string; type: string }> {
  if (!Array.isArray(value)) throw new BadRequestException('This database has an invalid property definition.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !('name' in entry) || !('type' in entry)
      || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.type !== 'string') {
      throw new BadRequestException('This database has an invalid property definition.');
    }
    return { id: entry.id, name: entry.name, type: entry.type };
  });
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label = 'Property type', fallback?: T[number]): T[number] {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new BadRequestException(`${label} is invalid.`);
  return value as T[number];
}

function matchesType(value: unknown, type: string) {
  switch (type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox': return typeof value === 'boolean';
    case 'date': return typeof value === 'string' && Number.isFinite(Date.parse(value));
    case 'text':
    case 'status': return typeof value === 'string';
    default: return false;
  }
}
