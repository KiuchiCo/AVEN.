import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { formatBytes } from './file-rules.js';
import type { StorageDriver } from './storage.js';

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Defaults to AWS. Set for R2, MinIO, Spaces, Backblaze and other S3-compatible stores. */
  endpoint?: string;
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const encodePath = (key: string) => key.split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

/** AWS Signature Version 4 for a request with no query string. Exported so it can be checked against AWS's published vectors. */
export function signV4(input: { method: string; host: string; path: string; payloadHash: string; region: string; accessKeyId: string; secretAccessKey: string; now: Date; service?: string }) {
  const service = input.service ?? 's3';
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: input.host, 'x-amz-content-sha256': input.payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const canonical = [input.method, input.path, '', ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), input.payloadHash].join('\n');
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/**
 * S3-compatible object storage using plain `fetch` and SigV4 (no SDK), path-style addressing.
 * shortcut: uploads are buffered in memory (bounded by the upload limit) and sent as a single PUT; use multipart if limits grow past ~100 MB.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly base: URL;

  constructor(private readonly config: S3Config, private readonly fetcher: typeof fetch = fetch) {
    this.base = new URL(config.endpoint ?? `https://s3.${config.region}.amazonaws.com`);
  }

  /** One signed request, tried up to three times when the store is busy or unreachable (the three operations are all safe to repeat). */
  private async send(method: string, key: string, body?: Buffer) {
    if (/\0/.test(key) || key.split('/').includes('..')) throw new Error('Invalid storage key.');
    const path = `${this.base.pathname.replace(/\/$/, '')}/${this.config.bucket}/${encodePath(key)}`;
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
      const headers = signV4({ method, host: this.base.host, path, payloadHash: sha256(body ?? ''), region: this.config.region, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, now: new Date() });
      // A stalled object store must not hold an upload or a download open for ever: writes get two minutes, a read ten (it covers streaming the whole file).
      const signal = AbortSignal.timeout(method === 'GET' ? 10 * 60_000 : 2 * 60_000);
      try {
        const response = await this.fetcher(`${this.base.origin}${path}`, { method, headers, body: body ? new Uint8Array(body) : undefined, signal });
        if (response.status === 429 || response.status >= 500) { last = response; await response.body?.cancel().catch(() => undefined); continue; }
        if (!response.ok && response.status !== 404) reportIntegrationFailure('s3', new Error(`Object storage answered ${response.status}`), { status: response.status, method });
        return response;
      } catch (error) { last = error; }
    }
    if (last instanceof Response) { reportIntegrationFailure('s3', new Error(`Object storage answered ${last.status}`), { status: last.status, method }); return last; }
    reportIntegrationFailure('s3', last, { kind: 'network', method });
    throw new Error('Object storage could not be reached.');
  }

  /** Turns a refusal into a message that says what to fix. The store's own error code (in the XML body) tells a bad key from a missing bucket. */
  private async failure(response: Response, action: string): Promise<Error> {
    const code = /<Code>([^<]+)<\/Code>/.exec(await response.text().catch(() => ''))?.[1] ?? '';
    if (response.status === 401 || response.status === 403) return new Error(`Object storage refused AVEN’s credentials (${code || response.status}). Check S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and that the key can write to the bucket.`);
    if (code === 'NoSuchBucket') return new Error(`Object storage has no bucket named “${this.config.bucket}”. Check S3_BUCKET and S3_ENDPOINT.`);
    return new Error(`Object storage ${action} failed (${response.status}).`);
  }

  /** Writes, reads back and removes one small unique object, to prove the credentials, bucket and endpoint work. Touches nothing else in the bucket. */
  async check(): Promise<void> {
    const key = `.aven-storage-check/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const content = Buffer.from('aven storage check');
    await this.put(key, Readable.from([content]), 1024);
    try {
      const { stream } = await this.get(key); const read: Buffer[] = []; for await (const chunk of stream) read.push(Buffer.from(chunk as Buffer));
      if (!Buffer.concat(read).equals(content)) throw new Error('Object storage returned different content than was written.');
    } finally { await this.delete(key); }
  }

  async put(key: string, source: Readable, maxBytes: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) { source.destroy(); throw new PayloadTooLargeException(`Files can be up to ${formatBytes(maxBytes)}.`); }
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks);
    const response = await this.send('PUT', key, body);
    if (!response.ok) throw await this.failure(response, 'upload');
    return { size, checksum: sha256(body) };
  }

  async get(key: string) {
    const response = await this.send('GET', key);
    if (response.status === 404) throw new NotFoundException('File not found.');
    if (!response.ok || !response.body) throw await this.failure(response, 'read');
    const size = Number(response.headers.get('content-length') ?? 0);
    return { stream: Readable.fromWeb(response.body as never), size };
  }

  async delete(key: string) {
    const response = await this.send('DELETE', key);
    if (!response.ok && response.status !== 404) throw await this.failure(response, 'delete');
  }
}
