import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from './auth.types.js';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * The single workspace-isolation check. Resolves the signed-in identity to a user,
 * requires membership of the requested workspace, and blocks Guests from writes.
 * Returns the user's id. Non-members get a 404 so other workspaces are not revealed.
 */
export async function requireWorkspaceMember(
  prisma: Pick<PrismaService, 'user' | 'workspaceMember'>,
  identity: AuthenticatedIdentity,
  workspaceId: string,
  write = false,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
    select: { id: true },
  });
  if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { role: true },
  });
  if (!membership) throw new NotFoundException('Workspace not found.');
  if (write && membership.role === 'GUEST') throw new ForbiddenException('Guest members have read-only access to this workspace.');
  return user.id;
}
