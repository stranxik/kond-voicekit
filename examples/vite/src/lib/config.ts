/**
 * VoiceKit Example Configuration
 * Reads environment variables and provides typed config
 */

import type { LLMProvider } from "./llm-providers";

export type Locale = "fr" | "en" | "multi";
export type TurnDetectorType = "auto" | "local" | "cloud" | "heuristic";

export interface AppConfig {
  voicekit: {
    apiKey: string;
    voiceId: string;
    locale: Locale;
    turnDetectorType: TurnDetectorType;
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

function getEnv(key: string, fallback = ""): string {
  // Cast to unknown first then to Record for dynamic key access
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return env[`VITE_${key}`] || fallback;
}

export function getConfig(): AppConfig {
  const voicekitApiKey = getEnv("VOICEKIT_API_KEY");
  const voiceIdRaw = getEnv("ELEVENLABS_VOICE_ID");
  const localeRaw = getEnv("LOCALE", "en");
  const turnDetectorRaw = getEnv("TURN_DETECTOR", "auto");
  const llmProvider = (getEnv("LLM_PROVIDER", "echo") as LLMProvider);

  // Validate locale
  const validLocales = ["fr", "en", "multi"] as const;
  const locale: Locale = validLocales.includes(localeRaw as typeof validLocales[number])
    ? (localeRaw as Locale)
    : "en";

  // Validate turn detector type
  const validTurnDetectors = ["auto", "local", "cloud", "heuristic"] as const;
  const turnDetectorType: TurnDetectorType = validTurnDetectors.includes(turnDetectorRaw as typeof validTurnDetectors[number])
    ? (turnDetectorRaw as TurnDetectorType)
    : "auto";

  // Derive default voice from locale if not explicitly set
  const defaultVoice = locale === "fr" ? "pNInz6obpgDQGcFmaJgB" : "21m00Tcm4TlvDq8ikWAM";
  const voiceId = voiceIdRaw || defaultVoice;
  const anthropicApiKey = getEnv("ANTHROPIC_API_KEY");
  const openaiApiKey = getEnv("OPENAI_API_KEY");
  const ollamaUrl = getEnv("OLLAMA_URL", "http://localhost:11434");
  const llmModel = getEnv("LLM_MODEL"); // Optional - uses provider default if empty

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
      voiceId,
      locale,
      turnDetectorType,
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
