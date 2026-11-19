import type { LlmProvider } from './llm.js';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const AI_SETTINGS = Symbol('AI_SETTINGS');
export type AiSettings = { model: string; monthlyCredits: number; maxOutputTokens: number };
export type OptionalProvider = LlmProvider | null;
