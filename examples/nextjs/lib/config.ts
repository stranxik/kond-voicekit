/**
 * VoiceKit Example Configuration
 * Reads environment variables and provides typed config
 *
 * Note: Next.js requires static access to env vars (no dynamic keys)
 */

import type { LLMProvider } from "./llm-providers";

export interface AppConfig {
  voicekit: {
    apiKey: string;
    isConfigured: boolean;
  };
  llm: {
    provider: LLMProvider;
    apiKey: string;
    ollamaUrl: string;
    model: string;
    isConfigured: boolean;
  };
}

export function getConfig(): AppConfig {
  // Next.js requires static access to NEXT_PUBLIC_ vars (no dynamic keys)
  const voicekitApiKey = process.env.NEXT_PUBLIC_VOICEKIT_API_KEY || "";
  const llmProvider = (process.env.NEXT_PUBLIC_LLM_PROVIDER || "echo") as LLMProvider;
  const anthropicApiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";
  const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "";
  const ollamaUrl = process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434";
  const llmModel = process.env.NEXT_PUBLIC_LLM_MODEL || "";

  // Determine which API key to use based on provider
  let llmApiKey = "";
  let llmIsConfigured = false;

  switch (llmProvider) {
    case "claude":
      llmApiKey = anthropicApiKey;
      llmIsConfigured = !!anthropicApiKey;
      break;
    case "openai":
      llmApiKey = openaiApiKey;
      llmIsConfigured = !!openaiApiKey;
      break;
    case "ollama":
      llmIsConfigured = true; // Ollama doesn't need API key
      break;
    case "echo":
      llmIsConfigured = true; // Echo mode always works
      break;
  }

  return {
    voicekit: {
      apiKey: voicekitApiKey,
      isConfigured: !!voicekitApiKey,
    },
    llm: {
      provider: llmProvider,
      apiKey: llmApiKey,
      ollamaUrl,
      model: llmModel,
      isConfigured: llmIsConfigured,
    },
  };
}

export function getProviderDisplayName(provider: LLMProvider): string {
  switch (provider) {
    case "claude":
      return "Claude";
    case "openai":
      return "OpenAI";
    case "ollama":
      return "Ollama";
    case "echo":
      return "Echo";
    default:
      return provider;
  }
}
