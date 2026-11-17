import { createClerkClient } from '@clerk/backend';
import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedIdentity } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrapWorkspace(identity: AuthenticatedIdentity) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new ServiceUnavailableException('Clerk profile access is not configured.');
    }

    const providerUser = await createClerkClient({ secretKey }).users.getUser(identity.subject);
    const primaryEmail = providerUser.emailAddresses.find(
      (address) => address.id === providerUser.primaryEmailAddressId,
    );

    if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
      throw new UnauthorizedException('Verify your primary email address before continuing.');
    }

    const email = primaryEmail.emailAddress.trim().toLowerCase();
    const displayName = (providerUser.fullName?.trim() || email.split('@')[0] || 'AVEN user').slice(0, 120);
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
              data: { email, displayName },
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

          const activeMembership = await transaction.workspaceMember.findFirstOrThrow({
            where: { userId: user.id },
            orderBy: [{ createdAt: 'desc' }, { workspaceId: 'asc' }],
            include: { workspace: { select: { id: true, name: true, _count: { select: { members: true } } } } },
          });

          return {
            user: { id: user.id, email: user.email, displayName: user.displayName },
            workspace: { id: activeMembership.workspace.id, name: activeMembership.workspace.name, role: activeMembership.role, memberCount: activeMembership.workspace._count.members },
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
}
