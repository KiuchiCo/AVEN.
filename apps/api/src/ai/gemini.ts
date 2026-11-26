import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { readSse } from './anthropic.js';
import { LlmError, type LlmBlock, type LlmEvent, type LlmMessage, type LlmProvider, type LlmRequest, type LlmTool } from './llm.js';

type Settings = { apiKey: string; model: string; baseUrl: string };
type Part = Record<string, unknown>;

/** Longest one answer may take from start to finish. */
const STREAM_TIMEOUT_MS = 5 * 60_000;

/** Gemini accepts a subset of JSON Schema for tool parameters; anything else (additionalProperties, $schema, patterns…) makes it reject the request. */
const SCHEMA_KEYS = new Set(['type', 'description', 'enum', 'properties', 'required', 'items', 'nullable', 'format', 'minimum', 'maximum', 'minItems', 'maxItems']);
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' && value && typeof value === 'object') out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, geminiSchema(child)]));
    else if (SCHEMA_KEYS.has(key)) out[key] = key === 'items' ? geminiSchema(value) : value;
  }
  return out;
}

/** AVEN's neutral conversation → Gemini "contents". Gemini has no tool-call ids, so a tool result is matched to its call by name. */
export function geminiContents(messages: LlmMessage[]): { role: 'user' | 'model'; parts: Part[] }[] {
  const names = new Map<string, string>();
  for (const message of messages) for (const block of message.content) if (block.type === 'tool_use') names.set(block.id, block.name);
  const part = (block: LlmBlock): Part => {
    if (block.type === 'text') return { text: block.text };
    if (block.type === 'tool_use') return { functionCall: { name: block.name, args: block.input } };
    return { functionResponse: { name: names.get(block.tool_use_id) ?? 'tool', response: block.is_error ? { error: block.content } : { result: block.content } } };
  };
  return messages.map((message) => ({ role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model', parts: message.content.map(part) })).filter((message) => message.parts.length);
}

const declarations = (tools: LlmTool[]) => tools.map((tool) => {
  const parameters = geminiSchema(tool.input_schema) as { properties?: Record<string, unknown> };
  // A tool with no arguments must omit "parameters": Gemini rejects an object schema with no properties.
  return { name: tool.name, description: tool.description, ...(parameters.properties && Object.keys(parameters.properties).length ? { parameters } : {}) };
});

/**
 * Google Gemini API (Generative Language API) over streaming HTTP. Plain fetch, like the other provider, so there is no SDK dependency.
 * The key goes in a header, never the URL, so it can't end up in a log line. No automatic retries: a limit is reported once.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly model: string;

  constructor(private readonly settings: Settings) { this.model = settings.model; }

  async *stream(request: LlmRequest): AsyncGenerator<LlmEvent> {
    const url = `${this.settings.baseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(this.settings.model)}:streamGenerateContent?alt=sse`;
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: geminiContents(request.messages),
      ...(request.tools.length ? { tools: [{ functionDeclarations: declarations(request.tools) }] } : {}),
      generationConfig: { maxOutputTokens: request.maxTokens },
    };
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]) : AbortSignal.timeout(STREAM_TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.settings.apiKey },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      reportIntegrationFailure('gemini', error, { kind: 'network' });
      throw new LlmError('Could not reach the AI provider.', 'network');
    }
    if (!response.ok || !response.body) throw await this.failure(response);

    let inputTokens = 0; let outputTokens = 0; let calls = 0; let finish = '';
    for await (const chunk of readSse(response.body)) {
      const feedback = chunk.promptFeedback as { blockReason?: string } | undefined;
      if (feedback?.blockReason) throw new LlmError('The AI provider declined this request.', 'request');
      const usage = chunk.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
      if (usage) { inputTokens = usage.promptTokenCount ?? inputTokens; outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0); }
      const candidate = (chunk.candidates as { content?: { parts?: Part[] }; finishReason?: string }[] | undefined)?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.thought === true) continue; // the model's private reasoning summary is not part of the answer
        if (typeof part.text === 'string' && part.text) yield { type: 'text', text: part.text };
        const call = part.functionCall as { id?: string; name?: string; args?: unknown } | undefined;
        if (call?.name) {
          const input = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args as Record<string, unknown> : {};
          yield { type: 'tool_use', id: call.id || `call_${++calls}`, name: call.name, input };
        }
      }
      if (candidate?.finishReason) finish = candidate.finishReason;
    }
    yield { type: 'stop', reason: calls ? 'tool_use' : finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn' };
    yield { type: 'usage', inputTokens, outputTokens };
  }

  private async failure(response: Response): Promise<LlmError> {
    const detail = await response.json().catch(() => null) as { error?: { message?: string; status?: string } } | null;
    reportIntegrationFailure('gemini', new Error(`The AI provider answered ${response.status}`), { status: response.status, reason: detail?.error?.status ?? '' });
    const message = detail?.error?.message ?? '';
    // Google answers a bad key with 400 "API key not valid", not 401.
    if (response.status === 401 || response.status === 403 || /api key/i.test(message)) return new LlmError('The AI provider rejected the API key. Check GOOGLE_AI_API_KEY.', 'auth');
    if (response.status === 429) return new LlmError(detail?.error?.status === 'RESOURCE_EXHAUSTED' && /quota/i.test(message)
      ? 'The AI provider’s free-tier quota is used up for now. Try again later, or use a model or plan with more quota.'
      : 'The AI provider is rate limiting requests. Try again shortly.', 'rate_limit');
    if (response.status === 404) return new LlmError(`The AI model “${this.settings.model}” is not available to this key. Set AI_MODEL to a model your Google AI Studio account can use.`, 'request');
    if (response.status >= 500) return new LlmError('The AI provider is unavailable right now. Try again shortly.', 'overloaded');
    return new LlmError(`The AI provider could not process this request${message ? `: ${message.slice(0, 160)}` : '.'}`, 'request');
  }
}
