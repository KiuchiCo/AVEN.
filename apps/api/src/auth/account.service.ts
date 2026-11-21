import { createClerkClient } from '@clerk/backend';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingService } from '../billing/billing.service.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { visibleTaskWhere } from '../productivity/project-rules.js';
import type { AuthenticatedIdentity } from './auth.types.js';

/** Most rows of any one kind that go into an export; `truncated` says when a list was cut. */
const EXPORT_ROWS = 5000;

/** A person's own data: the copy they can ask for, and the deletion they can ask for. */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  private async currentUser(identity: AuthenticatedIdentity) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } } });
    if (!user) throw new NotFoundException('Your AVEN account was not found.');
    return user;
  }

  /**
   * Everything AVEN holds about this person that they wrote or that is about them, in workspaces they still belong to.
   * Other people's words are not included, and neither are tasks of a team-only project the person is outside of. Secrets (tokens, keys) are never included.
   */
  async exportData(identity: AuthenticatedIdentity) {
    const user = await this.currentUser(identity);
    const memberships = await this.prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { role: true, createdAt: true, workspace: { select: { id: true, name: true } } }, take: 100 });
    const workspaceIds = memberships.map((member) => member.workspace.id);
    const inMine = { workspaceId: { in: workspaceIds } };
    const take = EXPORT_ROWS + 1;
    const taskScope = { OR: memberships.map((member) => ({ workspaceId: member.workspace.id, ...visibleTaskWhere({ userId: user.id, role: member.role }) })) };
    const [tasksCreated, tasksAssigned, documents, knowledge, taskComments, documentComments, messages, conversations, favourites, files, calendarConnections, pushDevices, activityCount] = await Promise.all([
      memberships.length ? this.prisma.task.findMany({ where: { createdById: user.id, AND: [taskScope] }, take, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, title: true, description: true, status: true, priority: true, dueAt: true, createdAt: true } }) : [],
      memberships.length ? this.prisma.task.findMany({ where: { assigneeId: user.id, AND: [taskScope] }, take, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, title: true, status: true, dueAt: true } }) : [],
      this.prisma.document.findMany({ where: { createdById: user.id, ...inMine }, take, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, title: true, content: true, createdAt: true, updatedAt: true } }),
      this.prisma.knowledgeItem.findMany({ where: { createdById: user.id, ...inMine }, take, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, title: true, content: true, tags: true, createdAt: true } }),
      this.prisma.taskComment.findMany({ where: { authorId: user.id, ...inMine, task: taskScope }, take, orderBy: { createdAt: 'asc' }, select: { id: true, taskId: true, body: true, createdAt: true } }),
      this.prisma.documentComment.findMany({ where: { createdById: user.id, ...inMine }, take, orderBy: { createdAt: 'asc' }, select: { id: true, documentId: true, body: true, quote: true, createdAt: true } }),
      this.prisma.channelMessage.findMany({ where: { authorId: user.id, deletedAt: null, ...inMine }, take, orderBy: { createdAt: 'asc' }, select: { id: true, channelId: true, body: true, createdAt: true, editedAt: true } }),
      this.prisma.aiConversation.findMany({ where: { userId: user.id, ...inMine }, take: 200, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, title: true, agentKey: true, createdAt: true, messages: { orderBy: { createdAt: 'asc' }, take: 500, select: { role: true, content: true, createdAt: true } } } }),
      this.prisma.favourite.findMany({ where: { userId: user.id, ...inMine }, select: { kind: true, entityId: true, createdAt: true } }),
      this.prisma.storedFile.findMany({ where: { createdById: user.id, deletedAt: null, ...inMine }, take, orderBy: { createdAt: 'asc' }, select: { id: true, workspaceId: true, name: true, mimeType: true, sizeBytes: true, createdAt: true } }),
      this.prisma.calendarConnection.findMany({ where: { connectedById: user.id, ...inMine }, select: { provider: true, accountEmail: true, status: true, createdAt: true } }),
      this.prisma.pushSubscription.count({ where: { userId: user.id } }),
      this.prisma.workspaceActivity.count({ where: { actorId: user.id, ...inMine } }),
    ]);
    const cut = <T>(rows: T[]) => ({ items: rows.slice(0, EXPORT_ROWS), truncated: rows.length > EXPORT_ROWS });
    return {
      exportedAt: new Date().toISOString(),
      about: 'A copy of the personal information AVEN holds about you and the content you created in workspaces you still belong to. Passwords and sign-in details are held by Clerk, not AVEN.',
      profile: { id: user.id, email: user.email, displayName: user.displayName, timeZone: user.timeZone, language: user.language, createdAt: user.createdAt, emailNotifications: user.emailNotifications, notifyTeamActivity: user.notifyTeamActivity, notifyTaskUpdates: user.notifyTaskUpdates },
      workspaces: memberships.map((member) => ({ id: member.workspace.id, name: member.workspace.name, role: member.role, joinedAt: member.createdAt })),
      tasksCreated: cut(tasksCreated), tasksAssigned: cut(tasksAssigned), documents: cut(documents), knowledgeItems: cut(knowledge),
      taskComments: cut(taskComments), documentComments: cut(documentComments), messages: cut(messages), aiConversations: conversations,
      favourites, files: cut(files), calendarConnections, pushDevices, activityEntries: activityCount,
    };
  }

  /**
   * Deletes the person's account from AVEN and makes it unreachable at once: their sign-in is unlinked, their memberships, devices, calendar links, AI
   * conversations and pins are removed, and the account row is stripped of everything that identifies them. What they wrote in shared workspaces stays,
   * attributed to "Deleted user", because other people's work depends on it. Workspaces they own alone are deleted with all their content.
   * A workspace that has other members, or a paid plan, must be handed over or deleted first: that is a decision for its owner, not something to do silently.
   */
  async deleteAccount(identity: AuthenticatedIdentity, input: unknown) {
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { confirmEmail?: unknown; alsoDeleteSignIn?: unknown } : {};
    const user = await this.currentUser(identity);
    if (typeof body.confirmEmail !== 'string' || body.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) throw new BadRequestException('Type your email address to confirm that you want to delete your account.');
    const owned = await this.prisma.workspaceMember.findMany({ where: { userId: user.id, role: 'OWNER' }, select: { workspace: { select: { id: true, name: true, _count: { select: { members: true } }, subscription: { select: { status: true, planKey: true } } } } } });
    const blocking = owned.map((member) => member.workspace).filter((workspace) => workspace._count.members > 1 || (workspace.subscription && workspace.subscription.planKey !== 'FREE' && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(workspace.subscription.status)));
    if (blocking.length) throw new ConflictException(`Hand over or delete these workspaces first: ${blocking.map((workspace) => `“${workspace.name}”`).join(', ')}. They have other members or a paid plan.`);
    const others = await this.prisma.workspaceMember.findMany({ where: { userId: user.id, role: { not: 'OWNER' } }, select: { workspaceId: true } });
    const aloneIds = owned.map((member) => member.workspace.id);
    const anonymousEmail = `deleted-${user.id}@deleted.invalid`;
    await this.prisma.$transaction(async (transaction) => {
      if (aloneIds.length) await transaction.workspace.deleteMany({ where: { id: { in: aloneIds } } });
      await transaction.workspaceMember.deleteMany({ where: { userId: user.id } });
      await transaction.task.updateMany({ where: { assigneeId: user.id }, data: { assigneeId: null } });
      await transaction.pushSubscription.deleteMany({ where: { userId: user.id } });
      await transaction.favourite.deleteMany({ where: { userId: user.id } });
      await transaction.channelRead.deleteMany({ where: { userId: user.id } });
      await transaction.channelMember.deleteMany({ where: { userId: user.id } });
      await transaction.calendarConnection.deleteMany({ where: { connectedById: user.id } });
      await transaction.aiConversation.deleteMany({ where: { userId: user.id } });
      await transaction.activityReceipt.deleteMany({ where: { userId: user.id } });
      await transaction.taskFollower.deleteMany({ where: { userId: user.id } });
      await transaction.projectMember.deleteMany({ where: { userId: user.id } });
      await transaction.workspaceInvite.deleteMany({ where: { email: user.email } });
      await transaction.user.update({ where: { id: user.id }, data: { email: anonymousEmail, displayName: 'Deleted user', identityIssuer: null, identitySubject: null, emailNotifications: false, notifyTeamActivity: false, notifyTaskUpdates: false, emailEnabledAt: null, timeZone: null, language: null, dashboardHiddenWidgets: [] } });
    });
    for (const { workspaceId } of others) await this.billing.syncSeatsQuietly(workspaceId);
    // Only when asked: remove the sign-in account at Clerk as well, so the same login cannot start a new AVEN account by accident.
    let signInDeleted = false;
    const { clerkSecretKey } = readApiEnvironment();
    if (body.alsoDeleteSignIn === true && clerkSecretKey) {
      try { await createClerkClient({ secretKey: clerkSecretKey }).users.deleteUser(identity.subject); signInDeleted = true; } catch { signInDeleted = false; }
    }
    return { deleted: true, signInDeleted, workspacesDeleted: aloneIds.length };
  }
}
