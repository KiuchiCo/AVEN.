import { isIP } from 'node:net';
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
  trustProxy: boolean | number | string[];
  /** Where request counters live: in this process, or in PostgreSQL so every API instance shares them and a restart does not reset them. */
  rateLimitStore: 'memory' | 'postgres';
  /** How live events reach other API instances: `memory` (this instance only) or `postgres` (LISTEN/NOTIFY). */
  realtimeBus: 'memory' | 'postgres';
  /** Error tracking (a Sentry-compatible DSN) and the token that opens GET /api/v1/metrics. Both optional: absent means off. */
  monitoring: { errorTrackingDsn?: string; errorTrackingEnvironment: string; release?: string; metricsToken?: string };
  storageDriver: 'local' | 's3';
  /** Present when STORAGE_DRIVER=s3. */
  s3?: { bucket: string; region: string; accessKeyId: string; secretAccessKey: string; endpoint?: string };
  storageDir: string;
  maxUploadBytes: number;
  storageQuotaBytes: number;
  aiProvider: 'gemini' | 'anthropic';
  aiApiKey?: string;
  /** Browser push (VAPID). Absent means push is off. */
  push?: { publicKey: string; privateKey: string; subject: string };
  /** Apple Push Notification service, for the iPhone and iPad app. Absent means native push is off. `baseUrl` exists for tests (a local stand-in). */
  apns?: { keyId: string; teamId: string; privateKey: string; bundleId: string; baseUrl?: string };
  /** Optional web search for AVEN Intelligence (Tavily Search API). */
  webSearch?: { apiKey: string; baseUrl: string };
  /** Optional embeddings for semantic search, from any OpenAI-compatible /embeddings endpoint. */
  embeddings?: { apiKey: string; baseUrl: string; model: string };
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
  /** Stripe Managed Payments (Stripe handles indirect tax, fraud and order support). Off unless STRIPE_MANAGED_PAYMENTS=true. */
  stripeManagedPayments: boolean;
  stripePrices: Partial<Record<'PLUS' | 'PRO' | 'BUSINESS', string>>;
  calendar: { tokenKey?: Buffer; apiPublicUrl: string; google?: CalendarOAuth; microsoft?: CalendarOAuth; syncDisabled: boolean };
};

type EnvironmentSource = Record<string, string | undefined>;

const trustNames = new Set(['loopback', 'linklocal', 'uniquelocal']);
/**
 * TRUST_PROXY: false, a count of proxies in front of the API, or a list of the addresses (or loopback/linklocal/uniquelocal) the proxies connect from.
 * A list is the safest: a request that does not come from a listed address has its forwarding headers ignored, so reaching the API directly cannot forge a client address.
 */
function parseTrustProxy(raw: string, errors: string[]): boolean | number | string[] {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d{1,2}$/.test(raw)) return Number(raw);
  const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  const valid = entries.length > 0 && entries.every((entry) => {
    if (trustNames.has(entry)) return true;
    const [address, prefix, extra] = entry.split('/');
    const version = isIP(address);
    return version !== 0 && extra === undefined && (prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128)));
  });
  if (valid) return entries;
  errors.push('TRUST_PROXY must be false, the number of proxies in front of the API, or a comma-separated list of proxy addresses (loopback, linklocal, uniquelocal, 10.0.0.5, 10.0.0.0/8)');
  return false;
}

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
    if (source.NODE_ENV === 'production' && ['aven-local-only', 'aven_ci', 'postgres', 'password'].includes(decodeURIComponent(url.password))) errors.push('DATABASE_URL uses a development password; set a strong database password before running in production');
  } catch { errors.push('DATABASE_URL must be a valid PostgreSQL connection URL'); }

  const clerkSecretKey = source.CLERK_SECRET_KEY?.trim() || undefined;
  const clerkJwtKey = source.CLERK_JWT_KEY?.replaceAll('\\n', '\n').trim() || undefined;
  const trustRaw = source.TRUST_PROXY?.trim().toLowerCase() || 'false';
  const trustProxy = parseTrustProxy(trustRaw, errors);
  if (trustProxy === true && source.NODE_ENV === 'production') errors.push('TRUST_PROXY=true makes the API believe any client\u2019s X-Forwarded-For header; use the number of proxies in front of it, or the addresses they connect from');
  const apnsValues = [source.APNS_KEY_ID, source.APNS_TEAM_ID, source.APNS_PRIVATE_KEY].map((value) => value?.trim() || undefined);
  let apns: ApiEnvironment['apns'];
  if (apnsValues.some(Boolean)) {
    const [keyId, teamId, privateKey] = apnsValues;
    const pem = privateKey?.replaceAll('\\n', '\n');
    if (!keyId || !teamId || !pem) errors.push('APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY must be set together');
    else if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) errors.push('APNS_KEY_ID and APNS_TEAM_ID are 10 letters or digits (from your Apple Developer account)');
    else if (!pem.startsWith('-----BEGIN PRIVATE KEY-----')) errors.push('APNS_PRIVATE_KEY must be the contents of the .p8 key file');
    else apns = { keyId, teamId, privateKey: pem, bundleId: source.APNS_BUNDLE_ID?.trim() || 'app.aven.mobile', ...(source.APNS_BASE_URL?.trim() ? { baseUrl: source.APNS_BASE_URL.trim() } : {}) };
  }
  const rateLimitRaw = source.RATE_LIMIT_STORE?.trim().toLowerCase() || 'memory';
  if (rateLimitRaw !== 'memory' && rateLimitRaw !== 'postgres') errors.push('RATE_LIMIT_STORE must be memory or postgres');
  const realtimeRaw = source.REALTIME_BUS?.trim().toLowerCase() || 'memory';
  if (realtimeRaw !== 'memory' && realtimeRaw !== 'postgres') errors.push('REALTIME_BUS must be memory or postgres');
  const errorTrackingDsn = source.ERROR_TRACKING_DSN?.trim() || undefined;
  if (errorTrackingDsn) { try { const dsn = new URL(errorTrackingDsn); if (!/^https?:$/.test(dsn.protocol) || !dsn.username || dsn.pathname.length < 2) throw new Error(); } catch { errors.push('ERROR_TRACKING_DSN must look like https://<key>@<host>/<project>'); } }
  const metricsToken = source.METRICS_TOKEN?.trim() || undefined;
  if (metricsToken && metricsToken.length < 24) errors.push('METRICS_TOKEN must be at least 24 characters');
  const clerkIssuer = source.CLERK_ISSUER?.trim() || undefined;
  if (clerkJwtKey && !clerkJwtKey.startsWith('-----BEGIN PUBLIC KEY-----')) errors.push('CLERK_JWT_KEY must be a PEM public key');
  if ((clerkSecretKey || clerkJwtKey) && !clerkIssuer) errors.push('CLERK_ISSUER is required when Clerk verification credentials are configured');

  const storageDriver = source.STORAGE_DRIVER?.trim() || 'local';
  if (storageDriver !== 'local' && storageDriver !== 's3') errors.push('STORAGE_DRIVER must be “local” or “s3”');
  let s3: ApiEnvironment['s3'];
  if (storageDriver === 's3') {
    const bucket = source.S3_BUCKET?.trim(), accessKeyId = source.S3_ACCESS_KEY_ID?.trim(), secretAccessKey = source.S3_SECRET_ACCESS_KEY?.trim();
    const endpoint = source.S3_ENDPOINT?.trim() || undefined;
    // Cloudflare R2 signs with the region “auto”; anything else would be rejected.
    const region = source.S3_REGION?.trim() || (endpoint && /\.r2\.cloudflarestorage\.com/i.test(endpoint) ? 'auto' : 'us-east-1');
    if (!bucket || !accessKeyId || !secretAccessKey) errors.push('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3');
    else s3 = { bucket, region, accessKeyId, secretAccessKey, endpoint };
    if (endpoint) { try { new URL(endpoint); } catch { errors.push('S3_ENDPOINT must be a valid URL'); } }
  }
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

  const aiProvider = source.AI_PROVIDER?.trim() || 'gemini';
  if (aiProvider !== 'gemini' && aiProvider !== 'anthropic') errors.push('AI_PROVIDER must be “gemini” or “anthropic”');
  // Only the chosen provider's key is read, so a stray key for the other one never switches providers by accident.
  const aiApiKey = (aiProvider === 'anthropic' ? source.ANTHROPIC_API_KEY : source.GOOGLE_AI_API_KEY)?.trim() || undefined;
  const vapidPublic = source.VAPID_PUBLIC_KEY?.trim() || undefined, vapidPrivate = source.VAPID_PRIVATE_KEY?.trim() || undefined;
  let push: ApiEnvironment['push'];
  if (vapidPublic || vapidPrivate) {
    const subject = source.VAPID_SUBJECT?.trim() ?? '';
    if (!vapidPublic || !vapidPrivate) errors.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together');
    else if (Buffer.from(vapidPublic, 'base64url').length !== 65 || Buffer.from(vapidPrivate, 'base64url').length !== 32) errors.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be a P-256 key pair from `npm run vapid:generate`');
    else if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) errors.push('VAPID_SUBJECT must be a mailto: address or an https URL');
    else push = { publicKey: vapidPublic, privateKey: vapidPrivate, subject };
  }
  const webSearchKey = source.TAVILY_API_KEY?.trim() || undefined;
  const webSearchBase = source.TAVILY_BASE_URL?.trim() || 'https://api.tavily.com';
  try { const parsed = new URL(webSearchBase); if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) errors.push('TAVILY_BASE_URL must be an https address'); } catch { errors.push('TAVILY_BASE_URL must be a valid URL'); }
  const webSearch = webSearchKey ? { apiKey: webSearchKey, baseUrl: webSearchBase } : undefined;
  const embeddingsKey = source.EMBEDDINGS_API_KEY?.trim() || undefined;
  const embeddingsBase = (source.EMBEDDINGS_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const embeddingsModel = source.EMBEDDINGS_MODEL?.trim() || 'text-embedding-3-small';
  try { const parsed = new URL(embeddingsBase); if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) errors.push('EMBEDDINGS_BASE_URL must be an https address'); } catch { errors.push('EMBEDDINGS_BASE_URL must be a valid URL'); }
  if (embeddingsModel.length > 100 || !/^[\w.:/-]+$/.test(embeddingsModel)) errors.push('EMBEDDINGS_MODEL must be a model identifier');
  const embeddings = embeddingsKey ? { apiKey: embeddingsKey, baseUrl: embeddingsBase, model: embeddingsModel } : undefined;
  const aiModel = source.AI_MODEL?.trim() || (aiProvider === 'anthropic' ? 'claude-sonnet-5-5' : 'gemini-flash-lite-latest');
  if (aiModel.length > 100 || !/^[\w.:-]+$/.test(aiModel)) errors.push('AI_MODEL must be a model identifier');
  const aiBaseUrl = source.AI_BASE_URL?.trim() || (aiProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://generativelanguage.googleapis.com');
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
  const stripeManagedPaymentsRaw = source.STRIPE_MANAGED_PAYMENTS?.trim() || 'false';
  if (stripeManagedPaymentsRaw !== 'true' && stripeManagedPaymentsRaw !== 'false') errors.push('STRIPE_MANAGED_PAYMENTS must be “true” or “false”');
  const stripeManagedPayments = stripeManagedPaymentsRaw === 'true';
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

  return { stripeManagedPayments, aiProvider: aiProvider === 'anthropic' ? 'anthropic' : 'gemini', apiPort, webOrigins, databaseUrl, clerkSecretKey, clerkJwtKey, clerkIssuer, isProduction, trustProxy, apns, rateLimitStore: rateLimitRaw === 'postgres' ? 'postgres' : 'memory', realtimeBus: realtimeRaw === 'postgres' ? 'postgres' : 'memory', monitoring: { errorTrackingDsn, errorTrackingEnvironment: source.ERROR_TRACKING_ENVIRONMENT?.trim() || source.NODE_ENV || 'production', release: source.APP_RELEASE?.trim() || undefined, metricsToken }, storageDriver: storageDriver === 's3' ? 's3' : 'local', s3, storageDir, maxUploadBytes, storageQuotaBytes, aiApiKey, push, webSearch, embeddings, aiModel, aiBaseUrl, aiMonthlyCredits, aiMaxOutputTokens, workflowAllowPrivateWebhooks, emailApiKey, emailFrom, emailBaseUrl, webBaseUrl: webOrigins[0] ?? 'http://localhost:3000', billingPlanOverrides: parsedOverrides.overrides, calendar, stripeSecretKey, stripeWebhookSecret, stripeBaseUrl, stripePrices };
}


/** Which optional integrations are configured, by name only (never a key or other value), for one line in the startup log. */
export function integrationStatus(env: ApiEnvironment): { name: string; on: boolean; needs: string }[] {
  return [
    { name: 'AVEN Intelligence', on: Boolean(env.aiApiKey), needs: env.aiProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_AI_API_KEY' },
    { name: 'Web search', on: Boolean(env.webSearch), needs: 'TAVILY_API_KEY' },
    { name: 'Email', on: Boolean(env.emailApiKey) && !emailSenderWarning(env.emailFrom) && emailSenderKind(env.emailFrom) !== 'invalid', needs: Boolean(env.emailApiKey) && emailSenderKind(env.emailFrom) === 'free_mail' ? 'a sender on a domain verified with Resend (EMAIL_FROM is a free mailbox such as Gmail)' : 'EMAIL_API_KEY and a valid EMAIL_FROM' },
    { name: 'Payments', on: Boolean(env.stripeSecretKey), needs: 'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET' },
    { name: 'Browser push', on: Boolean(env.push), needs: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT' },
    { name: 'iPhone and iPad push', on: Boolean(env.apns), needs: 'APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY' },
    { name: 'Google Calendar', on: Boolean(env.calendar.google && env.calendar.tokenKey), needs: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY' },
    { name: 'Outlook Calendar', on: Boolean(env.calendar.microsoft && env.calendar.tokenKey), needs: 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY' },
    { name: 'Cloud file storage', on: env.storageDriver === 's3', needs: 'STORAGE_DRIVER=s3 with S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (files are kept on this server\'s disk until then)' },
  ];
}


/**
 * Resend only sends from a domain you have verified with it; it cannot send "from" a free mailbox such as Gmail.
 * Returns a plain-English warning when EMAIL_FROM looks like that, so it is flagged at startup instead of failing on the first invitation.
 */
/** What kind of sender EMAIL_FROM is: Resend's restricted testing sender, a free mailbox it can never send from, something that isn't an address, or an address on a domain that has to be verified. */
export function emailSenderKind(from: string | undefined): 'missing' | 'invalid' | 'free_mail' | 'sandbox' | 'custom' {
  if (!from?.trim()) return 'missing';
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return 'invalid';
  const domain = address.split('@')[1].toLowerCase();
  if (domain === 'resend.dev') return 'sandbox';
  return emailSenderWarning(from) ? 'free_mail' : 'custom';
}

export function emailSenderWarning(from: string | undefined): string | undefined {
  const address = from && (/<([^>]+)>/.exec(from)?.[1] ?? from);
  const domain = address?.split('@')[1]?.toLowerCase();
  if (domain && /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|proton|protonmail|aol)\./.test(domain)) return `EMAIL_FROM uses ${domain}, which Resend cannot send from. Verify your own domain at resend.com/domains and use an address on it. While developing, use AVEN <onboarding@resend.dev> (it only delivers to your own Resend account address).`;
  return undefined;
}
