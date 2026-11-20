/**
 * The plan catalog and the rules that turn a workspace's subscription into limits.
 * Every limit is enforced in the backend. `null` means unlimited.
 *
 * Billing belongs to a workspace and is separate from roles: a Guest or Owner role says what a person may do,
 * the plan says how much the workspace may hold. Downgrading never deletes anything: existing content stays
 * readable and editable, and only adding more beyond the new limits is refused.
 */
export type PlanKey = 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
export const planKeys: readonly PlanKey[] = ['FREE', 'PLUS', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export type Limits = {
  projects: number | null;
  databases: number | null;
  workflows: number | null;
  customAgents: number | null;
  /** People other than Guests. */
  members: number | null;
  storageBytes: number | null;
  /** Monthly AI credits for the whole workspace. */
  aiCredits: number | null;
};
export type LimitKey = keyof Limits;
export type Feature = 'advancedAutomation' | 'aiAgents' | 'analytics' | 'auditLog' | 'rolePermissions';

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Per month, in `currency`. Null for plans priced by agreement. */
  priceCents: number | null;
  currency: 'aud';
  perSeat: boolean;
  selfServe: boolean;
  limits: Limits;
  /** Added for each paid seat (Business). */
  perSeatLimits?: Partial<Pick<Limits, 'storageBytes' | 'aiCredits'>>;
  features: Feature[];
};

const GB = 1024 ** 3;

/** Free-plan limits that already existed as environment settings keep following them. */
export type EnvDefaults = { storageBytes: number; aiCredits: number };

/** The built-in prices and limits. Prices are provisional: override them with BILLING_PLAN_OVERRIDES. */
export function defaultCatalog(env: EnvDefaults): Record<PlanKey, Plan> {
  return {
    FREE: { key: 'FREE', name: 'Free', tagline: 'Core modules for getting started', priceCents: 0, currency: 'aud', perSeat: false, selfServe: false, features: [],
      limits: { projects: 5, databases: 3, workflows: 3, customAgents: 0, members: 3, storageBytes: env.storageBytes, aiCredits: env.aiCredits } },
    PLUS: { key: 'PLUS', name: 'Plus', tagline: 'More room for individual work', priceCents: 999, currency: 'aud', perSeat: false, selfServe: true, features: [],
      limits: { projects: 25, databases: 15, workflows: 10, customAgents: 0, members: 3, storageBytes: 5 * GB, aiCredits: 2_000 } },
    PRO: { key: 'PRO', name: 'Pro', tagline: 'Advanced automation, AI agents and analytics', priceCents: 1999, currency: 'aud', perSeat: false, selfServe: true, features: ['advancedAutomation', 'aiAgents', 'analytics'],
      limits: { projects: null, databases: null, workflows: 50, customAgents: 10, members: 5, storageBytes: 50 * GB, aiCredits: 10_000 } },
    BUSINESS: { key: 'BUSINESS', name: 'Business', tagline: 'Team workspaces, billed per seat', priceCents: 2999, currency: 'aud', perSeat: true, selfServe: true, features: ['advancedAutomation', 'aiAgents', 'analytics', 'auditLog', 'rolePermissions'],
      limits: { projects: null, databases: null, workflows: 200, customAgents: 20, members: null, storageBytes: 0, aiCredits: 0 }, perSeatLimits: { storageBytes: 25 * GB, aiCredits: 5_000 } },
    ENTERPRISE: { key: 'ENTERPRISE', name: 'Enterprise', tagline: 'Custom terms and limits, arranged directly', priceCents: null, currency: 'aud', perSeat: false, selfServe: false, features: ['advancedAutomation', 'aiAgents', 'analytics', 'auditLog', 'rolePermissions'],
      limits: { projects: null, databases: null, workflows: null, customAgents: null, members: null, storageBytes: null, aiCredits: null } },
  };
}

export type PlanOverrides = Partial<Record<PlanKey, { priceCents?: number | null; name?: string; tagline?: string; limits?: Partial<Limits>; perSeatLimits?: Plan['perSeatLimits'] }>>;

const limitKeys: LimitKey[] = ['projects', 'databases', 'workflows', 'customAgents', 'members', 'storageBytes', 'aiCredits'];

/** Reads BILLING_PLAN_OVERRIDES. Returns the cleaned overrides and any problems. */
export function parsePlanOverrides(raw: string | undefined): { overrides: PlanOverrides; errors: string[] } {
  if (!raw?.trim()) return { overrides: {}, errors: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { overrides: {}, errors: ['BILLING_PLAN_OVERRIDES must be valid JSON'] }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { overrides: {}, errors: ['BILLING_PLAN_OVERRIDES must be an object keyed by plan'] };
  const errors: string[] = []; const overrides: PlanOverrides = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!planKeys.includes(key as PlanKey)) { errors.push(`BILLING_PLAN_OVERRIDES has an unknown plan “${key}”`); continue; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`BILLING_PLAN_OVERRIDES.${key} must be an object`); continue; }
    const e = entry as Record<string, unknown>; const clean: NonNullable<PlanOverrides[PlanKey]> = {};
    for (const field of Object.keys(e)) if (!['priceCents', 'name', 'tagline', 'limits', 'perSeatLimits'].includes(field)) errors.push(`BILLING_PLAN_OVERRIDES.${key} has an unknown field “${field}”`);
    if ('priceCents' in e) { if (e.priceCents === null || (Number.isInteger(e.priceCents) && (e.priceCents as number) >= 0 && (e.priceCents as number) <= 10_000_000)) clean.priceCents = e.priceCents as number | null; else errors.push(`BILLING_PLAN_OVERRIDES.${key}.priceCents must be a whole number of cents or null`); }
    for (const field of ['name', 'tagline'] as const) if (field in e) { if (typeof e[field] === 'string' && (e[field] as string).length <= 120) clean[field] = e[field] as string; else errors.push(`BILLING_PLAN_OVERRIDES.${key}.${field} must be text up to 120 characters`); }
    for (const group of ['limits', 'perSeatLimits'] as const) if (group in e) {
      const source = e[group];
      if (!source || typeof source !== 'object' || Array.isArray(source)) { errors.push(`BILLING_PLAN_OVERRIDES.${key}.${group} must be an object`); continue; }
      const target: Record<string, number | null> = {};
      for (const [limit, amount] of Object.entries(source)) {
        if (!limitKeys.includes(limit as LimitKey) || (group === 'perSeatLimits' && !['storageBytes', 'aiCredits'].includes(limit))) errors.push(`BILLING_PLAN_OVERRIDES.${key}.${group} has an unknown limit “${limit}”`);
        else if (amount === null || (Number.isSafeInteger(amount) && (amount as number) >= 0)) target[limit] = amount as number | null;
        else errors.push(`BILLING_PLAN_OVERRIDES.${key}.${group}.${limit} must be a whole number or null (unlimited)`);
      }
      (clean as Record<string, unknown>)[group] = target;
    }
    overrides[key as PlanKey] = clean;
  }
  return { overrides, errors };
}

export function buildCatalog(env: EnvDefaults, overrides: PlanOverrides = {}): Record<PlanKey, Plan> {
  const catalog = defaultCatalog(env);
  for (const key of planKeys) {
    const o = overrides[key]; if (!o) continue;
    const plan = catalog[key];
    catalog[key] = { ...plan, ...(o.priceCents !== undefined ? { priceCents: o.priceCents } : {}), ...(o.name ? { name: o.name } : {}), ...(o.tagline ? { tagline: o.tagline } : {}), limits: { ...plan.limits, ...(o.limits ?? {}) }, ...(plan.perSeatLimits || o.perSeatLimits ? { perSeatLimits: { ...plan.perSeatLimits, ...(o.perSeatLimits ?? {}) } } : {}) };
  }
  return catalog;
}

export type SubscriptionState = { planKey: string; status: string; seats: number; limitsOverride?: unknown } | null;

/** A subscription only counts while it is paid up or in the provider's retry period. Otherwise the workspace is on Free. */
export const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export type Entitlements = { planKey: PlanKey; plan: Plan; limits: Limits; features: Set<Feature>; seats: number };

export function resolveEntitlements(subscription: SubscriptionState, catalog: Record<PlanKey, Plan>): Entitlements {
  const active = subscription && ACTIVE_STATUSES.includes(subscription.status) && planKeys.includes(subscription.planKey as PlanKey);
  const planKey = (active ? subscription.planKey : 'FREE') as PlanKey;
  const plan = catalog[planKey];
  const seats = active ? Math.max(1, Math.floor(subscription.seats || 1)) : 1;
  const limits: Limits = { ...plan.limits };
  if (plan.perSeat && plan.perSeatLimits) for (const key of ['storageBytes', 'aiCredits'] as const) if (plan.perSeatLimits[key] != null) limits[key] = (limits[key] ?? 0) + plan.perSeatLimits[key]! * seats;
  if (active && subscription.limitsOverride && typeof subscription.limitsOverride === 'object' && !Array.isArray(subscription.limitsOverride)) {
    const custom = subscription.limitsOverride as Record<string, unknown>;
    for (const key of limitKeys) if (key in custom && (custom[key] === null || (Number.isSafeInteger(custom[key]) && (custom[key] as number) >= 0))) limits[key] = custom[key] as number | null;
  }
  return { planKey, plan, limits, features: new Set(plan.features), seats };
}

/** Is another one allowed? `used` is how many exist now. */
export const withinLimit = (used: number, limit: number | null) => limit === null || used < limit;

export const limitLabels: Record<LimitKey, [string, string]> = {
  projects: ['project', 'projects'], databases: ['database', 'databases'], workflows: ['workflow', 'workflows'], customAgents: ['custom agent', 'custom agents'],
  members: ['member', 'members'], storageBytes: ['byte', 'bytes'], aiCredits: ['AI credit', 'AI credits'],
};

export function limitMessage(key: LimitKey, limit: number, planName: string): string {
  const [one, many] = limitLabels[key];
  return limit === 0
    ? `The ${planName} plan doesn’t include ${many}. Upgrade to add ${many}.`
    : `The ${planName} plan allows up to ${limit} ${limit === 1 ? one : many}. Upgrade to add more.`;
}
