/**
 * Provider-neutral model interface. AVEN stores conversations in these shapes, so switching provider
 * means writing one class that implements LlmProvider; nothing else changes.
 */
export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; /** An opaque marker some providers (Gemini) require to see again when the tool result is sent back. Stored with the turn and passed through untouched. */ signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type LlmMessage = { role: 'user' | 'assistant'; content: LlmBlock[] };
export type LlmTool = { name: string; description: string; input_schema: Record<string, unknown> };

export type LlmEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; signature?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'stop'; reason: string };

export type LlmRequest = { system: string; messages: LlmMessage[]; tools: LlmTool[]; maxTokens: number; signal?: AbortSignal };

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  stream(request: LlmRequest): AsyncIterable<LlmEvent>;
}

/** A provider failure with a message that is safe to show to a member. */
export class LlmError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'rate_limit' | 'overloaded' | 'request' | 'network' | 'unknown') {
    super(message);
  }
}
