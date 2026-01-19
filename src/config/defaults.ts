/**
 * VoiceKit Environment Configuration
 *
 * Centralized configuration for all environments.
 * Users can override baseUrl in VoiceKitConfig, but endpoints are fixed.
 */

/**
 * Environment-specific API configuration
 */
export interface EnvironmentConfig {
  /** Base URL for all API calls */
  baseUrl: string;
  /** WebSocket URL for STT (derived from baseUrl if not set) */
  wsUrl?: string;
}

/**
 * Built-in environment presets
 */
export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  production: {
    baseUrl: "https://kond.studio/api/voice/v1",
  },
  staging: {
    baseUrl: "https://staging.kond.studio/api/voice/v1",
  },
  development: {
    baseUrl: "http://localhost:3000/api/voice/v1",
  },
};

/**
 * API endpoint paths (relative to baseUrl)
 * These are implementation details and should not be exposed to users.
 */
export const ENDPOINTS = {
  /** Token exchange endpoint */
  token: "/token",
  /** Turn detection API */
  turnDetect: "/turn-detect",
  /** TTS streaming endpoint */
  ttsStream: "/tts/stream",
} as const;

/**
 * Default voice presets
 */
export const VOICE_PRESETS = {
  "marie-fr": "9BWtsMINqrJLrRacOk9x", // ElevenLabs voice ID
  "thomas-fr": "ThT5KcBeYPX3keUQqHPh",
  "emma-en": "21m00Tcm4TlvDq8ikWAM",
  "james-en": "JBFqnCBsd6RMkjVDRZzb",
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  /** Default base URL for API calls (production) */
  baseUrl: "https://kond.studio/api/voice/v1",
  /** Default locale */
  locale: "fr" as const,
  /** Default worklet URL */
  workletUrl: "/audio-processor.worklet.js",
  /** Turn detection defaults */
  turnDetection: {
    type: "auto" as const,
    confidenceThreshold: 0.7,
    silenceTimeoutMs: 1200,
    detectBackchannels: true,
  },
  /** TTS defaults */
  tts: {
    speed: 1.0,
  },
  /** Internal timing */
  timing: {
    cooldownMs: 150,
    gracePeriodMs: 2000,
    maxSilenceMs: 2500,
  },
  /** Debug mode */
  debug: false,
};

/**
 * ONNX Turn Detector defaults
 *
 * Model: LiveKit turn-detector (SmolLM2-135M based)
 * Hosted on HuggingFace for reliability and CDN distribution
 */
export const ONNX_DEFAULTS = {
  /** ONNX model file (quantized INT8 for smaller size) */
  modelUrl: "https://huggingface.co/livekit/turn-detector/resolve/main/onnx/model_q8.onnx",
  /** Tokenizer config file */
  tokenizerUrl: "https://huggingface.co/livekit/turn-detector/resolve/main/tokenizer.json",
  /** Model version for cache invalidation */
  modelVersion: "1.2.0",
  /** Enable IndexedDB caching */
  enableCache: true,
  /** ONNX execution provider */
  executionProvider: "wasm" as const,
  /** EOT probability threshold (0.6 = 60% confidence for end-of-turn) */
  eotThreshold: 0.6,
  /** Maximum input sequence length */
  maxSeqLength: 512,
};

/**
 * Get environment config by name or detection
 */
export function getEnvironmentConfig(env?: string): EnvironmentConfig {
  // Explicit environment
  if (env && env in ENVIRONMENTS) {
    return ENVIRONMENTS[env];
  }

  // Auto-detect from NODE_ENV
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv in ENVIRONMENTS) {
      return ENVIRONMENTS[nodeEnv];
    }
  }

  // Default to production
  return ENVIRONMENTS.production;
}

/**
 * Build full endpoint URL from base URL and path
 */
export function buildEndpointUrl(baseUrl: string, endpoint: keyof typeof ENDPOINTS): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${ENDPOINTS[endpoint]}`;
}

/**
 * Resolve voice ID from preset name or direct ID
 */
export function resolveVoiceId(voice: string): string {
  if (voice in VOICE_PRESETS) {
    return VOICE_PRESETS[voice as keyof typeof VOICE_PRESETS];
  }
  return voice;
}

/**
 * Security: Validate that base URL uses HTTPS in production
 * Warns in development, throws in production
 *
 * @param baseUrl The base URL to validate
 * @param debug Whether debug mode is enabled
 * @throws Error if HTTP is used in production
 */
export function validateSecureUrl(baseUrl: string, debug?: boolean): void {
  const isProduction = typeof process !== "undefined" &&
    process.env?.NODE_ENV === "production";

  const isLocalhost = baseUrl.includes("localhost") ||
    baseUrl.includes("127.0.0.1");

  const isHttps = baseUrl.startsWith("https://");

  // Allow HTTP only for localhost in non-production
  if (!isHttps && !isLocalhost) {
    if (isProduction) {
      throw new Error(
        `[VoiceKit] Security: HTTPS is required in production. ` +
        `Got: ${baseUrl.substring(0, 50)}`
      );
    } else if (debug) {
      console.warn(
        `[VoiceKit] Security warning: Using HTTP in non-production. ` +
        `Consider using HTTPS for ${baseUrl.substring(0, 50)}`
      );
    }
  }
}
