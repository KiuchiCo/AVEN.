import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64 = (buffer: Buffer) => buffer.toString('base64url');

/** AES-256-GCM. The result is `v1.<iv>.<tag>.<ciphertext>`; changing any part makes decryption fail. */
export function encryptToken(key: Buffer, plain: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(body)}`;
}

export function decryptToken(key: Buffer, stored: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unrecognised token format.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** The state is signed with a key derived from the token key, so one secret is never used for two different jobs (encrypting tokens and signing links). */
const stateKey = (key: Buffer) => createHmac('sha256', key).update('aven-oauth-state-v1').digest();

export type OAuthState = { workspaceId: string; userId: string; provider: 'GOOGLE' | 'MICROSOFT'; pushEnabled: boolean };

/** The `state` carried through the provider's sign-in page: who started it, for which workspace, signed so it can't be forged, valid for 10 minutes. */
export function signState(key: Buffer, state: OAuthState, now = Date.now()): string {
  const payload = b64(Buffer.from(JSON.stringify({ ...state, exp: now + 10 * 60_000, n: randomBytes(8).toString('hex') })));
  return `${payload}.${b64(createHmac('sha256', stateKey(key)).update(payload).digest())}`;
}

export function verifyState(key: Buffer, value: string, now = Date.now()): OAuthState | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', stateKey(key)).update(payload).digest(); const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState & { exp: number };
    if (typeof data.exp !== 'number' || data.exp < now || (data.provider !== 'GOOGLE' && data.provider !== 'MICROSOFT') || typeof data.workspaceId !== 'string' || typeof data.userId !== 'string') return null;
    return { workspaceId: data.workspaceId, userId: data.userId, provider: data.provider, pushEnabled: data.pushEnabled === true };
  } catch { return null; }
}
