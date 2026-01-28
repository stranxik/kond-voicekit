/**
 * React Voice Conversation Types
 * Centralized types and constants for voice conversation hooks
 */

// Re-export main types from SDK
export type {
  Locale,
  ConversationState,
  TraceEvent,
  VoiceKitError,
  VoiceKitConfig,
} from "../types/config";

export { DEFAULT_CONFIG } from "../types/config";

// =============================================================================
// Auto-Stop Types
// =============================================================================

/** Reason why the conversation was auto-stopped */
export type AutoStopReason = "idle" | "max_duration";

// =============================================================================
// Interruption Context (Barge-in Awareness)
// =============================================================================

/** Context captured when user interrupts during TTS */
export interface InterruptionContext {
  /** What was being spoken when interrupted */
  partialResponse: string;
  /** What the user originally asked */
  userMessage: string;
  /** Timestamp when interruption occurred */
  interruptedAt: number;
}

// =============================================================================
// Voice Conversation Options (Full-featured hook)
// =============================================================================

export interface UseVoiceConversationOptions {
  /** Locale for STT/TTS (default: "fr") */
  locale?: "fr" | "en";
  /** User ID for session tracking */
  userId?: string;
  /** Called when user's message is finalized (for UI display) */
  onUserMessage?: (text: string) => void;
  /** LLM callback - send user message and return response */
  sendMessage?: (text: string) => Promise<string>;
  /** Called when conversation auto-stops */
  onAutoStop?: (reason: AutoStopReason) => void;
  /** Called on barge-in to cancel TTS playback */
  cancelTTS?: () => void;
  /** Called when TTS starts playing */
  onTTSStart?: () => void;
  /** Brief pause after TTS before resuming (ms) */
  cooldownMs?: number;
  /** Auto-stop after this long without speech (ms) */
  idleTimeoutMs?: number;
  /** Maximum session duration (ms) */
  maxSessionMs?: number;
  /** Grace period after speechFinal before committing (ms) */
  speechFinalDelayMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface UseVoiceConversationReturn {
  /** Current conversation state (9 states FSM) */
  state:
    | "idle"
    | "connecting"
    | "listening"
    | "vad_cooldown"
    | "triggered"
    | "streaming"
    | "processing"
    | "speaking"
    | "cooldown";
  /** Is voice conversation active */
  isActive: boolean;
  /** Is voice conversation supported in this browser */
  isSupported: boolean;
  /** Start voice conversation */
  start: () => Promise<void>;
  /** Stop voice conversation */
  stop: () => void;
  /** Interrupt current operation (e.g., cancel streaming) */
  interrupt: () => void;
  /** Current transcript (live updates) */
  transcript: string;
  /** Last error message */
  error: string | null;
  /** Is user currently speaking */
  userSpeaking: boolean;
  /** Signal that LLM streaming has started */
  handleStreamingStart: () => void;
  /** Signal that TTS is now playing (transitions to "speaking" state) */
  handleTTSSpeakingStart: () => void;
  /** Signal that LLM streaming has ended */
  handleStreamingEnd: () => void;
  /** Get stored interruption context (if user interrupted) */
  getInterruptionContext: () => InterruptionContext | null;
  /** Clear interruption context after it's been consumed */
  clearInterruptionContext: () => void;
}

// =============================================================================
// Deepgram Callbacks (for STT connection)
// =============================================================================

export interface TranscriptionResult {
  text: string;
  confidence: number;
  speechFinal?: boolean;
}

export interface DeepgramCallbacks {
  onReady: () => void;
  onInterim: (result: TranscriptionResult) => void;
  onFinal: (result: TranscriptionResult) => void;
  onUtteranceEnd: () => void;
  onSpeechStarted: () => void;
  onError: (error: Error) => void;
}

// =============================================================================
// Audio Setup Types
// =============================================================================

export interface AudioSetupResult {
  worklet: AudioWorkletNode;
  stream: MediaStream;
}

export interface UseAudioSetupReturn {
  setupAudio: () => Promise<AudioSetupResult>;
  cleanupAudio: () => void;
}

// =============================================================================
// Voice Timeouts Types
// =============================================================================

export interface UseVoiceTimeoutsOptions {
  idleTimeoutMs: number;
  maxSessionMs: number;
  speechFinalDelayMs: number;
  debug?: boolean;
  onIdleTimeout: () => void;
  onMaxSessionTimeout: () => void;
  onSpeechFinalCommit: () => void;
  onTriggeredTimeout: () => void;
  onSilenceTimeout: () => void;
  onStreamingSafetyTimeout: () => void;
  onVADCooldownComplete: () => void;
  onMaxUtteranceTimeout: () => void;
}

export interface UseVoiceTimeoutsReturn {
  // Idle management
  startIdleTimeout: () => void;
  resetIdleTimeout: () => void;
  // Max session
  startMaxSessionTimeout: () => void;
  // Speech final
  scheduleSpeechFinalCommit: () => void;
  cancelSpeechFinalCommit: () => void;
  // Triggered state
  startTriggeredTimeout: () => void;
  clearTriggeredTimeout: () => void;
  // Silence fallback
  startSilenceTimeout: () => void;
  clearSilenceTimeout: () => void;
  // Streaming safety
  startStreamingSafetyTimeout: () => void;
  clearStreamingSafetyTimeout: () => void;
  // VAD cooldown
  startVADCooldownTimeout: () => void;
  clearVADCooldownTimeout: () => void;
  // Max utterance
  startMaxUtteranceTimeout: () => void;
  clearMaxUtteranceTimeout: () => void;
  // Clear all
  clearAllTimeouts: () => void;
}

// =============================================================================
// Turn Coordination Types
// =============================================================================

export interface UseTurnCoordinationOptions {
  speechFinalDelayMs: number;
  debug?: boolean;
  turnDetector?: unknown; // TurnDetectorProvider
  onTurnComplete: (text: string, confidence: number) => void;
  onBargeIn: () => void;
  onSpeechActivity: (speaking: boolean) => void;
}

export interface UseTurnCoordinationReturn {
  createTurnManager: () => void;
  destroyTurnManager: () => void;
  resetTurnManager: () => void;
  setTurnDetector: (provider: unknown) => void;
  feedTranscript: (
    text: string,
    isFinal: boolean,
    speechFinal: boolean,
    confidence: number
  ) => void;
  feedRMS: (rms: number) => void;
  feedVADEvent: (event: "started" | "ended") => void;
  feedVADProbability: (probability: number) => void;
  syncState: (
    state:
      | "idle"
      | "connecting"
      | "listening"
      | "vad_cooldown"
      | "triggered"
      | "streaming"
      | "processing"
      | "speaking"
      | "cooldown"
  ) => void;
  getTranscript: () => string;
}

// =============================================================================
// LLM Integration Types
// =============================================================================

export interface UseLLMIntegrationOptions {
  sendMessage?: (text: string) => Promise<string>;
  debug?: boolean;
}

export interface UseLLMIntegrationReturn {
  /** Ref for external access to buffered response */
  llmBufferRef: React.MutableRefObject<string>;
  /** Ref for external access to abort controller */
  llmAbortRef: React.MutableRefObject<AbortController | null>;
  /** Start LLM early when trigger is detected */
  startLlmEarly: (transcript: string) => Promise<void>;
  /** Abort any in-progress LLM request */
  abortLlm: () => void;
  /** Clear the buffered response */
  clearBuffer: () => void;
  /** Check if there's a buffered response ready */
  hasBufferedResponse: () => boolean;
  /** Get the buffered response */
  getBufferedResponse: () => string;
}

// =============================================================================
// Timeout Constants (8 types)
// =============================================================================

/** Brief pause after TTS before resuming listening (ms) */
export const DEFAULT_COOLDOWN_MS = 150;

/** Auto-stop after this long without speech (ms) - 5 minutes */
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum session duration (ms) - 30 minutes */
export const DEFAULT_MAX_SESSION_MS = 30 * 60 * 1000;

/** Grace period after speechFinal before committing (ms) - lets user breathe */
export const DEFAULT_SPEECH_FINAL_DELAY_MS = 1200;

/** Maximum wait in triggered state before forcing commit (ms) */
export const TRIGGERED_TIMEOUT_MS = 8000;

/** Commit after this much silence if no new transcripts (ms) */
export const SILENCE_FALLBACK_MS = 2000;

/** Minimum time between SpeechStarted events - noise filtering (ms) */
export const SPEECH_HYSTERESIS_MS = 150;

/** Safety timeout if streaming never signals start (ms) */
export const STREAMING_SAFETY_TIMEOUT_MS = 30000;

/** VAD cooldown period to absorb noise after speech end (ms) */
export const VAD_COOLDOWN_MS = 800;

/** Max utterance duration - prevents indefinite speaking (ms) - 30 seconds */
export const MAX_UTTERANCE_MS = 30000;
