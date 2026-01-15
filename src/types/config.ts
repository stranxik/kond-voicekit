/**
 * VoiceKit Configuration Types
 *
 * Simplified cloud-only configuration.
 * All STT/TTS goes through KOND - you just provide your API key.
 */

/**
 * Supported locales
 * - "fr" / "en": Single language mode (STT + TTS)
 * - "multi": Multilingual mode - Deepgram Nova-3 codeswitching (auto-detects 10 languages)
 */
export type Locale = "fr" | "en" | "multi";

/**
 * Conversation state machine states
 */
export type ConversationState =
  | "idle" // Not in conversation mode
  | "connecting" // Connecting to STT WebSocket
  | "listening" // Ready, audio streaming to STT
  | "vad_cooldown" // Noise absorption after VAD speech end
  | "triggered" // LLM started early (buffering response)
  | "streaming" // LLM is actively streaming response
  | "processing" // Waiting for LLM response (non-streaming fallback)
  | "speaking" // TTS playing
  | "cooldown"; // Brief pause after TTS before resuming

/**
 * Trace event for observability (opt-in)
 */
export interface TraceEvent {
  /** Unique trace identifier */
  traceId: string;
  /** Provider name (deepgram, elevenlabs, etc.) */
  provider: string;
  /** Operation type */
  operation: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Cost in cents (if applicable) */
  costCents?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * VoiceKit error
 */
export interface VoiceKitError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Main VoiceKit configuration
 *
 * Simple setup - just provide your API key and transcript handler:
 *
 * ```typescript
 * const voice = new VoiceKit({
 *   apiKey: "vk_live_xxx",
 *   onTranscript: async (text) => {
 *     const reply = await myLLM(text);
 *     voice.speak(reply);
 *   }
 * });
 * ```
 */
export interface VoiceKitConfig {
  // ============= Required =============
  /**
   * VoiceKit API key (vk_xxx)
   * Get your key at: https://kond.studio/developers/voicekit/keys
   * Free tier: 100 min/month
   */
  apiKey: string;

  /**
   * Called when user finishes speaking with the final transcript
   * This is where you integrate your LLM
   */
  onTranscript: (transcript: string) => void | Promise<void>;

  // ============= Voice Settings =============
  /**
   * ElevenLabs voice ID
   * Can be a KOND preset (marie-fr, thomas-fr, emma-en, james-en)
   * or any custom ElevenLabs voice ID from your account
   * @default "marie-fr"
   */
  voice?: string;

  /**
   * Locale for STT and TTS
   * - "fr" / "en": Single language mode
   * - "multi": Multilingual - Deepgram auto-detects FR/EN/ES/DE/IT/PT/JA/NL/RU/HI
   * @default "fr"
   */
  locale?: Locale;

  // ============= Callbacks =============
  /**
   * Called when conversation state changes
   */
  onStateChange?: (state: ConversationState) => void;

  /**
   * Called on errors
   */
  onError?: (error: VoiceKitError) => void;

  /**
   * Called when user interrupts (barge-in)
   */
  onBargeIn?: () => void;

  /**
   * Called with speech activity status
   */
  onSpeechActivity?: (speaking: boolean) => void;

  /**
   * Callback when free quota is exceeded (402 response)
   * Use this to show an upgrade prompt to users
   */
  onQuotaExceeded?: (upgradeUrl: string) => void;

  /**
   * Observability callback for tracing (opt-in)
   * Use this to integrate with your observability stack (Axiom, Datadog, etc.)
   */
  onTrace?: (event: TraceEvent) => void;

  // ============= Advanced Tuning =============
  /**
   * Turn detection tuning
   */
  turnDetection?: {
    /** Force specific turn detector type @default "auto" */
    type?: "auto" | "cloud" | "onnx" | "heuristic";
    /** Minimum confidence to commit turn (0-1) @default 0.7 */
    confidenceThreshold?: number;
    /** Silence timeout before committing (ms) @default 1200 */
    silenceTimeoutMs?: number;
    /** Detect backchannel responses like "mh", "ok" @default true */
    detectBackchannels?: boolean;
  };

  /**
   * TTS tuning
   */
  tts?: {
    /** Speech speed (0.5-1.5) @default 1.0 */
    speed?: number;
  };

  /**
   * Internal timing config (for advanced use)
   * @internal
   */
  timing?: {
    /** Cooldown after TTS (ms) @default 150 */
    cooldownMs?: number;
    /** Grace period (ms) @default 2000 */
    gracePeriodMs?: number;
    /** Max silence (ms) @default 2500 */
    maxSilenceMs?: number;
  };

  /**
   * Enable debug logging
   */
  debug?: boolean;

  // ============= Advanced (rarely needed) =============
  /**
   * API base URL override
   * Only needed for staging/development environments
   * @default "https://kond.studio/api/voice/v1"
   * @internal
   */
  baseUrl?: string;
}

// ============= Internal Types (not exported to user) =============

/**
 * @internal Full config with defaults applied
 */
export interface ResolvedConfig extends Required<Omit<VoiceKitConfig,
  'onStateChange' | 'onError' | 'onBargeIn' | 'onSpeechActivity' | 'onQuotaExceeded' | 'onTrace'
>> {
  onStateChange?: (state: ConversationState) => void;
  onError?: (error: VoiceKitError) => void;
  onBargeIn?: () => void;
  onSpeechActivity?: (speaking: boolean) => void;
  onQuotaExceeded?: (upgradeUrl: string) => void;
  onTrace?: (event: TraceEvent) => void;
  // Internal timing config
  timing: {
    cooldownMs: number;
    gracePeriodMs: number;
    maxSilenceMs: number;
  };
}

// ============= Default Values =============

export const DEFAULT_CONFIG = {
  voice: "marie-fr",
  locale: "fr" as Locale,
  turnDetection: {
    confidenceThreshold: 0.7,
    silenceTimeoutMs: 1200,
    detectBackchannels: true,
  },
  tts: {
    speed: 1.0,
  },
  timing: {
    cooldownMs: 150,
    gracePeriodMs: 2000,
    maxSilenceMs: 2500,
  },
  debug: false,
};

// ============= KOND Cloud Configuration =============

/**
 * Default API base URL
 * Can be overridden for staging/development
 */
export const DEFAULT_BASE_URL = "https://kond.studio/api/voice/v1";

/**
 * @internal Get endpoint URL from base
 * Not exported - SDK users only set baseUrl, paths are fixed
 */
export function getEndpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/**
 * @internal Endpoint paths (relative to baseUrl)
 * Not exported to users - these are implementation details
 */
export const ENDPOINT_PATHS = {
  token: "/token",
  turnDetect: "/turn-detect",
  ttsStream: "/tts/stream",
} as const;
