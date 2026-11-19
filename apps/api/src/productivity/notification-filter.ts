import type { Prisma } from '../generated/prisma/client.js';

export type NotificationPreferences = { notifyTeamActivity: boolean; notifyTaskUpdates: boolean };

/**
 * Which activity rows appear in a member's Inbox.
 * - Team activity: workspace-wide events that are not addressed to specific people.
 * - Task updates: events addressed to this member (mentions, assignments, followed tasks, comments).
 * Turning both off yields an empty OR, which matches nothing.
 */
export function workspaceNotificationWhere(workspaceId: string, userId: string, preferences: NotificationPreferences): Prisma.WorkspaceActivityWhereInput {
  const sources: Prisma.WorkspaceActivityWhereInput[] = [];
  if (preferences.notifyTeamActivity) sources.push({ recipientScoped: false, entityType: { notIn: ['TASK_COMMENT', 'TASK_CHECKLIST'] } });
  if (preferences.notifyTaskUpdates) sources.push({ receipts: { some: { userId, isNotificationTarget: true } } });
  return {
    workspaceId,
    actorId: { not: userId },
    OR: sources,
    NOT: { receipts: { some: { userId, dismissedAt: { not: null } } } },
  };
}
