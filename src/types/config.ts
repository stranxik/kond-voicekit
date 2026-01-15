/**
 * VoiceKit Configuration Types
 *
 * Simplified cloud-only configuration.
 * All STT/TTS goes through KOND - you just provide your API key.
 */

/**
 * Supported locales
 */
export type Locale = "fr" | "en";

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
   * Default locale for STT and TTS
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
   * Enable debug logging
   */
  debug?: boolean;
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

// ============= KOND Endpoints (internal) =============

export const KOND_ENDPOINTS = {
  sttWebSocket: "wss://voice-ws.railway.app",
  ttsStream: "https://kond.studio/api/voice/tts/stream",
  turnDetector: "https://kond.studio/api/voice/turn-detector/predict",
  voiceToken: "https://kond.studio/api/voice/token",
};
