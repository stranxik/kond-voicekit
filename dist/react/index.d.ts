import * as react_jsx_runtime from 'react/jsx-runtime';
import React$1 from 'react';

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
type Locale = "fr" | "en" | "multi";
/**
 * Turn detector type
 * - "auto": Automatic selection (ONNX on capable desktops, cloud otherwise)
 * - "local": Force local ONNX inference (~25-50ms latency)
 * - "cloud": Force cloud API inference (~100-200ms latency)
 * - "heuristic": Fast regex-based fallback (~1ms, no ML)
 * - "onnx": Alias for "local"
 */
type TurnDetectorType$1 = "auto" | "local" | "cloud" | "heuristic" | "onnx";
/**
 * Conversation state machine states
 */
type ConversationState$1 = "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown";
/**
 * Trace event for observability (opt-in)
 */
interface TraceEvent {
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
interface VoiceKitError {
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
interface VoiceKitConfig {
    /**
     * VoiceKit API key (vk_xxx)
     * Get your key at: https://kond.studio/developers/voicekit/keys
     * Free tier: 10 min/month
     *
     * Either `apiKey` OR `token`+`tokenWsUrl` is required.
     */
    apiKey?: string;
    /**
     * Pre-fetched token for direct connection (bypasses key exchange)
     * Use this when you've already obtained a token server-side.
     * Requires `tokenWsUrl` to be set.
     */
    token?: string;
    /**
     * WebSocket URL for direct token connection
     * Required when using `token` instead of `apiKey`.
     */
    tokenWsUrl?: string;
    /**
     * Called when user finishes speaking with the final transcript
     * This is where you integrate your LLM
     */
    onTranscript: (transcript: string) => void | Promise<void>;
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
    /**
     * Called when conversation state changes
     */
    onStateChange?: (state: ConversationState$1) => void;
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
    /**
     * Turn detection tuning
     */
    turnDetection?: {
        /**
         * Turn detector type
         * - "auto" (default): Uses local ONNX on capable desktops, cloud on mobile/low-memory
         * - "local": Force local ONNX inference (desktop only, ~25-50ms latency)
         * - "cloud": Force cloud API (~100-200ms latency, works everywhere)
         * - "heuristic": Fast regex-based fallback (~1ms, no ML)
         * - "onnx": Alias for "local"
         * @default "auto"
         */
        type?: TurnDetectorType$1;
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
    /**
     * API base URL override
     * Only needed for staging/development environments
     * @default "https://kond.studio/api/voice/v1"
     * @internal
     */
    baseUrl?: string;
    /**
     * Path to audio worklet processor script
     * The worklet handles audio capture and resampling for STT.
     * Users need to copy `audio-processor.worklet.js` to their public folder.
     * @default "/audio-processor.worklet.js"
     */
    workletUrl?: string;
}
declare const DEFAULT_CONFIG: {
    voice: string;
    locale: Locale;
    turnDetection: {
        confidenceThreshold: number;
        silenceTimeoutMs: number;
        detectBackchannels: boolean;
    };
    tts: {
        speed: number;
    };
    timing: {
        cooldownMs: number;
        gracePeriodMs: number;
        maxSilenceMs: number;
    };
    debug: boolean;
};

interface UseVoiceKitOptions extends Omit<VoiceKitConfig, "onTranscript" | "onStateChange" | "onError"> {
    /**
     * Called when user finishes speaking with the final transcript
     * This is where you integrate your LLM
     */
    onTranscript: (transcript: string) => void | Promise<void>;
}
interface UseVoiceKitReturn {
    /** Current conversation state */
    state: ConversationState$1;
    /** Is voice active (listening, processing, or speaking) */
    isActive: boolean;
    /** Is TTS currently playing */
    isSpeaking: boolean;
    /** Start voice conversation */
    start: () => Promise<void>;
    /** Stop voice conversation */
    stop: () => void;
    /** Speak text using TTS */
    speak: (text: string) => void;
    /** Finish speaking (flush remaining text) */
    finishSpeaking: () => void;
    /** Interrupt current TTS playback */
    interrupt: () => void;
    /** Last error if any */
    error: VoiceKitError | null;
}
/**
 * React hook for voice conversations
 */
declare function useVoiceKit(options: UseVoiceKitOptions): UseVoiceKitReturn;

/**
 * React Voice Conversation Types
 * Centralized types and constants for voice conversation hooks
 */

/** Reason why the conversation was auto-stopped */
type AutoStopReason = "idle" | "max_duration";
/** Context captured when user interrupts during TTS */
interface InterruptionContext {
    /** What was being spoken when interrupted */
    partialResponse: string;
    /** What the user originally asked */
    userMessage: string;
    /** Timestamp when interruption occurred */
    interruptedAt: number;
}
interface UseVoiceConversationOptions {
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
interface UseVoiceConversationReturn {
    /** Current conversation state (9 states FSM) */
    state: "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown";
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
interface TranscriptionResult$1 {
    text: string;
    confidence: number;
    speechFinal?: boolean;
}
interface DeepgramCallbacks {
    onReady: () => void;
    onInterim: (result: TranscriptionResult$1) => void;
    onFinal: (result: TranscriptionResult$1) => void;
    onUtteranceEnd: () => void;
    onSpeechStarted: () => void;
    onError: (error: Error) => void;
}
interface AudioSetupResult {
    worklet: AudioWorkletNode;
    stream: MediaStream;
}
interface UseVoiceTimeoutsOptions$1 {
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
interface UseVoiceTimeoutsReturn$1 {
    startIdleTimeout: () => void;
    resetIdleTimeout: () => void;
    startMaxSessionTimeout: () => void;
    scheduleSpeechFinalCommit: () => void;
    cancelSpeechFinalCommit: () => void;
    startTriggeredTimeout: () => void;
    clearTriggeredTimeout: () => void;
    startSilenceTimeout: () => void;
    clearSilenceTimeout: () => void;
    startStreamingSafetyTimeout: () => void;
    clearStreamingSafetyTimeout: () => void;
    startVADCooldownTimeout: () => void;
    clearVADCooldownTimeout: () => void;
    startMaxUtteranceTimeout: () => void;
    clearMaxUtteranceTimeout: () => void;
    clearAllTimeouts: () => void;
}
interface UseTurnCoordinationOptions$1 {
    speechFinalDelayMs: number;
    debug?: boolean;
    turnDetector?: unknown;
    onTurnComplete: (text: string, confidence: number) => void;
    onBargeIn: () => void;
    onSpeechActivity: (speaking: boolean) => void;
}
interface UseTurnCoordinationReturn$1 {
    createTurnManager: () => void;
    destroyTurnManager: () => void;
    resetTurnManager: () => void;
    setTurnDetector: (provider: unknown) => void;
    feedTranscript: (text: string, isFinal: boolean, speechFinal: boolean, confidence: number) => void;
    feedRMS: (rms: number) => void;
    feedVADEvent: (event: "started" | "ended") => void;
    feedVADProbability: (probability: number) => void;
    syncState: (state: "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown") => void;
    getTranscript: () => string;
}
interface UseLLMIntegrationOptions {
    sendMessage?: (text: string) => Promise<string>;
    debug?: boolean;
}
interface UseLLMIntegrationReturn {
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
/** Brief pause after TTS before resuming listening (ms) */
declare const DEFAULT_COOLDOWN_MS = 150;
/** Auto-stop after this long without speech (ms) - 5 minutes */
declare const DEFAULT_IDLE_TIMEOUT_MS: number;
/** Maximum session duration (ms) - 30 minutes */
declare const DEFAULT_MAX_SESSION_MS: number;
/** Grace period after speechFinal before committing (ms) - lets user breathe */
declare const DEFAULT_SPEECH_FINAL_DELAY_MS = 1200;
/** Maximum wait in triggered state before forcing commit (ms) */
declare const TRIGGERED_TIMEOUT_MS = 8000;
/** Commit after this much silence if no new transcripts (ms) */
declare const SILENCE_FALLBACK_MS = 2000;
/** Minimum time between SpeechStarted events - noise filtering (ms) */
declare const SPEECH_HYSTERESIS_MS = 150;
/** Safety timeout if streaming never signals start (ms) */
declare const STREAMING_SAFETY_TIMEOUT_MS = 30000;
/** VAD cooldown period to absorb noise after speech end (ms) */
declare const VAD_COOLDOWN_MS = 800;
/** Max utterance duration - prevents indefinite speaking (ms) - 30 seconds */
declare const MAX_UTTERANCE_MS = 30000;

declare function useVoiceConversation(options?: UseVoiceConversationOptions): UseVoiceConversationReturn;

interface AudioResources {
    stream: MediaStream;
    context: AudioContext;
    worklet: AudioWorkletNode;
    source: MediaStreamAudioSourceNode;
}
interface UseAudioSetupOptions {
    /** Path to audio worklet processor script (default: "/audio-processor.worklet.js") */
    workletPath?: string;
    /** Target sample rate for STT (default: 16000) */
    targetSampleRate?: number;
    debug?: boolean;
}
interface UseAudioSetupReturn {
    mediaStreamRef: React.MutableRefObject<MediaStream | null>;
    audioContextRef: React.MutableRefObject<AudioContext | null>;
    workletNodeRef: React.MutableRefObject<AudioWorkletNode | null>;
    setupAudio: () => Promise<AudioResources>;
    cleanupAudio: () => void;
    isAudioActive: boolean;
    audioError: string | null;
}
declare function useAudioSetup(options?: UseAudioSetupOptions): UseAudioSetupReturn;

/**
 * STT Port - Clean Architecture interface for Speech-to-Text
 *
 * Defines the contract for streaming STT implementations.
 * Adapters (Deepgram, Whisper, etc.) implement this interface.
 */
interface TranscriptionResult {
    /** Transcribed text */
    text: string;
    /** Language detected or used */
    language: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Whether this is a final result (vs interim) */
    isFinal: boolean;
    /** Whether speech has ended (utterance complete) */
    speechFinal?: boolean;
}
interface StreamingCallbacks {
    /** Called when interim transcription is available */
    onInterim: (result: TranscriptionResult) => void;
    /** Called when final transcription is available */
    onFinal: (result: TranscriptionResult) => void;
    /** Called when user stops speaking (utterance end) */
    onUtteranceEnd: () => void;
    /** Called when speech activity is detected (VAD event) */
    onSpeechStarted?: () => void;
    /** Called when connection is ready */
    onReady?: () => void;
    /** Called on error */
    onError: (error: Error) => void;
}
interface StreamingSTTPort {
    /**
     * Start streaming connection
     * @param callbacks Callbacks for transcription events
     * @param language Language code (e.g., "fr", "en")
     */
    startStreaming(callbacks: StreamingCallbacks, language?: string): Promise<void>;
    /**
     * Send audio chunk to STT service
     * @param chunk Audio data (PCM 16kHz 16-bit mono)
     */
    sendAudio(chunk: ArrayBuffer | Float32Array): void;
    /**
     * Signal end of audio stream
     */
    endAudio(): void;
    /**
     * Close connection and cleanup
     */
    close(): void;
    /**
     * Check if currently streaming
     */
    isStreaming(): boolean;
}

/**
 * Deepgram Adapter - Streaming STT via WebSocket
 *
 * Connects to a WebSocket proxy (Railway voice-ws or custom) which proxies to Deepgram.
 * This avoids CORS issues and keeps API keys server-side.
 */

/**
 * Deepgram adapter configuration
 */
interface DeepgramConfig {
    /** API base URL @default "https://kond.studio/api/voice/v1" */
    baseUrl?: string;
    /** VoiceKit API key (vk_xxx) - required for token fetch */
    apiKey?: string;
    /** WebSocket URL override (normally returned by token endpoint) */
    wsUrl?: string;
    /** Optional trace callback for observability */
    onTrace?: (event: TraceEvent) => void;
}
/**
 * Auth token response from gateway
 * Used when getAuthToken returns an object with token and wsUrl
 */
interface TokenResponse {
    token: string;
    wsUrl: string;
    expiresIn?: number;
}
declare class DeepgramStreamingAdapter implements StreamingSTTPort {
    private getAuthToken;
    private ws;
    private callbacks;
    private language;
    private streaming;
    private traceId;
    private startTime;
    private audioSeconds;
    private userId;
    private config;
    private audioBuffer;
    private isReconnecting;
    private static readonly MAX_BUFFER_SIZE;
    constructor(getAuthToken: () => Promise<string | TokenResponse>, config?: Partial<DeepgramConfig>, userId?: string);
    startStreaming(callbacks: StreamingCallbacks, language?: string): Promise<void>;
    /**
     * Handle incoming Deepgram message
     */
    private handleMessage;
    sendAudio(chunk: ArrayBuffer | Float32Array): void;
    /**
     * Flush buffered audio after reconnection
     */
    private flushAudioBuffer;
    /**
     * Mark adapter as reconnecting (pauses audio sending)
     */
    setReconnecting(value: boolean): void;
    endAudio(): void;
    close(): void;
    isStreaming(): boolean;
    private generateTraceId;
    private logTrace;
}

/**
 * Callbacks for STT events
 */
interface STTCallbacks {
    onReady: () => void;
    onInterim: (result: TranscriptionResult) => void;
    onFinal: (result: TranscriptionResult) => void;
    onUtteranceEnd: () => void;
    onSpeechStarted: () => void;
    onError: (error: Error) => void;
}
interface UseSTTConnectionOptions {
    /** User ID for session tracking */
    userId?: string;
    /** VoiceKit API key (vk_xxx) - required if not using getAuthToken */
    apiKey?: string;
    /** API base URL override */
    baseUrl?: string;
    /**
     * Auth token provider for self-hosted setups (alternative to apiKey)
     * Can return either:
     * - A string token (simple case)
     * - A TokenResponse object with { token, wsUrl, expiresIn? } for custom backends
     */
    getAuthToken?: () => Promise<string | TokenResponse>;
    debug?: boolean;
}
interface UseSTTConnectionReturn {
    sttRef: React.MutableRefObject<DeepgramStreamingAdapter | null>;
    connect: (callbacks: STTCallbacks, language?: "multi" | "fr" | "en") => Promise<void>;
    reconnect: (callbacks: STTCallbacks, language?: "multi" | "fr" | "en") => Promise<void>;
    reconnectWithBackoff: (callbacks: STTCallbacks, language?: "multi" | "fr" | "en") => Promise<boolean>;
    disconnect: () => void;
    sendAudio: (data: ArrayBuffer) => void;
    isConnected: () => boolean;
    isStreaming: () => boolean;
}
declare function useSTTConnection(options?: UseSTTConnectionOptions): UseSTTConnectionReturn;

interface UseVoiceTimeoutsOptions {
    idleTimeoutMs?: number;
    maxSessionMs?: number;
    speechFinalDelayMs?: number;
    debug?: boolean;
    /** Called when idle timeout fires */
    onIdleTimeout: () => void;
    /** Called when max session timeout fires */
    onMaxSessionTimeout: () => void;
    /** Called when speech final grace period expires */
    onSpeechFinalCommit: () => void;
    /** Called when triggered state times out */
    onTriggeredTimeout: () => void;
    /** Called when silence fallback fires */
    onSilenceTimeout: () => void;
    /** Called when streaming safety timeout fires */
    onStreamingSafetyTimeout: () => void;
    /** Called when VAD cooldown expires (noise absorption complete) */
    onVADCooldownComplete: () => void;
    /** Called when max utterance timeout fires (30s limit) */
    onMaxUtteranceTimeout: () => void;
}
interface UseVoiceTimeoutsReturn {
    startIdleTimeout: () => void;
    resetIdleTimeout: () => void;
    startMaxSessionTimeout: () => void;
    scheduleSpeechFinalCommit: () => void;
    cancelSpeechFinalCommit: () => void;
    startTriggeredTimeout: () => void;
    clearTriggeredTimeout: () => void;
    startSilenceTimeout: () => void;
    clearSilenceTimeout: () => void;
    startStreamingSafetyTimeout: () => void;
    clearStreamingSafetyTimeout: () => void;
    startVADCooldownTimeout: () => void;
    clearVADCooldownTimeout: () => void;
    startMaxUtteranceTimeout: () => void;
    clearMaxUtteranceTimeout: () => void;
    clearAllTimeouts: () => void;
    lastSpeechTimeRef: React.MutableRefObject<number>;
}
declare function useVoiceTimeouts(options: UseVoiceTimeoutsOptions): UseVoiceTimeoutsReturn;

/**
 * Turn Detector Port
 * Abstract interface for ML-based turn detection
 *
 * This is a SIGNAL provider, not a DECIDER.
 * The TurnManager combines this with EOU + VAD + timing to make final decisions.
 */

/**
 * Prediction result from turn detector
 */
interface TurnPrediction {
    /** Should commit turn now? */
    shouldCommit: boolean;
    /** Confidence 0-1 */
    confidence: number;
    /** Prediction reason */
    reason: TurnPredictionReason;
    /** Predicted time until turn end (ms), -1 if unknown */
    predictedEndMs?: number;
}
/**
 * Reasons for prediction
 */
type TurnPredictionReason = "semantic_complete" | "prosodic_cue" | "long_silence" | "backchannel" | "incomplete" | "interrupted" | "model_prediction" | "timeout";
/**
 * Context provided to turn detector
 */
interface TurnContext {
    transcript: string;
    utteranceDurationMs: number;
    sttConfidence: number;
    isFinal: boolean;
    speechFinal: boolean;
    vadProbability: number;
    silenceDurationMs: number;
    transcriptStableMs: number;
    conversationHistory?: ConversationTurn[];
    locale: Locale;
}
/**
 * A turn in the conversation history
 */
interface ConversationTurn {
    role: "user" | "assistant";
    text: string;
    durationMs?: number;
}
/**
 * Configuration for turn detector
 */
interface TurnDetectorConfig {
    /** Enable backchannel detection */
    detectBackchannels?: boolean;
    /** Enable interruption detection */
    detectInterruptions?: boolean;
    /** Minimum confidence to trigger (0-1) */
    confidenceThreshold?: number;
    /** Max turns in context window (default: 4) */
    maxContextTurns?: number;
    /** Force specific provider: 'local' | 'cloud' | 'heuristic' */
    forceProvider?: "local" | "cloud" | "heuristic";
    /** Debug logging */
    debug?: boolean;
}
/**
 * Turn Detector Provider Interface
 *
 * Implementations:
 * - HeuristicTurnDetector: Extracts EOU + trigger-detector logic (fallback)
 * - OnnxTurnDetector: Local ML model via ONNX.js
 * - CloudTurnDetector: Remote ML model via API
 * - MockTurnDetector: For testing
 */
interface TurnDetectorProvider {
    /** Provider name for logging */
    readonly name: string;
    /**
     * Initialize the detector (load model, etc.)
     * May be async for ML models
     */
    init(): Promise<void>;
    /**
     * Predict if the current utterance is complete
     * This is a SIGNAL, not a final decision
     */
    predict(context: TurnContext): Promise<TurnPrediction>;
    /**
     * Add a completed turn to conversation history
     * Used by ML models that need context
     */
    addTurn(turn: ConversationTurn): void;
    /**
     * Reset state (clear history, etc.)
     */
    reset(): void;
    /**
     * Cleanup resources
     */
    destroy(): void;
}

/**
 * Turn Manager - Intelligent turn-taking for voice conversations
 *
 * Aggregates multiple signal sources to decide when the user has finished speaking:
 * - Deepgram transcripts (text, confidence, speechFinal)
 * - Local RMS levels from AudioWorklet
 * - Timing heuristics (silence duration, transcript stability)
 * - Semantic completion patterns (Phase 4)
 * - Optional ML-based Turn Detector (Phase 7)
 *
 * Philosophy: Deepgram is a SENSOR, not a DECIDER. We make the commit decision.
 */

interface TurnManager {
    /** Process a transcript from Deepgram */
    handleTranscript(text: string, isFinal: boolean, speechFinal: boolean, confidence: number): void;
    /** Process RMS level from AudioWorklet */
    handleRMS(level: number): void;
    /** Process VAD event from Deepgram */
    handleVADEvent(event: "started" | "ended"): void;
    /** Process continuous VAD probability (0-1) for more nuanced decisions */
    handleVADProbability(probability: number): void;
    /** Set current state (for context-aware decisions) */
    setState(state: "listening" | "triggered" | "streaming" | "speaking" | "cooldown" | "vad_cooldown"): void;
    /** Get current accumulated transcript */
    getTranscript(): string;
    /** Get current VAD probability (0-1) */
    getVADProbability(): number;
    /** Check if user is currently speaking (with hysteresis) */
    isSpeaking(): boolean;
    /** Add completed turn to history (for ML turn detector context) */
    addCompletedTurn(turn: ConversationTurn): void;
    /** Get latest ML turn prediction (if detector available) */
    getLastPrediction(): TurnPrediction | null;
    /** Set turn detector dynamically (for late initialization) */
    setTurnDetector(detector: TurnDetectorProvider | null): void;
    /** Reset state for new turn */
    reset(): void;
    /** Cleanup timers */
    destroy(): void;
}

/** Conversation states supported by TurnManager */
type ConversationState = "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown";
interface UseTurnCoordinationOptions {
    speechFinalDelayMs: number;
    debug?: boolean;
    /** Optional ML-based turn detector provider */
    turnDetector?: TurnDetectorProvider | null;
    /** Called when user's turn is complete */
    onTurnComplete: (transcript: string, confidence: number) => void;
    /** Called when user interrupts during TTS */
    onBargeIn: () => void;
    /** Called when speech activity changes (for UI) */
    onSpeechActivity: (speaking: boolean) => void;
}
interface UseTurnCoordinationReturn {
    turnManagerRef: React.MutableRefObject<TurnManager | null>;
    createTurnManager: () => void;
    destroyTurnManager: () => void;
    resetTurnManager: () => void;
    feedTranscript: (text: string, isFinal: boolean, speechFinal: boolean, confidence: number) => void;
    feedRMS: (level: number) => void;
    feedVADEvent: (event: "started" | "ended") => void;
    feedVADProbability: (probability: number) => void;
    syncState: (state: ConversationState) => void;
    getTranscript: () => string;
    setTurnDetector: (detector: TurnDetectorProvider | null) => void;
}
declare function useTurnCoordination(options: UseTurnCoordinationOptions): UseTurnCoordinationReturn;

interface UseLlmIntegrationOptions {
    sendMessage?: (text: string) => Promise<string>;
    debug?: boolean;
}
interface UseLlmIntegrationReturn {
    llmBufferRef: React.MutableRefObject<string>;
    llmAbortRef: React.MutableRefObject<AbortController | null>;
    startLlmEarly: (transcript: string) => Promise<void>;
    abortLlm: () => void;
    clearBuffer: () => void;
    hasBufferedResponse: () => boolean;
    getBufferedResponse: () => string;
}
declare function useLlmIntegration(options: UseLlmIntegrationOptions): UseLlmIntegrationReturn;

/**
 * VAD Provider Port - Abstract contract for Voice Activity Detection
 *
 * This port defines the interface for any VAD implementation,
 * allowing the core voice module to remain decoupled from
 * specific VAD engines (Silero, WebRTC VAD, etc.)
 */
interface VADProvider {
    /**
     * Initialize the VAD model (load ONNX, setup audio context)
     * Must be called before start()
     */
    init(): Promise<void>;
    /**
     * Start processing audio from the given stream
     * @param stream - MediaStream from getUserMedia
     * @param callbacks - Event callbacks for speech detection
     */
    start(stream: MediaStream, callbacks: VADCallbacks): void;
    /**
     * Stop processing and release resources
     */
    stop(): void;
    /**
     * Check if VAD is currently running
     */
    isRunning(): boolean;
    /**
     * Get current speech probability (0-1)
     */
    getSpeechProbability(): number;
}
interface VADCallbacks {
    /** Called every frame with probability 0-1 */
    onSpeechProbability?: (probability: number) => void;
    /** Called when speech starts (crosses threshold) */
    onSpeechStart?: () => void;
    /** Called when speech ends (below threshold + hysteresis) */
    onSpeechEnd?: () => void;
    /** Called on VAD errors */
    onError?: (error: Error) => void;
}

interface UseSileroVADOptions {
    /** Probability threshold for speech detection (default: 0.5) */
    threshold?: number;
    /** Silence duration before triggering onSpeechEnd (default: 700ms) */
    silenceDuration?: number;
    /** Minimum speech duration (default: 250ms) */
    minSpeechDuration?: number;
    debug?: boolean;
}
interface UseSileroVADReturn {
    /** Ref for external access to VAD instance */
    vadRef: React.MutableRefObject<VADProvider | null>;
    /** Start Silero VAD with the given MediaStream */
    startVAD: (stream: MediaStream, callbacks: VADCallbacks) => Promise<void>;
    /** Stop VAD and cleanup */
    stopVAD: () => void;
    /** Get current speech probability (0-1) */
    getSpeechProbability: () => number;
    /** Check if VAD is currently running */
    isVADRunning: () => boolean;
}
declare function useSileroVAD(options?: UseSileroVADOptions): UseSileroVADReturn;

type TurnDetectorType = "heuristic" | "onnx" | "cloud" | "auto";
interface UseTurnDetectorOptions extends TurnDetectorConfig {
    /** Force specific provider type */
    type?: TurnDetectorType;
    /** Enable turn detector (default: true) */
    enabled?: boolean;
    /** VoiceKit API key for cloud provider */
    apiKey?: string;
    /** API base URL override (for dev/staging) */
    baseUrl?: string;
    /** Callback when quota exceeded */
    onQuotaExceeded?: (upgradeUrl: string) => void;
}
interface UseTurnDetectorReturn {
    /** Provider is initialized and ready */
    isReady: boolean;
    /** Currently active provider type */
    activeType: TurnDetectorType | null;
    /** Initialize the provider (auto-selects if type is "auto") */
    init: () => Promise<void>;
    /** Get turn prediction */
    predict: (context: TurnContext) => Promise<TurnPrediction | null>;
    /** Add completed turn to history */
    addTurn: (turn: ConversationTurn) => void;
    /** Reset provider state */
    reset: () => void;
    /** Get raw provider instance (for advanced use) */
    getProvider: () => TurnDetectorProvider | null;
    /** Last prediction result */
    lastPrediction: TurnPrediction | null;
    /** Error if initialization failed */
    error: Error | null;
}
/**
 * Hook for ML-based turn detection
 *
 * @example
 * ```tsx
 * const { isReady, predict, addTurn, reset } = useTurnDetector({
 *   type: "auto", // Auto-select based on device
 *   detectBackchannels: true,
 *   locale: "fr",
 * });
 *
 * // In your voice handler
 * const handleTranscript = async (context: TurnContext) => {
 *   if (!isReady) return;
 *
 *   const prediction = await predict(context);
 *   if (prediction?.shouldCommit) {
 *     // User finished speaking
 *   }
 * };
 * ```
 */
declare function useTurnDetector(options?: UseTurnDetectorOptions): UseTurnDetectorReturn;
/**
 * Create turn detector provider (non-hook version)
 * Use this for integration with TurnManager
 */
declare function createTurnDetector(options?: UseTurnDetectorOptions): Promise<TurnDetectorProvider>;

interface VoiceButtonProps extends UseVoiceKitOptions {
    /** Button variant: "styled" (KOND design) or "minimal" (text only, BYO styles) */
    variant?: "styled" | "minimal";
    /** Custom className for styling */
    className?: string;
    /** Custom text labels for each state (used in minimal variant or as aria-label) */
    labels?: Partial<Record<ConversationState$1, string>>;
    /** Render custom content instead of default button */
    children?: (props: {
        state: ConversationState$1;
        isActive: boolean;
        isSpeaking: boolean;
        start: () => Promise<void>;
        stop: () => void;
    }) => React$1.ReactNode;
    /** Button disabled state */
    disabled?: boolean;
    /** Custom inline styles */
    style?: React$1.CSSProperties;
    /** Size of the button (styled variant only) */
    size?: "sm" | "md" | "lg";
    /** Show label text alongside icon (styled variant only) */
    showLabel?: boolean;
}
/**
 * VoiceButton component for voice conversations
 */
declare function VoiceButton({ variant, className, labels, children, disabled, style, size, showLabel, ...voiceOptions }: VoiceButtonProps): react_jsx_runtime.JSX.Element;

/**
 * VoiceStatusIndicator - Minimal animated status indicator for voice conversations
 *
 * Adapted from KOND's understated aesthetic with:
 * - Configurable labels via props
 * - Configurable colors via props or CSS variables
 * - Optional framer-motion animations (falls back to CSS)
 *
 * @example
 * ```tsx
 * import { VoiceStatusIndicator } from "@kond.studio/voicekit/react";
 *
 * <VoiceStatusIndicator
 *   state={voice.state}
 *   userSpeaking={voice.userSpeaking}
 *   isActive={voice.isActive}
 * />
 * ```
 */

type DisplayState = "connecting" | "listening" | "recording" | "processing" | "speaking";
interface VoiceStatusLabels {
    connecting?: string;
    listening?: string;
    recording?: string;
    processing?: string;
    speaking?: string;
}
interface VoiceStatusColors {
    connecting?: string;
    listening?: string;
    recording?: string;
    processing?: string;
    speaking?: string;
}
interface VoiceStatusIndicatorProps {
    /** Current voice conversation state */
    state: ConversationState$1;
    /** Whether the user is currently speaking (VAD detected) */
    userSpeaking?: boolean;
    /** Whether voice conversation is active */
    isActive: boolean;
    /** Current transcript (optional, for display) */
    transcript?: string;
    /** Custom labels for each state */
    labels?: VoiceStatusLabels;
    /** Custom colors for each state */
    colors?: VoiceStatusColors;
    /** Additional className */
    className?: string;
    /** Whether to show labels (default: true on desktop) */
    showLabels?: boolean;
    /** Custom styles */
    style?: React$1.CSSProperties;
}
declare const VoiceStatusIndicator: React$1.NamedExoticComponent<VoiceStatusIndicatorProps>;

interface IconProps {
    /** Icon size class or pixel value */
    size?: string | number;
    /** Icon color (CSS color value) */
    color?: string;
    /** Additional className */
    className?: string;
}
/**
 * Microphone icon (static)
 */
declare function MicIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Waveform icon (static) - for idle/voice toggle
 */
declare function WaveformIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Idle voice icon - waveform style
 */
declare function IdleIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Listening indicator - steady glow dot
 */
declare function ListeningIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Recording indicator - quick pulse white dot
 */
declare function RecordingIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Processing indicator - thinking dots
 */
declare function ProcessingIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Speaking icon - soft ripple effect
 */
declare function SpeakingIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Spinner icon - for connecting/transcribing states
 */
declare function SpinnerIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Recording waveform - animated bars
 */
declare function RecordingWaveform({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
/**
 * Send arrow icon
 */
declare function SendIcon({ size, color, className }: IconProps): react_jsx_runtime.JSX.Element;
declare const VoiceIcons: {
    Mic: typeof MicIcon;
    Waveform: typeof WaveformIcon;
    Idle: typeof IdleIcon;
    Listening: typeof ListeningIcon;
    Recording: typeof RecordingIcon;
    Processing: typeof ProcessingIcon;
    Speaking: typeof SpeakingIcon;
    Spinner: typeof SpinnerIcon;
    RecordingWaveform: typeof RecordingWaveform;
    Send: typeof SendIcon;
};

export { type AudioSetupResult, type AutoStopReason, type ConversationState$1 as ConversationState, DEFAULT_CONFIG, DEFAULT_COOLDOWN_MS, DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_MAX_SESSION_MS, DEFAULT_SPEECH_FINAL_DELAY_MS, type DeepgramCallbacks, type DisplayState, type IconProps, IdleIcon, type InterruptionContext, ListeningIcon, type Locale, MAX_UTTERANCE_MS, MicIcon, ProcessingIcon, RecordingIcon, RecordingWaveform, SILENCE_FALLBACK_MS, SPEECH_HYSTERESIS_MS, STREAMING_SAFETY_TIMEOUT_MS, type STTCallbacks, SendIcon, SpeakingIcon, SpinnerIcon, TRIGGERED_TIMEOUT_MS, type TraceEvent, type TranscriptionResult$1 as TranscriptionResult, type TurnDetectorType, type UseAudioSetupReturn, type UseLLMIntegrationOptions, type UseLLMIntegrationReturn, type UseLlmIntegrationReturn, type UseSTTConnectionReturn, type UseSileroVADReturn, type UseTurnCoordinationOptions$1 as UseTurnCoordinationOptions, type UseTurnCoordinationReturn$1 as UseTurnCoordinationReturn, type UseTurnDetectorOptions, type UseTurnDetectorReturn, type UseVoiceConversationOptions, type UseVoiceConversationReturn, type UseVoiceKitOptions, type UseVoiceKitReturn, type UseVoiceTimeoutsOptions$1 as UseVoiceTimeoutsOptions, type UseVoiceTimeoutsReturn$1 as UseVoiceTimeoutsReturn, VAD_COOLDOWN_MS, VoiceButton, VoiceButton as VoiceButtonDefault, type VoiceButtonProps, VoiceIcons, type VoiceKitConfig, type VoiceKitError, type VoiceStatusColors, VoiceStatusIndicator, type VoiceStatusIndicatorProps, type VoiceStatusLabels, WaveformIcon, createTurnDetector, useAudioSetup, useLlmIntegration, useSTTConnection, useSileroVAD, useTurnCoordination, useTurnDetector, useVoiceConversation, useVoiceKit, useVoiceKit as useVoiceKitDefault, useVoiceTimeouts };
