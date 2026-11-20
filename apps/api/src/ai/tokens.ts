import type { LlmProvider } from './llm.js';
import type { WebSearch } from './web-search.js';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const WEB_SEARCH = Symbol('WEB_SEARCH');
export type OptionalWebSearch = WebSearch | null;
export const AI_SETTINGS = Symbol('AI_SETTINGS');
export type AiSettings = { model: string; monthlyCredits: number; maxOutputTokens: number };
export type OptionalProvider = LlmProvider | null;
