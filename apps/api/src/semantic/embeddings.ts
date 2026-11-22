import { reportIntegrationFailure } from '../observability/error-reporter.js';
export interface Embeddings { readonly model: string; embed(texts: string[]): Promise<number[][]> }
export type EmbeddingsConfig = { apiKey: string; baseUrl: string; model: string };

/**
 * Any OpenAI-compatible embeddings endpoint (POST {base}/embeddings with { model, input }): OpenAI, Voyage, Mistral, a local server.
 * Only the configured endpoint is contacted. Vectors are checked so a bad reply can never be stored.
 */
export class OpenAiCompatibleEmbeddings implements Embeddings {
  constructor(private readonly config: EmbeddingsConfig, private readonly fetcher: typeof fetch = fetch) {}
  get model() { return this.config.model; }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const response = await this.fetcher(`${this.config.baseUrl}/embeddings`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model, input: texts }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) { reportIntegrationFailure('embeddings', new Error(`The embeddings provider answered ${response.status}.`), { status: response.status }); throw new Error(`The embeddings provider answered ${response.status}.`); }
    const data = ((await response.json()) as { data?: { index?: number; embedding?: unknown }[] }).data;
    if (!Array.isArray(data) || data.length !== texts.length) throw new Error('The embeddings provider returned an unexpected reply.');
    const vectors = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
    const size = Array.isArray(vectors[0]) ? vectors[0].length : 0;
    if (!size || vectors.some((vector) => !Array.isArray(vector) || vector.length !== size || vector.some((n) => typeof n !== 'number' || !Number.isFinite(n)))) throw new Error('The embeddings provider returned unusable vectors.');
    return vectors as number[][];
  }
}
