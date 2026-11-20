export type Role = 'OWNER' | 'ADMINISTRATOR' | 'MANAGER' | 'MEMBER' | 'GUEST';
const rank: Record<Role, number> = { OWNER: 4, ADMINISTRATOR: 3, MANAGER: 2, MEMBER: 1, GUEST: 0 };

/**
 * Who may change someone's role or remove them. Owners can manage anyone but themselves. Administrators can manage
 * managers, members and guests, and can only set those three roles, so they can't create or remove other administrators.
 * Everyone else can't manage anyone.
 */
export function canManage(actor: Role, target: Role, newRole?: Role): boolean {
  if (actor === 'OWNER') return target !== 'OWNER';
  if (actor !== 'ADMINISTRATOR') return false;
  if (rank[target] >= rank.ADMINISTRATOR) return false;
  return newRole === undefined || rank[newRole] < rank.ADMINISTRATOR;
}

/** Ownership goes to an existing, non-guest member other than the current owner. */
export const canReceiveOwnership = (target: Role) => target !== 'OWNER' && target !== 'GUEST';
