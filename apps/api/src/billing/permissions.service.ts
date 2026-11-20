import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EntitlementsService } from './entitlements.service.js';
import { defaultPolicy, parsePolicyUpdate, policyLabels, readPolicy, roleAllows, type PermissionPolicy, type PolicyKey } from './permission-rules.js';

/**
 * Business-plan permission policy: which role is needed for a few sensitive actions.
 * The policy is only enforced while the plan includes `rolePermissions`. If a workspace drops to a lower plan the
 * saved choices are kept (nothing is deleted) but everyone can act again until it upgrades.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  private async effective(workspaceId: string): Promise<{ available: boolean; saved: PermissionPolicy; policy: PermissionPolicy }> {
    const [features, workspace] = await Promise.all([this.entitlements.forWorkspace(workspaceId), this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { permissionPolicy: true } })]);
    const saved = readPolicy(workspace?.permissionPolicy);
    const available = features.features.has('rolePermissions');
    return { available, saved, policy: available ? saved : defaultPolicy };
  }

  /** Throws 403 if the member's role is below what the workspace requires for this action. */
  async assert(workspaceId: string, userId: string, key: PolicyKey): Promise<void> {
    const { policy } = await this.effective(workspaceId);
    if (policy[key] === 'MEMBERS') return;
    const role = (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
    if (!roleAllows(role, policy[key])) throw new ForbiddenException(`This workspace only lets ${policy[key] === 'ADMINS' ? 'owners and administrators' : 'managers, administrators and owners'} ${policyLabels[key]}.`);
  }

  async get(identity: AuthenticatedIdentity, workspaceId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const { available, saved, policy } = await this.effective(workspaceId);
    return { available, policy: saved, enforced: policy };
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const role = (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
    if (role !== 'OWNER' && role !== 'ADMINISTRATOR') throw new ForbiddenException('Only workspace owners and administrators can change permissions.');
    await this.entitlements.assertFeature(workspaceId, 'rolePermissions', 'Role permissions');
    const { saved } = await this.effective(workspaceId);
    const next = parsePolicyUpdate(input, saved);
    await this.prisma.$transaction([
      this.prisma.workspace.update({ where: { id: workspaceId }, data: { permissionPolicy: next as unknown as Prisma.InputJsonValue } }),
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'WORKSPACE', entityId: workspaceId, message: `changed role permissions (${Object.entries(next).map(([k, v]) => `${k}: ${v.toLowerCase()}`).join(', ')})` } }),
    ]);
    return { available: true, policy: next, enforced: next };
  }
}
