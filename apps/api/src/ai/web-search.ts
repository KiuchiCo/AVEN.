import { reportIntegrationFailure } from '../observability/error-reporter.js';
export type WebResult = { title: string; url: string; snippet: string };
export interface WebSearch { search(query: string): Promise<WebResult[]> }
export type WebSearchConfig = { apiKey: string; baseUrl: string };

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Raised for a limit the member can be told about (the message is safe to show). */
export class WebSearchError extends Error {}

/**
 * Tavily Search API (POST /search, Bearer key). Only the configured endpoint is ever contacted; result links are returned as text
 * and never fetched, so a result can't point the server at an internal host. Results are third-party text and are labelled as such to the model.
 * No retries: a limit is reported once rather than spending more of a free quota.
 */
export class TavilyWebSearch implements WebSearch {
  constructor(private readonly config: WebSearchConfig, private readonly fetcher: typeof fetch = fetch) {}

  async search(query: string): Promise<WebResult[]> {
    let response: Response;
    try {
      response = await this.fetcher(new URL('/search', this.config.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ query: query.slice(0, 400), max_results: 6, search_depth: 'basic', include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      reportIntegrationFailure('web-search', error, { kind: 'network' });
      throw new WebSearchError('Web search could not be reached.');
    }
    if (!response.ok) {
      reportIntegrationFailure('web-search', new Error(`Web search failed (${response.status}).`), { status: response.status });
      // 429 is a rate limit; 432 and 433 are Tavily's plan and pay-as-you-go limits (the free monthly credits are used up).
      if (response.status === 429 || response.status === 432 || response.status === 433) throw new WebSearchError('Web search has reached its usage limit for now.');
      if (response.status === 401 || response.status === 403) throw new WebSearchError('Web search rejected the API key. Check TAVILY_API_KEY.');
      throw new WebSearchError(`Web search failed (${response.status}).`);
    }
    const results = ((await response.json()) as { results?: Record<string, unknown>[] }).results ?? [];
    return results.flatMap((item) => {
      const link = typeof item.url === 'string' ? item.url : '';
      if (!/^https?:\/\//i.test(link)) return [];
      return [{ title: clean(item.title, 150), url: link.slice(0, 300), snippet: clean(item.content, 300) }];
    }).slice(0, 6);
  }
}
