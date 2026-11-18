import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { createInvitationToken, hashInvitationToken } from './invitation-token.js';

const roles = ['ADMINISTRATOR', 'MANAGER', 'MEMBER', 'GUEST'] as const;
type InviteRole = (typeof roles)[number];

@Injectable()
export class WorkspaceInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.membership(identity, workspaceId);
    const [members, invitations] = await Promise.all([
      this.prisma.workspaceMember.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: { userId: true, role: true, createdAt: true, user: { select: { email: true, displayName: true } } } }),
      this.prisma.workspaceInvite.findMany({ where: { workspaceId, status: 'PENDING', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } }),
    ]);
    return { members: members.map(({ user, ...member }) => ({ ...member, email: user.email, displayName: user.displayName })), invitations };
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actor = await this.membership(identity, workspaceId, true);
    const body = objectInput(input);
    const email = text(body.email, 'Email', 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    const role = roleValue(body.role);
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user && await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { id: true } })) {
      throw new ConflictException('This person is already a workspace member.');
    }
    const existing = await this.prisma.workspaceInvite.findFirst({ where: { workspaceId, email, status: 'PENDING', expiresAt: { gt: new Date() } }, select: { id: true } });
    if (existing) throw new ConflictException('There is already an active invitation for this email.');
    const token = createInvitationToken();
    const invite = await this.prisma.workspaceInvite.create({ data: {
      workspaceId, createdById: actor.userId, email, role, tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } });
    return { invitation: invite, token };
  }

  async revoke(identity: AuthenticatedIdentity, workspaceId: string, inviteId: string) {
    await this.membership(identity, workspaceId, true);
    const result = await this.prisma.workspaceInvite.updateMany({ where: { id: inviteId, workspaceId, status: 'PENDING' }, data: { status: 'REVOKED' } });
    if (result.count !== 1) throw new NotFoundException('Pending invitation not found.');
    return { revoked: true };
  }

  async updateMember(identity: AuthenticatedIdentity, workspaceId: string, memberId: string, input: unknown) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can change member roles.');
    const body = objectInput(input);
    const role = roleValue(body.role);
    if (memberId === actor.userId) throw new BadRequestException('You cannot change your own workspace role.');
    const target = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, select: { role: true, user: { select: { displayName: true } } } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    if (target.role === 'OWNER') throw new BadRequestException('The workspace owner role cannot be changed.');
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.workspaceMember.updateMany({ where: { workspaceId, userId: memberId, role: { not: 'OWNER' } }, data: { role } });
      if (updated.count !== 1) throw new NotFoundException('Workspace member not found.');
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: memberId, message: `changed ${target.user.displayName}'s role to ${role.toLocaleLowerCase()}` } });
    });
    return { userId: memberId, role };
  }

  async removeMember(identity: AuthenticatedIdentity, workspaceId: string, memberId: string) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can remove members.');
    if (memberId === actor.userId) throw new BadRequestException('You cannot remove yourself as the workspace owner.');
    const target = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, select: { role: true, user: { select: { displayName: true } } } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    if (target.role === 'OWNER') throw new BadRequestException('The workspace owner cannot be removed.');
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.workspaceMember.deleteMany({ where: { workspaceId, userId: memberId, role: { not: 'OWNER' } } });
      if (removed.count !== 1) throw new NotFoundException('Workspace member not found.');
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: memberId, message: `removed ${target.user.displayName} from the workspace` } });
    });
    return { removed: true };
  }

  async details(token: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { workspace: { select: { name: true } } } });
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt <= new Date()) throw new NotFoundException('This invitation is invalid, expired, or has already been used.');
    return { email: invite.email, role: invite.role, workspaceName: invite.workspace.name, expiresAt: invite.expiresAt };
  }

  async accept(identity: AuthenticatedIdentity, token: string) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true, email: true } });
    if (!user) throw new ForbiddenException('Sign in and finish account setup before accepting this invitation.');
    const tokenHash = hashInvitationToken(token);
    const invite = await this.prisma.workspaceInvite.findUnique({ where: { tokenHash }, select: { id: true, workspaceId: true, email: true, role: true, status: true, expiresAt: true } });
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt <= new Date()) throw new NotFoundException('This invitation is invalid, expired, or has already been used.');
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) throw new ForbiddenException(`This invitation was sent to ${invite.email}. Sign in with that verified email address.`);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role } });
        const updated = await transaction.workspaceInvite.updateMany({ where: { id: invite.id, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (updated.count !== 1) throw new ConflictException('This invitation has already been accepted or revoked.');
        await transaction.workspaceActivity.create({ data: { workspaceId: invite.workspaceId, actorId: user.id, entityType: 'MEMBER', entityId: user.id, message: 'joined the workspace' } });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('You are already a member of this workspace or the invitation was just used.');
      throw error;
    }
    return { accepted: true, workspaceId: invite.workspaceId };
  }

  private async membership(identity: AuthenticatedIdentity, workspaceId: string, adminOnly = false) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true } });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { role: true } });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (adminOnly && !['OWNER', 'ADMINISTRATOR'].includes(membership.role)) throw new ForbiddenException('Only workspace owners and administrators can manage invitations.');
    return { userId: user.id, role: membership.role };
  }
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('A JSON object is required.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function roleValue(value: unknown): InviteRole {
  if (typeof value !== 'string' || !roles.includes(value as InviteRole)) throw new BadRequestException('Invited role is invalid. Choose Administrator, Manager, Member, or Guest.');
  return value as InviteRole;
}
