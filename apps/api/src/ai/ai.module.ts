import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { ProductivityModule } from '../productivity/productivity.module.js';
import { AnthropicProvider } from './anthropic.js';
import { AiAgentsService } from './ai-agents.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AI_SETTINGS, LLM_PROVIDER, WEB_SEARCH } from './tokens.js';
import { TavilyWebSearch } from './web-search.js';
import { GeminiProvider } from './gemini.js';

@Module({
  imports: [ProductivityModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiAgentsService,
    ClerkAuthGuard,
    // To use another provider, return a different LlmProvider here.
    { provide: LLM_PROVIDER, useFactory: () => { const { aiProvider, aiApiKey, aiModel, aiBaseUrl } = readApiEnvironment(); if (!aiApiKey) return null; const settings = { apiKey: aiApiKey, model: aiModel, baseUrl: aiBaseUrl }; return aiProvider === 'anthropic' ? new AnthropicProvider(settings) : new GeminiProvider(settings); } },
    { provide: WEB_SEARCH, useFactory: () => { const { webSearch } = readApiEnvironment(); return webSearch ? new TavilyWebSearch(webSearch) : null; } },
    { provide: AI_SETTINGS, useFactory: () => { const { aiModel, aiMonthlyCredits, aiMaxOutputTokens } = readApiEnvironment(); return { model: aiModel, monthlyCredits: aiMonthlyCredits, maxOutputTokens: aiMaxOutputTokens }; } },
  ],
  exports: [LLM_PROVIDER, AI_SETTINGS],
})
export class AiModule {}
