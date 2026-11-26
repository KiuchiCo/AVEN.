import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { withTimeout } from '../observability/with-timeout.js';
import { createClerkClient } from '@clerk/backend';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { parseProfileUpdate, profileSelect } from './profile.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { ProfileCache } from './profile-cache.js';

const profiles = new ProfileCache();

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrapWorkspace(identity: AuthenticatedIdentity, preferredWorkspaceId?: unknown) {
    const { clerkSecretKey: secretKey } = readApiEnvironment();
    if (!secretKey) {
      throw new ServiceUnavailableException('Clerk profile access is not configured.');
    }

    let profile = profiles.get(identity.subject);
    if (!profile) {
      let providerUser: Awaited<ReturnType<ReturnType<typeof createClerkClient>['users']['getUser']>>;
      try { providerUser = await withTimeout(createClerkClient({ secretKey }).users.getUser(identity.subject), 10_000, 'The sign-in service did not answer in time.'); }
      catch (error) { reportIntegrationFailure('clerk', error); throw new ServiceUnavailableException('The sign-in service is not answering right now. Please try again in a moment.'); }
      const primaryEmail = providerUser.emailAddresses.find(
        (address) => address.id === providerUser.primaryEmailAddressId,
      );

      if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
        throw new UnauthorizedException('Verify your primary email address before continuing.');
      }
      profile = { email: primaryEmail.emailAddress.trim().toLowerCase(), fullName: providerUser.fullName?.trim() || null };
      profiles.set(identity.subject, profile);
    }

    const email = profile.email;
    const displayName = (profile.fullName || email.split('@')[0] || 'AVEN user').slice(0, 120);
    const workspaceName = `${displayName}'s Workspace`.slice(0, 120);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          let user = await transaction.user.findUnique({
            where: {
              identityIssuer_identitySubject: {
                identityIssuer: identity.issuer,
                identitySubject: identity.subject,
              },
            },
          });

          if (user) {
            user = await transaction.user.update({
              where: { id: user.id },
              data: { email },
            });
          } else {
            const emailOwner = await transaction.user.findUnique({ where: { email } });
            if (emailOwner) {
              throw new ConflictException('This email is already linked to another AVEN account. Contact support to resolve it.');
            }
            user = await transaction.user.create({
              data: {
                email,
                displayName,
                identityIssuer: identity.issuer,
                identitySubject: identity.subject,
              },
            });
          }

          let workspace = await transaction.workspace.findUnique({
            where: { personalOwnerId: user.id },
          });

          if (!workspace) {
            workspace = await transaction.workspace.create({
              data: {
                name: workspaceName,
                createdById: user.id,
                personalOwnerId: user.id,
              },
            });
          }

          await transaction.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
            update: {},
            create: {
              workspaceId: workspace.id,
              userId: user.id,
              role: 'OWNER',
            },
            select: { role: true },
          });

          const selectedMembership = typeof preferredWorkspaceId === 'string' && /^[0-9a-f-]{36}$/i.test(preferredWorkspaceId)
            ? await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: preferredWorkspaceId, userId: user.id } }, include: { workspace: { select: { id: true, name: true, personalOwnerId: true, _count: { select: { members: true } } } } } })
            : null;
          const activeMembership = selectedMembership ?? await transaction.workspaceMember.findFirstOrThrow({
            where: { userId: user.id },
            orderBy: [{ createdAt: 'desc' }, { workspaceId: 'asc' }],
            include: { workspace: { select: { id: true, name: true, personalOwnerId: true, _count: { select: { members: true } } } } },
          });

          return {
            user: { id: user.id, email: user.email, displayName: user.displayName, timeZone: user.timeZone ?? null, language: user.language ?? null },
            workspace: { id: activeMembership.workspace.id, name: activeMembership.workspace.name, role: activeMembership.role, memberCount: activeMembership.workspace._count.members, isPersonal: Boolean(activeMembership.workspace.personalOwnerId) },
          };
        });
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        const errorCode = (error as { code?: unknown }).code;
        if (attempt < 2 && (errorCode === 'P2002' || errorCode === 'P2034')) continue;
        if (errorCode === 'P2002') {
          throw new ConflictException('This email is already linked to another AVEN account. Contact support to resolve it.');
        }
        throw error;
      }
    }

    throw new ConflictException('Your workspace is being created. Please try again.');
  }

  async listWorkspaces(identity: AuthenticatedIdentity) {
    const user = await this.currentUser(identity);
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { workspace: { name: 'asc' } }],
      include: { workspace: { select: { id: true, name: true, personalOwnerId: true, updatedAt: true, _count: { select: { members: true } } } } },
    });
    return memberships.map(({ role, workspace }) => ({ id: workspace.id, name: workspace.name, role, memberCount: workspace._count.members, isPersonal: Boolean(workspace.personalOwnerId), updatedAt: workspace.updatedAt }));
  }

  async createWorkspace(identity: AuthenticatedIdentity, input: unknown) {
    const user = await this.currentUser(identity);
    const body = objectInput(input);
    const name = textField(body.name, 'Workspace name', 120);
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({ data: { name, createdById: user.id } });
      await transaction.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' } });
      await transaction.workspaceActivity.create({ data: { workspaceId: workspace.id, actorId: user.id, entityType: 'WORKSPACE', entityId: workspace.id, message: `created workspace “${name}”` } });
      return { ...workspace, role: 'OWNER', memberCount: 1, isPersonal: false };
    });
  }

  async renameWorkspace(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const user = await this.currentUser(identity);
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { role: true } });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (membership.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can change its name.');
    const name = textField(objectInput(input).name, 'Workspace name', 120);
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.workspace.updateMany({ where: { id: workspaceId }, data: { name } });
      if (result.count !== 1) throw new BadRequestException('Workspace not found.');
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: user.id, entityType: 'WORKSPACE', entityId: workspaceId, message: `renamed workspace to “${name}”` } });
      return transaction.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    });
  }

  async getProfile(identity: AuthenticatedIdentity) {
    const user = await this.currentUser(identity);
    return { ...await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: profileSelect }), emailAvailable: Boolean(readApiEnvironment().emailApiKey) };
  }

  async updateProfile(identity: AuthenticatedIdentity, input: unknown) {
    const user = await this.currentUser(identity);
    const changes = parseProfileUpdate(input);
    const data: Record<string, unknown> = { ...changes };
    if (changes.emailNotifications !== undefined) {
      const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailNotifications: true } });
      if (changes.emailNotifications && !readApiEnvironment().emailApiKey) throw new BadRequestException('Email isn’t set up for this AVEN installation yet, so it can’t be turned on.');
      // Only notifications from this moment on are emailed; turning it on never sends a backlog.
      if (changes.emailNotifications !== current.emailNotifications) data.emailEnabledAt = changes.emailNotifications ? new Date() : null;
    }
    return { ...await this.prisma.user.update({ where: { id: user.id }, data, select: profileSelect }), emailAvailable: Boolean(readApiEnvironment().emailApiKey) };
  }

  private async currentUser(identity: AuthenticatedIdentity) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true } });
    if (!user) throw new UnauthorizedException('Finish setting up your AVEN account before managing workspaces.');
    return user;
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
