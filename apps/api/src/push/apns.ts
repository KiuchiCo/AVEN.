import { createPrivateKey, sign } from 'node:crypto';
import http2 from 'node:http2';

export type ApnsConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string; baseUrl?: string };
export type ApnsResult = { status: number; reason?: string };

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' } as const;
const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/**
 * Sends notifications to iPhones and iPads through Apple's push service (APNs), over HTTP/2, signed with the account's .p8 key (a short-lived token).
 * Nothing here is shown or stored beyond what Apple needs: a title, a short body and the screen to open. Failures are returned, never thrown, so one bad device cannot stop the rest.
 */
export class ApnsClient {
  private token: { value: string; issuedAt: number } | null = null;
  constructor(private readonly config: ApnsConfig, private readonly timeoutMs = 10_000) {}

  /** The signed token Apple asks for. It is reused for 40 minutes (Apple wants it refreshed between 20 and 60). */
  providerToken(now = Date.now()): string {
    if (this.token && now - this.token.issuedAt < 40 * 60_000) return this.token.value;
    const header = b64(JSON.stringify({ alg: 'ES256', kid: this.config.keyId }));
    const claims = b64(JSON.stringify({ iss: this.config.teamId, iat: Math.floor(now / 1000) }));
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: createPrivateKey(this.config.privateKey), dsaEncoding: 'ieee-p1363' });
    this.token = { value: `${header}.${claims}.${b64(signature)}`, issuedAt: now };
    return this.token.value;
  }

  send(deviceToken: string, environment: 'development' | 'production', payload: object): Promise<ApnsResult> {
    if (!/^[0-9a-f]{32,200}$/i.test(deviceToken)) return Promise.resolve({ status: 400, reason: 'BadDeviceToken' });
    const base = this.config.baseUrl ?? HOSTS[environment === 'development' ? 'development' : 'production'];
    return new Promise((resolve) => {
      let done = false; let session: http2.ClientHttp2Session | undefined;
      const finish = (result: ApnsResult) => { if (done) return; done = true; clearTimeout(timer); session?.close(); resolve(result); };
      const timer = setTimeout(() => { session?.destroy(); finish({ status: 0, reason: 'Timeout' }); }, this.timeoutMs);
      try {
        session = http2.connect(base);
        session.on('error', () => finish({ status: 0, reason: 'ConnectionFailed' }));
        const request = session.request({ ':method': 'POST', ':path': `/3/device/${deviceToken}`, authorization: `bearer ${this.providerToken()}`, 'apns-topic': this.config.bundleId, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), 'content-type': 'application/json' });
        let status = 0; let body = '';
        request.on('response', (headers) => { status = Number(headers[':status'] ?? 0); });
        request.setEncoding('utf8'); request.on('data', (chunk: string) => { if (body.length < 2000) body += chunk; });
        request.on('end', () => { let reason: string | undefined; try { reason = (JSON.parse(body) as { reason?: string }).reason; } catch { /* no body on success */ } finish({ status, reason }); });
        request.on('error', () => finish({ status: 0, reason: 'RequestFailed' }));
        request.end(JSON.stringify(payload));
      } catch { finish({ status: 0, reason: 'ConnectionFailed' }); }
    });
  }
}

/** The notification as the app receives it: what to show, and the screen a tap opens (checked again by the app before it opens anything). */
export function apnsPayload(message: { title: string; body: string; path: string; thread: string }) {
  return { aps: { alert: { title: message.title.slice(0, 80), body: message.body.slice(0, 180) }, sound: 'default', 'thread-id': message.thread.slice(0, 64) }, path: message.path };
}

/** A device whose token Apple says is no longer valid (app deleted, token replaced) is forgotten. */
export const isDeadToken = (result: ApnsResult) => result.status === 410 || (result.status === 400 && result.reason === 'BadDeviceToken') || (result.status === 400 && result.reason === 'DeviceTokenNotForTopic');
