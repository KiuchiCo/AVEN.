import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      include: { records: { orderBy: { updatedAt: 'desc' } } },
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
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const values = recordValues(objectInput(input).values);
    return this.prisma.databaseRecord.create({ data: { workspaceId, databaseId, values } });
  }

  async updateRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, recordId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const values = recordValues(objectInput(input).values);
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

function recordValues(value: unknown): Record<string, string | number | boolean | null> {
  const values = objectInput(value);
  if (Object.keys(values).length > 50) throw new BadRequestException('A record can contain at most 50 properties.');
  for (const [key, item] of Object.entries(values)) {
    if (!key.trim() || key.length > 80) throw new BadRequestException('Property names must be between 1 and 80 characters.');
    if (item !== null && typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
      throw new BadRequestException('Record values must be text, numbers, booleans, or null.');
    }
    if (typeof item === 'string' && item.length > 2000) throw new BadRequestException('Text values must be 2,000 characters or fewer.');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new BadRequestException('Numeric values must be finite.');
  }
  return values as Record<string, string | number | boolean | null>;
}
