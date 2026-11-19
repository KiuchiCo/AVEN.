import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress } from './workflow-rules.js';

/** `retry` failures are worth trying again (the other side is down or busy); `permanent` ones will not improve. */
export class WebhookError extends Error {
  constructor(message: string, readonly retry: boolean) { super(message); }
}

const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * POSTs JSON to a webhook. The address the name resolves to is checked at connection time and the connection
 * uses exactly that address, so a hostname that later points somewhere internal (DNS rebinding) cannot be reached.
 * Redirects are not followed.
 */
export function sendWebhook(url: URL, body: string, options: { allowPrivate: boolean; timeoutMs?: number }): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    // Node skips the DNS hook when the host is already an IP address, so those are checked here.
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (!options.allowPrivate && isIP(literal) && !isPublicAddress(literal)) return reject(new WebhookError('The webhook address points to an internal network, which is not allowed.', false));
    const secure = url.protocol === 'https:';
    const request = (secure ? https : http).request({
      method: 'POST', hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || (secure ? 443 : 80), path: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'user-agent': 'AVEN-Workflows/1.0' },
      timeout: options.timeoutMs ?? 10_000,
      lookup: (hostname, lookupOptions, callback) => {
        dnsLookup(hostname, { all: true }).then((addresses) => {
          const allowed = options.allowPrivate ? addresses : addresses.filter((entry) => isPublicAddress(entry.address));
          if (!allowed.length) return callback(new WebhookError('The webhook address points to an internal network, which is not allowed.', false) as never, '' as never, 4 as never);
          if ((lookupOptions as { all?: boolean }).all) callback(null, allowed as never, undefined as never);
          else callback(null, allowed[0].address, allowed[0].family);
        }, (error: Error) => callback(error as never, '' as never, 4 as never));
      },
    }, (response) => {
      let received = 0;
      response.on('data', (chunk: Buffer) => { received += chunk.length; if (received > MAX_RESPONSE_BYTES) response.destroy(); });
      response.on('close', () => {
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve({ status });
        else reject(new WebhookError(`The webhook answered with HTTP ${status}.`, status === 429 || status >= 500 || status === 408));
      });
    });
    request.on('timeout', () => request.destroy(new WebhookError('The webhook did not answer in time.', true)));
    request.on('error', (error) => {
      if (error instanceof WebhookError) return reject(error);
      const code = (error as NodeJS.ErrnoException).code;
      reject(new WebhookError(code === 'ENOTFOUND' ? 'The webhook address could not be found.' : 'The webhook could not be reached.', code !== 'ENOTFOUND' && code !== 'ERR_TLS_CERT_ALTNAME_INVALID'));
    });
    request.end(body);
  });
}
