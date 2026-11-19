import { LlmError, type LlmEvent, type LlmProvider, type LlmRequest } from './llm.js';

type Settings = { apiKey: string; model: string; baseUrl: string };

/** Splits a server-sent-events byte stream into parsed `data:` JSON payloads. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        try { yield JSON.parse(data) as Record<string, unknown>; } catch { /* ignore a malformed frame */ }
      }
    }
  } finally { reader.releaseLock(); }
}

/** Anthropic Messages API over streaming HTTP. Uses plain fetch, so there is no SDK dependency. */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(private readonly settings: Settings) { this.model = settings.model; }

  async *stream(request: LlmRequest): AsyncGenerator<LlmEvent> {
    let response: Response;
    try {
      response = await fetch(`${this.settings.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': this.settings.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.settings.model, max_tokens: request.maxTokens, system: request.system, messages: request.messages, tools: request.tools.length ? request.tools : undefined, stream: true }),
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new LlmError('Could not reach the AI provider.', 'network');
    }
    if (!response.ok || !response.body) throw await this.failure(response);

    const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const event of readSse(response.body)) {
      switch (event.type) {
        case 'message_start': {
          const usage = (event.message as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined)?.usage;
          inputTokens = usage?.input_tokens ?? 0; outputTokens = usage?.output_tokens ?? 0;
          break;
        }
        case 'content_block_start': {
          const block = event.content_block as { type: string; id?: string; name?: string };
          blocks.set(event.index as number, { type: block.type, id: block.id, name: block.name, json: '' });
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === 'text_delta' && delta.text) yield { type: 'text', text: delta.text };
          else if (delta.type === 'input_json_delta') { const block = blocks.get(event.index as number); if (block) block.json += delta.partial_json ?? ''; }
          break;
        }
        case 'content_block_stop': {
          const block = blocks.get(event.index as number);
          if (block?.type === 'tool_use' && block.id && block.name) {
            let input: Record<string, unknown> = {};
            try { const parsed = block.json ? JSON.parse(block.json) : {}; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed; } catch { /* a tool call with unreadable input is run with empty input and rejected by validation */ }
            yield { type: 'tool_use', id: block.id, name: block.name, input };
          }
          blocks.delete(event.index as number);
          break;
        }
        case 'message_delta': {
          const usage = event.usage as { output_tokens?: number } | undefined;
          if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
          const reason = (event.delta as { stop_reason?: string } | undefined)?.stop_reason;
          if (reason) yield { type: 'stop', reason };
          break;
        }
        case 'error': {
          const error = event.error as { type?: string } | undefined;
          throw new LlmError(error?.type === 'overloaded_error' ? 'The AI provider is overloaded. Try again shortly.' : 'The AI provider reported an error.', error?.type === 'overloaded_error' ? 'overloaded' : 'unknown');
        }
        default: break;
      }
    }
    yield { type: 'usage', inputTokens, outputTokens };
  }

  private async failure(response: Response): Promise<LlmError> {
    if (response.status === 401 || response.status === 403) return new LlmError('The AI provider rejected the API key. Check ANTHROPIC_API_KEY.', 'auth');
    if (response.status === 429) return new LlmError('The AI provider is rate limiting requests. Try again shortly.', 'rate_limit');
    if (response.status === 529 || response.status >= 500) return new LlmError('The AI provider is unavailable right now. Try again shortly.', 'overloaded');
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    return new LlmError(`The AI provider could not process this request${detail?.error?.message ? `: ${detail.error.message.slice(0, 160)}` : '.'}`, 'request');
  }
}
