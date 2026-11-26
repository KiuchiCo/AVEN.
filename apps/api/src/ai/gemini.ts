import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { readSse } from './anthropic.js';
import { LlmError, type LlmBlock, type LlmEvent, type LlmMessage, type LlmProvider, type LlmRequest, type LlmTool } from './llm.js';

type Settings = { apiKey: string; model: string; baseUrl: string; /** How long a silent connection is waited for before giving up (tests shorten it). */ idleMs?: number };
type Part = Record<string, unknown>;

/** Longest one answer may take from start to finish. */
const STREAM_TIMEOUT_MS = 5 * 60_000;
/** Longest the provider may stay silent (before the first word, or between chunks) before AVEN stops waiting. Gemini sometimes accepts a request and then says nothing. */
const IDLE_MS = 45_000;

/** Gemini accepts a subset of JSON Schema for tool parameters; anything else (additionalProperties, $schema, patterns…) makes it reject the request. */
const SCHEMA_KEYS = new Set(['type', 'description', 'enum', 'properties', 'required', 'items', 'nullable', 'format', 'minimum', 'maximum', 'minItems', 'maxItems']);
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' && value && typeof value === 'object') out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, geminiSchema(child)]));
    else if (key === 'type' && Array.isArray(value)) {
      // JSON Schema allows ["string", "null"]; Gemini wants one type plus nullable: true.
      const types = value.filter((entry) => entry !== 'null');
      if (types.length === 1) out.type = types[0];
      if (types.length !== value.length) out.nullable = true;
    }
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
    // Gemini refuses the next step of a tool conversation unless the call comes back with the signature it was given.
    if (block.type === 'tool_use') return { functionCall: { name: block.name, args: block.input }, ...(block.signature ? { thoughtSignature: block.signature } : {}) };
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
    const idleMs = this.settings.idleMs ?? IDLE_MS;
    const stall = new AbortController(); let stalled = false; let timer: NodeJS.Timeout | undefined;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; stall.abort(); }, idleMs); };
    const stalledError = () => { reportIntegrationFailure('gemini', new Error('The AI provider stopped responding'), { kind: 'idle' }); return new LlmError('The AI provider stopped responding. Try again in a moment.', 'overloaded'); };
    const signal = AbortSignal.any([stall.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS), ...(request.signal ? [request.signal] : [])]);
    let response: Response;
    arm();
    try {
      response = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': this.settings.apiKey }, body: JSON.stringify(body) });
    } catch (error) {
      clearTimeout(timer);
      if (stalled) throw stalledError();
      if ((error as Error).name === 'AbortError') throw error;
      reportIntegrationFailure('gemini', error, { kind: 'network' });
      throw new LlmError('Could not reach the AI provider.', 'network');
    }
    if (!response.ok || !response.body) { clearTimeout(timer); throw await this.failure(response); }

    let inputTokens = 0; let outputTokens = 0; let toolCalls = 0; let finish = ''; let wrote = false;
    try {
      for await (const chunk of readSse(response.body)) {
        arm();
        const feedback = chunk.promptFeedback as { blockReason?: string } | undefined;
        if (feedback?.blockReason) throw new LlmError('The AI provider declined this request.', 'request');
        const usage = chunk.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
        if (usage) { inputTokens = usage.promptTokenCount ?? inputTokens; outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0); }
        const candidate = (chunk.candidates as { content?: { parts?: Part[] }; finishReason?: string }[] | undefined)?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.thought === true) continue; // the model's private reasoning summary is not part of the answer
          if (typeof part.text === 'string' && part.text) { wrote = true; yield { type: 'text', text: part.text }; }
          const call = part.functionCall as { id?: string; name?: string; args?: unknown } | undefined;
          if (call?.name) {
            const input = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args as Record<string, unknown> : {};
            toolCalls += 1;
            yield { type: 'tool_use', id: call.id || `call_${toolCalls}`, name: call.name, input, ...(typeof part.thoughtSignature === 'string' ? { signature: part.thoughtSignature } : {}) };
          }
        }
        if (candidate?.finishReason) finish = candidate.finishReason;
      }
    } catch (error) {
      if (stalled) throw stalledError();
      throw error;
    } finally { clearTimeout(timer); }
    // An answer that is empty because Gemini declined it (safety, recitation…) is reported as that, not shown as a blank answer.
    if (!wrote && !toolCalls && /^(SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY)/.test(finish)) throw new LlmError('The AI provider declined to answer this.', 'request');
    yield { type: 'stop', reason: toolCalls ? 'tool_use' : finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn' };
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
