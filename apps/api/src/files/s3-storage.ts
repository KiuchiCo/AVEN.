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

  private async send(method: string, key: string, body?: Buffer) {
    if (/\0/.test(key) || key.split('/').includes('..')) throw new Error('Invalid storage key.');
    const path = `${this.base.pathname.replace(/\/$/, '')}/${this.config.bucket}/${encodePath(key)}`;
    const headers = signV4({ method, host: this.base.host, path, payloadHash: sha256(body ?? ''), region: this.config.region, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, now: new Date() });
    // A stalled object store must not hold an upload or a download open for ever: writes get two minutes, a read ten (it covers streaming the whole file).
    const signal = AbortSignal.timeout(method === 'GET' ? 10 * 60_000 : 2 * 60_000);
    try {
      const response = await this.fetcher(`${this.base.origin}${path}`, { method, headers, body: body ? new Uint8Array(body) : undefined, signal });
      if (!response.ok && response.status !== 404) reportIntegrationFailure('s3', new Error(`Object storage answered ${response.status}`), { status: response.status, method });
      return response;
    } catch (error) { reportIntegrationFailure('s3', error, { kind: 'network', method }); throw error; }
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
    if (!response.ok) throw new Error(`Object storage rejected the upload (${response.status}).`);
    return { size, checksum: sha256(body) };
  }

  async get(key: string) {
    const response = await this.send('GET', key);
    if (response.status === 404) throw new NotFoundException('File not found.');
    if (!response.ok || !response.body) throw new Error(`Object storage read failed (${response.status}).`);
    const size = Number(response.headers.get('content-length') ?? 0);
    return { stream: Readable.fromWeb(response.body as never), size };
  }

  async delete(key: string) {
    const response = await this.send('DELETE', key);
    if (!response.ok && response.status !== 404) throw new Error(`Object storage delete failed (${response.status}).`);
  }
}
