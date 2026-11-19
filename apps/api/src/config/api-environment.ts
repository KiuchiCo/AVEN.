import { parsePlanOverrides, type PlanOverrides } from '../billing/plans.js';

export type CalendarOAuth = { clientId: string; clientSecret: string; authUrl: string; tokenUrl: string; apiBase: string };

export type ApiEnvironment = {
  apiPort: number;
  webOrigins: string[];
  databaseUrl: string;
  clerkSecretKey?: string;
  clerkJwtKey?: string;
  clerkIssuer?: string;
  isProduction: boolean;
  /** Express `trust proxy`: false, true, or how many proxies sit in front of the API. */
  trustProxy: boolean | number;
  storageDriver: 'local';
  storageDir: string;
  maxUploadBytes: number;
  storageQuotaBytes: number;
  aiApiKey?: string;
  aiModel: string;
  aiBaseUrl: string;
  aiMonthlyCredits: number;
  aiMaxOutputTokens: number;
  workflowAllowPrivateWebhooks: boolean;
  emailApiKey?: string;
  emailFrom?: string;
  emailBaseUrl: string;
  webBaseUrl: string;
  billingPlanOverrides: PlanOverrides;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeBaseUrl: string;
  stripePrices: Partial<Record<'PLUS' | 'PRO' | 'BUSINESS', string>>;
  calendar: { tokenKey?: Buffer; apiPublicUrl: string; google?: CalendarOAuth; microsoft?: CalendarOAuth; syncDisabled: boolean };
};

type EnvironmentSource = Record<string, string | undefined>;

export function readApiEnvironment(source: EnvironmentSource = process.env): ApiEnvironment {
  const errors: string[] = [];
  const rawPort = source.API_PORT?.trim() || '4000';
  const apiPort = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) errors.push('API_PORT must be an integer between 1 and 65535');

  const rawOrigins = source.WEB_ORIGIN === undefined ? 'http://localhost:3000' : source.WEB_ORIGIN;
  const webOrigins: string[] = [];
  for (const entry of rawOrigins.split(',').map((value) => value.trim()).filter(Boolean)) {
    try {
      const origin = new URL(entry);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== entry.replace(/\/$/, '')) throw new Error();
      webOrigins.push(origin.origin);
    } catch { errors.push('WEB_ORIGIN must contain comma-separated HTTP or HTTPS origins'); break; }
  }
  if (!webOrigins.length && !errors.some((error) => error.startsWith('WEB_ORIGIN'))) errors.push('WEB_ORIGIN must contain at least one origin');

  const databaseUrl = source.DATABASE_URL?.trim() ?? '';
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error();
  } catch { errors.push('DATABASE_URL must be a valid PostgreSQL connection URL'); }

  const clerkSecretKey = source.CLERK_SECRET_KEY?.trim() || undefined;
  const clerkJwtKey = source.CLERK_JWT_KEY?.replaceAll('\\n', '\n').trim() || undefined;
  const trustRaw = source.TRUST_PROXY?.trim().toLowerCase() || 'false';
  const trustProxy: boolean | number = trustRaw === 'true' ? true : trustRaw === 'false' ? false : /^\d{1,2}$/.test(trustRaw) ? Number(trustRaw) : (errors.push('TRUST_PROXY must be true, false or the number of proxies in front of the API'), false);
  const clerkIssuer = source.CLERK_ISSUER?.trim() || undefined;
  if (clerkJwtKey && !clerkJwtKey.startsWith('-----BEGIN PUBLIC KEY-----')) errors.push('CLERK_JWT_KEY must be a PEM public key');
  if ((clerkSecretKey || clerkJwtKey) && !clerkIssuer) errors.push('CLERK_ISSUER is required when Clerk verification credentials are configured');

  const storageDriver = source.STORAGE_DRIVER?.trim() || 'local';
  if (storageDriver !== 'local') errors.push('STORAGE_DRIVER must be “local” (object-storage drivers are not available yet)');
  const byteSetting = (name: string, fallback: number, max: number) => {
    const raw = source[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) { errors.push(`${name} must be a whole number between 1 and ${max}`); return fallback; }
    return value;
  };
  const maxUploadBytes = byteSetting('MAX_UPLOAD_BYTES', 25 * 1024 * 1024, 500 * 1024 * 1024);
  const storageQuotaBytes = byteSetting('WORKSPACE_STORAGE_QUOTA_BYTES', 500 * 1024 * 1024, 10 * 1024 ** 4);
  const storageDir = source.STORAGE_DIR?.trim() || '.storage';

  const aiApiKey = source.ANTHROPIC_API_KEY?.trim() || undefined;
  const aiModel = source.AI_MODEL?.trim() || 'claude-sonnet-5-5';
  if (aiModel.length > 100 || !/^[\w.:-]+$/.test(aiModel)) errors.push('AI_MODEL must be a model identifier');
  const aiBaseUrl = source.AI_BASE_URL?.trim() || 'https://api.anthropic.com';
  try {
    const url = new URL(aiBaseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) throw new Error();
  } catch { errors.push('AI_BASE_URL must be an HTTPS URL (HTTP is only allowed for localhost)'); }
  const aiMonthlyCredits = byteSetting('AI_MONTHLY_CREDITS', 200, 100_000_000);
  const aiMaxOutputTokens = byteSetting('AI_MAX_OUTPUT_TOKENS', 2048, 32_000);

  // For local development and tests only: lets webhooks reach localhost. Never enable in production.
  const workflowAllowPrivateWebhooks = source.WORKFLOW_ALLOW_PRIVATE_WEBHOOKS === 'true';
  if (workflowAllowPrivateWebhooks && source.NODE_ENV === 'production') errors.push('WORKFLOW_ALLOW_PRIVATE_WEBHOOKS cannot be enabled in production');

  const emailApiKey = source.EMAIL_API_KEY?.trim() || undefined;
  const emailFrom = source.EMAIL_FROM?.trim() || undefined;
  if (emailApiKey && !emailFrom) errors.push('EMAIL_FROM is required when EMAIL_API_KEY is set');
  if (emailFrom && !/^(?:[^<>\r\n]{1,100} <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/.test(emailFrom)) errors.push('EMAIL_FROM must look like “AVEN <hello@example.com>” or hello@example.com');
  const emailBaseUrl = source.EMAIL_BASE_URL?.trim() || 'https://api.resend.com';
  try {
    const url = new URL(emailBaseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) throw new Error();
  } catch { errors.push('EMAIL_BASE_URL must be an HTTPS URL (HTTP is only allowed for localhost)'); }

  const parsedOverrides = parsePlanOverrides(source.BILLING_PLAN_OVERRIDES);
  errors.push(...parsedOverrides.errors);
  const stripeSecretKey = source.STRIPE_SECRET_KEY?.trim() || undefined;
  const stripeWebhookSecret = source.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
  if (stripeSecretKey && !stripeWebhookSecret) errors.push('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set');
  const stripeBaseUrl = source.STRIPE_BASE_URL?.trim() || 'https://api.stripe.com';
  try {
    const url = new URL(stripeBaseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) throw new Error();
  } catch { errors.push('STRIPE_BASE_URL must be an HTTPS URL (HTTP is only allowed for localhost)'); }
  const stripePrices: ApiEnvironment['stripePrices'] = {};
  for (const plan of ['PLUS', 'PRO', 'BUSINESS'] as const) {
    const price = source[`STRIPE_PRICE_${plan}`]?.trim();
    if (price) { if (/^price_[A-Za-z0-9_]+$/.test(price)) stripePrices[plan] = price; else errors.push(`STRIPE_PRICE_${plan} must be a Stripe price id such as price_123`); }
  }

  const secureUrl = (value: string, name: string) => {
    try {
      const url = new URL(value); const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) throw new Error();
      return value.replace(/\/$/, '');
    } catch { errors.push(`${name} must be an HTTPS URL (HTTP is only allowed for localhost)`); return value; }
  };
  const oauth = (prefix: string, defaults: { authUrl: string; tokenUrl: string; apiBase: string }): CalendarOAuth | undefined => {
    const clientId = source[`${prefix}_CLIENT_ID`]?.trim(); const clientSecret = source[`${prefix}_CLIENT_SECRET`]?.trim();
    if (!clientId && !clientSecret) return undefined;
    if (!clientId || !clientSecret) { errors.push(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`); return undefined; }
    return { clientId, clientSecret, authUrl: secureUrl(source[`${prefix}_AUTH_URL`]?.trim() || defaults.authUrl, `${prefix}_AUTH_URL`), tokenUrl: secureUrl(source[`${prefix}_TOKEN_URL`]?.trim() || defaults.tokenUrl, `${prefix}_TOKEN_URL`), apiBase: secureUrl(source[`${prefix}_API_URL`]?.trim() || defaults.apiBase, `${prefix}_API_URL`) };
  };
  const tenant = source.MICROSOFT_TENANT?.trim() || 'common';
  const google = oauth('GOOGLE', { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', apiBase: 'https://www.googleapis.com/calendar/v3' });
  const microsoft = oauth('MICROSOFT', { authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, apiBase: 'https://graph.microsoft.com/v1.0' });
  let tokenKey: Buffer | undefined;
  const rawKey = source.TOKEN_ENCRYPTION_KEY?.trim();
  if (rawKey) { tokenKey = Buffer.from(rawKey, 'base64'); if (tokenKey.length !== 32) { errors.push('TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64 encoded (for example: openssl rand -base64 32)'); tokenKey = undefined; } }
  if ((google || microsoft) && !rawKey) errors.push('TOKEN_ENCRYPTION_KEY is required when a calendar provider is configured');
  const calendar = { tokenKey, apiPublicUrl: secureUrl(source.API_PUBLIC_URL?.trim() || `http://localhost:${apiPort}`, 'API_PUBLIC_URL'), google, microsoft, syncDisabled: source.CALENDAR_SYNC_DISABLED === 'true' || source.NODE_ENV === 'test' };

  const isProduction = source.NODE_ENV === 'production';
  if (isProduction && (!clerkIssuer || (!clerkSecretKey && !clerkJwtKey))) errors.push('production requires CLERK_ISSUER and a Clerk verification key');
  if (errors.length) throw new Error(`Invalid API environment: ${errors.join('; ')}.`);

  return { apiPort, webOrigins, databaseUrl, clerkSecretKey, clerkJwtKey, clerkIssuer, isProduction, trustProxy, storageDriver: 'local', storageDir, maxUploadBytes, storageQuotaBytes, aiApiKey, aiModel, aiBaseUrl, aiMonthlyCredits, aiMaxOutputTokens, workflowAllowPrivateWebhooks, emailApiKey, emailFrom, emailBaseUrl, webBaseUrl: webOrigins[0] ?? 'http://localhost:3000', billingPlanOverrides: parsedOverrides.overrides, calendar, stripeSecretKey, stripeWebhookSecret, stripeBaseUrl, stripePrices };
}
