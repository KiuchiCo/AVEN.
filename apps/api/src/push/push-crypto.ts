import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64 = (data: Buffer) => data.toString('base64url');
const fromB64 = (value: string) => Buffer.from(value, 'base64url');

export type VapidKeys = { publicKey: string; privateKey: string };

/** A new P-256 key pair in the URL-safe base64 form browsers and push services use. */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  return { publicKey: b64(ecdh.getPublicKey()), privateKey: b64(ecdh.getPrivateKey()) };
}

/** `Authorization` and `Crypto-Key`-free VAPID header (RFC 8292, "vapid t=…, k=…"). The token is valid for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = new Date()): string {
  const publicKey = fromB64(keys.publicKey);
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64(publicKey.subarray(1, 33)), y: b64(publicKey.subarray(33, 65)), d: keys.privateKey } });
  const header = b64(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypts a push payload for one browser subscription (RFC 8291, `aes128gcm`, a single record).
 * `ephemeral` and `salt` exist so tests can be deterministic; production always uses fresh random ones.
 */
export function encryptPayload(payload: Buffer, subscription: { p256dh: string; auth: string }, options: { ephemeral?: ReturnType<typeof createECDH>; salt?: Buffer } = {}): Buffer {
  if (payload.length > 3993) throw new Error('Push payload is too large.');
  const userPublic = fromB64(subscription.p256dh); const authSecret = fromB64(subscription.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 4 || authSecret.length !== 16) throw new Error('Invalid push subscription keys.');
  const ephemeral = options.ephemeral ?? (() => { const e = createECDH('prime256v1'); e.generateKeys(); return e; })();
  const serverPublic = ephemeral.getPublicKey();
  const salt = options.salt ?? randomBytes(16);
  const shared = ephemeral.computeSecret(userPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), userPublic, serverPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, encrypted]);
}
