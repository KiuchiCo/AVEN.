export type ApiEnvironment = {
  apiPort: number;
  webOrigins: string[];
  databaseUrl: string;
  clerkSecretKey?: string;
  clerkJwtKey?: string;
  clerkIssuer?: string;
  isProduction: boolean;
  storageDriver: 'local';
  storageDir: string;
  maxUploadBytes: number;
  storageQuotaBytes: number;
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
  const clerkIssuer = source.CLERK_ISSUER?.trim() || undefined;
  if (clerkJwtKey && !clerkJwtKey.startsWith('-----BEGIN PUBLIC KEY-----')) errors.push('CLERK_JWT_KEY must be a PEM public key');
  if ((clerkSecretKey || clerkJwtKey) && !clerkIssuer) errors.push('CLERK_ISSUER is required when Clerk verification credentials are configured');

  const storageDriver = source.STORAGE_DRIVER?.trim() || 'local';
  if (storageDriver !== 'local') errors.push('STORAGE_DRIVER must be “local” (object-storage drivers are not available yet)');
  const byteSetting = (name: string, fallback: number, max: number) => {
    const raw = source[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) { errors.push(`${name} must be a whole number of bytes between 1 and ${max}`); return fallback; }
    return value;
  };
  const maxUploadBytes = byteSetting('MAX_UPLOAD_BYTES', 25 * 1024 * 1024, 500 * 1024 * 1024);
  const storageQuotaBytes = byteSetting('WORKSPACE_STORAGE_QUOTA_BYTES', 500 * 1024 * 1024, 10 * 1024 ** 4);
  const storageDir = source.STORAGE_DIR?.trim() || '.storage';

  const isProduction = source.NODE_ENV === 'production';
  if (isProduction && (!clerkIssuer || (!clerkSecretKey && !clerkJwtKey))) errors.push('production requires CLERK_ISSUER and a Clerk verification key');
  if (errors.length) throw new Error(`Invalid API environment: ${errors.join('; ')}.`);

  return { apiPort, webOrigins, databaseUrl, clerkSecretKey, clerkJwtKey, clerkIssuer, isProduction, storageDriver: 'local', storageDir, maxUploadBytes, storageQuotaBytes };
}
