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

/** Which tasks a member may see or change: those with no project, and those in a project they may see. A team-only project hides its tasks too, not just its page. */
export function visibleTaskWhere(actor: ProjectAccessor) {
  const projects = visibleProjectWhere(actor);
  return Object.keys(projects).length ? { OR: [{ projectId: null }, { project: projects }] } : {};
}

/** The member as the visibility rules see them. */
export async function viewerOf(prisma: { workspaceMember: { findUniqueOrThrow: (args: { where: { workspaceId_userId: { workspaceId: string; userId: string } }; select: { role: true } }) => Promise<{ role: Role }> } }, workspaceId: string, userId: string): Promise<ProjectAccessor> {
  const member = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  return { userId, role: member.role };
}

/** Ids of the team-only projects this member is outside, and of their tasks, so their names and activity can be kept out of feeds and notifications. */
export async function hiddenIdsFor(prisma: { project: { findMany: (args: unknown) => Promise<{ id: string; tasks: { id: string }[] }[]> } }, workspaceId: string, viewer: ProjectAccessor): Promise<string[]> {
  const visible = visibleProjectWhere(viewer);
  if (!Object.keys(visible).length) return [];
  const hidden = await prisma.project.findMany({ where: { workspaceId, NOT: visible }, select: { id: true, tasks: { select: { id: true }, take: 5000 } } });
  return hidden.flatMap((project) => [project.id, ...project.tasks.map((task) => task.id)]);
}
