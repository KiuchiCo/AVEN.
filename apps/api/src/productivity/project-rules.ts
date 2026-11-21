import type { Role } from './member-rules.js';

export type ProjectAccessor = { userId: string; role: Role };
type OwnedProject = { ownerId: string | null; createdById: string };

/** Owners and administrators of the workspace, and the project's own owner or creator, may administer it. */
export function canAdminister(actor: ProjectAccessor, project: OwnedProject): boolean {
  return actor.role === 'OWNER' || actor.role === 'ADMINISTRATOR' || project.ownerId === actor.userId || project.createdById === actor.userId;
}

/** Which projects a member may see: everything shared with the workspace, plus team-only projects they run or belong to. Administrators see all. */
export function visibleProjectWhere(actor: ProjectAccessor) {
  if (actor.role === 'OWNER' || actor.role === 'ADMINISTRATOR') return {};
  return { OR: [{ visibility: 'WORKSPACE' as const }, { ownerId: actor.userId }, { createdById: actor.userId }, { members: { some: { userId: actor.userId } } }] };
}

/** A project start date may not fall after its due date. */
export function startBeforeDue(startAt: Date | null, dueAt: Date | null): boolean {
  return !startAt || !dueAt || startAt.getTime() <= dueAt.getTime();
}
