import { reportIntegrationFailure } from '../observability/error-reporter.js';
export type WebResult = { title: string; url: string; snippet: string };
export interface WebSearch { search(query: string): Promise<WebResult[]> }
export type WebSearchConfig = { apiKey: string; baseUrl: string };

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Brave Search API (GET /res/v1/web/search with an X-Subscription-Token). Only the configured search endpoint is ever
 * contacted; result links are returned as text and never fetched, so a result can't point the server at an internal host.
 */
export class BraveWebSearch implements WebSearch {
  constructor(private readonly config: WebSearchConfig, private readonly fetcher: typeof fetch = fetch) {}

  async search(query: string): Promise<WebResult[]> {
    const url = new URL('/res/v1/web/search', this.config.baseUrl);
    url.searchParams.set('q', query); url.searchParams.set('count', '6'); url.searchParams.set('safesearch', 'moderate');
    const response = await this.fetcher(url, { headers: { accept: 'application/json', 'x-subscription-token': this.config.apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { reportIntegrationFailure('web-search', new Error(`Web search failed (${response.status}).`), { status: response.status }); throw new Error(`Web search failed (${response.status}).`); }
    const results = ((await response.json()) as { web?: { results?: Record<string, unknown>[] } }).web?.results ?? [];
    return results.flatMap((item) => {
      const link = typeof item.url === 'string' ? item.url : '';
      if (!/^https?:\/\//i.test(link)) return [];
      return [{ title: clean(item.title, 150), url: link.slice(0, 300), snippet: clean(item.description, 300) }];
    }).slice(0, 6);
  }
}
