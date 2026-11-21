import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { renderInvitationEmail } from '../email/email-templates.js';
import { TransactionalEmail } from '../email/transactional-email.service.js';
import { BillingService } from '../billing/billing.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { FilesService } from '../files/files.service.js';
import { createInvitationToken, hashInvitationToken } from './invitation-token.js';
import { canManage, canReceiveOwnership, type Role } from './member-rules.js';

const roles = ['ADMINISTRATOR', 'MANAGER', 'MEMBER', 'GUEST'] as const;
type InviteRole = (typeof roles)[number];

@Injectable()
export class WorkspaceInvitationsService {
  constructor(private readonly prisma: PrismaService, private readonly email: TransactionalEmail, private readonly entitlements: EntitlementsService, private readonly billing: BillingService, private readonly files: FilesService) {}

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
    const created = {
      data: { workspaceId, createdById: actor.userId, email, role, tokenHash: hashInvitationToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    };
    // The seat check and the save are one step, so parallel invitations cannot all pass the check and go over the plan's limit.
    const invite = role === 'GUEST' ? await this.prisma.workspaceInvite.create(created) : await this.entitlements.addMemberWithinLimit(workspaceId, { includePending: true }, (transaction) => transaction.workspaceInvite.create(created));
    // Best effort: the admin still gets the link to share if the email can't be sent.
    const [inviter, workspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }),
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    ]);
    const link = `${readApiEnvironment().webBaseUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;
    const emailed = await this.email.send({ to: email, ...renderInvitationEmail({ inviterName: inviter?.displayName ?? '', workspaceName: workspace?.name ?? 'a workspace', role, link, expiresAt: invite.expiresAt }) });
    return { invitation: invite, token, email: emailed };
  }

  async revoke(identity: AuthenticatedIdentity, workspaceId: string, inviteId: string) {
    await this.membership(identity, workspaceId, true);
    const result = await this.prisma.workspaceInvite.updateMany({ where: { id: inviteId, workspaceId, status: 'PENDING' }, data: { status: 'REVOKED' } });
    if (result.count !== 1) throw new NotFoundException('Pending invitation not found.');
    return { revoked: true };
  }

  async updateMember(identity: AuthenticatedIdentity, workspaceId: string, memberId: string, input: unknown) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER' && actor.role !== 'ADMINISTRATOR') throw new ForbiddenException('Only workspace owners and administrators can change member roles.');
    const body = objectInput(input);
    const role = roleValue(body.role);
    if (memberId === actor.userId) throw new BadRequestException('You cannot change your own workspace role.');
    const target = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, select: { role: true, user: { select: { displayName: true } } } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    if (target.role === 'OWNER') throw new BadRequestException('The workspace owner role cannot be changed. Transfer ownership instead.');
    if (!canManage(actor.role as Role, target.role as Role, role as Role)) throw new ForbiddenException('Only the workspace owner can change administrators or make someone an administrator.');
    if (target.role === 'GUEST' && role !== 'GUEST') await this.entitlements.assertCanAddMember(workspaceId, { includePending: true });
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.workspaceMember.updateMany({ where: { workspaceId, userId: memberId, role: { not: 'OWNER' } }, data: { role } });
      if (updated.count !== 1) throw new NotFoundException('Workspace member not found.');
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: memberId, message: `changed ${target.user.displayName}'s role to ${role.toLocaleLowerCase()}` } });
    });
    await this.billing.syncSeatsQuietly(workspaceId);
    return { userId: memberId, role };
  }

  async removeMember(identity: AuthenticatedIdentity, workspaceId: string, memberId: string) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER' && actor.role !== 'ADMINISTRATOR') throw new ForbiddenException('Only workspace owners and administrators can remove members.');
    if (memberId === actor.userId) throw new BadRequestException('Use “Leave workspace” to remove yourself.');
    const target = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, select: { role: true, user: { select: { displayName: true } } } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    if (target.role === 'OWNER') throw new BadRequestException('The workspace owner cannot be removed.');
    if (!canManage(actor.role as Role, target.role as Role)) throw new ForbiddenException('Only the workspace owner can remove administrators.');
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.workspaceMember.deleteMany({ where: { workspaceId, userId: memberId, role: { not: 'OWNER' } } });
      if (removed.count !== 1) throw new NotFoundException('Workspace member not found.');
      await transaction.task.updateMany({ where: { workspaceId, assigneeId: memberId }, data: { assigneeId: null } });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: memberId, message: `removed ${target.user.displayName} from the workspace` } });
    });
    await this.billing.syncSeatsQuietly(workspaceId);
    return { removed: true };
  }

  /** Leaving is always allowed except for the owner, who must hand the workspace over first. Nothing they created is deleted. */
  async leave(identity: AuthenticatedIdentity, workspaceId: string) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role === 'OWNER') throw new BadRequestException('The owner can’t leave. Transfer ownership to someone else first, or delete the workspace.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { displayName: true } });
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.workspaceMember.deleteMany({ where: { workspaceId, userId: actor.userId, role: { not: 'OWNER' } } });
      if (removed.count !== 1) throw new NotFoundException('Workspace not found.');
      await transaction.task.updateMany({ where: { workspaceId, assigneeId: actor.userId }, data: { assigneeId: null } });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: actor.userId, message: `${user.displayName} left the workspace` } });
    });
    await this.billing.syncSeatsQuietly(workspaceId);
    return { left: true };
  }

  /** The owner hands the workspace to another member and becomes an administrator, so the workspace always has exactly one owner. */
  async transferOwnership(identity: AuthenticatedIdentity, workspaceId: string, memberId: string) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can transfer ownership.');
    if (memberId === actor.userId) throw new BadRequestException('You already own this workspace.');
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { personalOwnerId: true } });
    if (workspace.personalOwnerId) throw new BadRequestException('A personal workspace can’t be transferred.');
    const target = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, select: { role: true, user: { select: { displayName: true } } } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    if (!canReceiveOwnership(target.role as Role)) throw new BadRequestException('Guests can’t own a workspace. Change their role first.');
    await this.prisma.$transaction(async (transaction) => {
      const demoted = await transaction.workspaceMember.updateMany({ where: { workspaceId, userId: actor.userId, role: 'OWNER' }, data: { role: 'ADMINISTRATOR' } });
      if (demoted.count !== 1) throw new ConflictException('Ownership changed while you were transferring it. Refresh and try again.');
      await transaction.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: memberId } }, data: { role: 'OWNER' } });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: actor.userId, entityType: 'MEMBER', entityId: memberId, message: `made ${target.user.displayName} the workspace owner` } });
    });
    await this.billing.syncSeatsQuietly(workspaceId);
    return { userId: memberId, role: 'OWNER' };
  }

  /**
   * Permanently deletes a shared workspace and everything in it, including stored files. Owner only, the name must be typed
   * to confirm, and a workspace with a paid subscription must have it cancelled first so billing is never left running.
   */
  async deleteWorkspace(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actor = await this.membership(identity, workspaceId);
    if (actor.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can delete the workspace.');
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true, personalOwnerId: true } });
    if (workspace.personalOwnerId) throw new BadRequestException('A personal workspace can’t be deleted.');
    const typed = typeof objectInput(input).name === 'string' ? (objectInput(input).name as string).trim() : '';
    if (typed !== workspace.name) throw new BadRequestException('Type the workspace’s exact name to confirm deleting it.');
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId }, select: { status: true, providerSubscriptionId: true } });
    if (subscription?.providerSubscriptionId && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status)) throw new ConflictException('This workspace still has a paid subscription. Cancel it from Settings → Plan and usage (Manage billing) first, then delete the workspace.');
    await this.files.removeAllObjects(workspaceId);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    return { deleted: true };
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
      const join = async (transaction: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0]) => {
        await transaction.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role } });
        const updated = await transaction.workspaceInvite.updateMany({ where: { id: invite.id, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (updated.count !== 1) throw new ConflictException('This invitation has already been accepted or revoked.');
        await transaction.workspaceActivity.create({ data: { workspaceId: invite.workspaceId, actorId: user.id, entityType: 'MEMBER', entityId: user.id, message: 'joined the workspace' } });
      };
      if (invite.role === 'GUEST') await this.prisma.$transaction(join);
      else await this.entitlements.addMemberWithinLimit(invite.workspaceId, { includePending: false }, join);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('You are already a member of this workspace or the invitation was just used.');
      throw error;
    }
    await this.billing.syncSeatsQuietly(invite.workspaceId);
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
