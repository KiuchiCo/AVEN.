import { BadRequestException } from '@nestjs/common';

/** Things a Business workspace can restrict to more senior roles. Everyone-can-do-it is the default, and what lower plans always get. */
export const policyKeys = ['automations', 'projects', 'sharing'] as const;
export type PolicyKey = (typeof policyKeys)[number];
export const policyLevels = ['MEMBERS', 'MANAGERS', 'ADMINS'] as const;
export type PolicyLevel = (typeof policyLevels)[number];
export type PermissionPolicy = Record<PolicyKey, PolicyLevel>;

export const defaultPolicy: PermissionPolicy = { automations: 'MEMBERS', projects: 'MEMBERS', sharing: 'MEMBERS' };
export const policyLabels: Record<PolicyKey, string> = { automations: 'manage automations and workflows', projects: 'create projects', sharing: 'create public share links' };

const roleRank: Record<string, number> = { OWNER: 4, ADMINISTRATOR: 3, MANAGER: 2, MEMBER: 1, GUEST: 0 };
const levelRank: Record<PolicyLevel, number> = { MEMBERS: 1, MANAGERS: 2, ADMINS: 3 };

export const roleAllows = (role: string | undefined, level: PolicyLevel) => (roleRank[role ?? ''] ?? 0) >= levelRank[level];

/** Reads what is stored: unknown keys or levels fall back to the default, so a bad row never locks anyone out. */
export function readPolicy(stored: unknown): PermissionPolicy {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const policy = { ...defaultPolicy };
  for (const key of policyKeys) if ((policyLevels as readonly unknown[]).includes(source[key])) policy[key] = source[key] as PolicyLevel;
  return policy;
}

/** Validates an update. Only the keys sent change. */
export function parsePolicyUpdate(input: unknown, current: PermissionPolicy): PermissionPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  const body = input as Record<string, unknown>;
  const next = { ...current };
  for (const key of Object.keys(body)) {
    if (!(policyKeys as readonly string[]).includes(key)) throw new BadRequestException(`Unknown permission “${key}”.`);
    if (!(policyLevels as readonly unknown[]).includes(body[key])) throw new BadRequestException(`${key} must be one of ${policyLevels.join(', ')}.`);
    next[key as PolicyKey] = body[key] as PolicyLevel;
  }
  if (Object.keys(body).length === 0) throw new BadRequestException('Choose at least one permission to change.');
  return next;
}
