/**
 * VoiceKit Configuration Types
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
 */
export interface VoiceKitConfig {
  // ============= Authentication =============
  /**
   * VoiceKit API key (vk_xxx)
   * Get your key at: https://kond.studio/voicekit/keys
   * Free tier: 100 min/month of cloud turn detection
   */
  apiKey?: string;

  /**
   * Custom auth token provider for self-hosted setups
   * Return a JWT or API key for authenticating with your services
   */
  getAuthToken?: () => Promise<string>;

  /**
   * Callback when free quota is exceeded (402 response)
   * Use this to show an upgrade prompt to users
   */
  onQuotaExceeded?: (upgradeUrl: string) => void;

  // ============= Voice Settings =============
  /**
   * Voice ID from the catalog (e.g., 'marie-fr', 'thomas-fr', 'emma-en')
   */
  voice?: string;

  /**
   * Default locale for STT and TTS
   * @default "fr"
   */
  locale?: Locale;

  // ============= Required Callback =============
  /**
   * Called when user finishes speaking with the final transcript
   * This is where you integrate your LLM
   */
  onTranscript: (transcript: string) => void | Promise<void>;

  // ============= Optional Callbacks =============
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
   * Observability callback for tracing (opt-in)
   * Use this to integrate with your observability stack (Axiom, Datadog, etc.)
   */
  onTrace?: (event: TraceEvent) => void;

  // ============= Advanced: Self-hosted Endpoints =============
  /**
   * Custom endpoint URLs for self-hosted deployments
   */
  endpoints?: {
    /** WebSocket URL for STT streaming */
    sttWebSocket?: string;
    /** HTTP URL for TTS streaming */
    ttsStream?: string;
    /** HTTP URL for turn detector API */
    turnDetector?: string;
    /** HTTP URL for voice token endpoint */
    voiceToken?: string;
  };

  // ============= Advanced: Turn Detection Tuning =============
  /**
   * Turn detection configuration
   */
  turnDetection?: {
    /** Detector type: 'auto' | 'onnx' | 'cloud' | 'heuristic' */
    type?: "auto" | "onnx" | "cloud" | "heuristic";
    /** Minimum confidence to commit turn (0-1) */
    confidenceThreshold?: number;
    /** Silence timeout before committing (ms) */
    silenceTimeoutMs?: number;
    /** Detect backchannel responses like "mh", "ok" */
    detectBackchannels?: boolean;
  };

  // ============= Advanced: TTS Tuning =============
  /**
   * TTS configuration
   */
  tts?: {
    /** Speech speed (0.5-1.5) */
    speed?: number;
    /** ElevenLabs stability (0-1) */
    stability?: number;
    /** ElevenLabs similarity boost (0-1) */
    similarityBoost?: number;
  };

  // ============= Advanced: Timing Tuning =============
  /**
   * Timing configuration
   */
  timing?: {
    /** Cooldown after TTS before resuming (ms) */
    cooldownMs?: number;
    /** Grace period for transcript stabilization (ms) */
    gracePeriodMs?: number;
    /** Max silence before committing (ms) */
    maxSilenceMs?: number;
  };

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

// ============= Default Values =============

export const DEFAULT_CONFIG = {
  locale: "fr" as Locale,
  turnDetection: {
    type: "auto" as const,
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
