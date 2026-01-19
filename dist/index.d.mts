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
type TurnDetectorType = "auto" | "local" | "cloud" | "heuristic" | "onnx";
/**
 * Conversation state machine states
 */
type ConversationState = "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown";
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
interface VoiceKitError$1 {
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
    onStateChange?: (state: ConversationState) => void;
    /**
     * Called on errors
     */
    onError?: (error: VoiceKitError$1) => void;
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
        type?: TurnDetectorType;
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
interface VADConfig {
    /** Probability threshold for speech detection (default: 0.5) */
    threshold?: number;
    /** Minimum speech duration before triggering onSpeechStart (default: 250ms) */
    minSpeechDuration?: number;
    /** Silence duration before triggering onSpeechEnd (default: 700ms) */
    silenceDuration?: number;
    /** Number of consecutive non-speech frames for hysteresis (default: 3) */
    hysteresisFrames?: number;
}
/**
 * Default VAD configuration
 */
declare const DEFAULT_VAD_CONFIG: Required<VADConfig>;

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
 * Default configuration
 */
declare const DEFAULT_TURN_DETECTOR_CONFIG: Required<Omit<TurnDetectorConfig, "forceProvider">>;

/**
 * HTTP Client Port - Abstraction for HTTP requests
 *
 * This port allows the SDK to be:
 * - Testable: Mock HTTP for unit tests
 * - Framework-agnostic: Swap fetch for axios, ky, etc.
 * - Server-side compatible: Use node-fetch or undici
 */
/**
 * HTTP request configuration
 */
interface HttpRequest {
    /** Full URL to request */
    url: string;
    /** HTTP method */
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body (will be JSON.stringify'd for objects) */
    body?: unknown;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Request credentials mode */
    credentials?: RequestCredentials;
}
/**
 * HTTP response wrapper
 */
interface HttpResponse {
    /** Whether the request was successful (status 200-299) */
    ok: boolean;
    /** HTTP status code */
    status: number;
    /** Status text */
    statusText: string;
    /** Response headers */
    headers: Headers;
    /** Response body as ReadableStream (for streaming) */
    body: ReadableStream<Uint8Array> | null;
    /** Parse response as JSON */
    json<T>(): Promise<T>;
    /** Parse response as text */
    text(): Promise<string>;
    /** Parse response as ArrayBuffer */
    arrayBuffer(): Promise<ArrayBuffer>;
}
/**
 * HTTP Client Port Interface
 *
 * Implement this interface to provide custom HTTP handling:
 * - Add authentication headers
 * - Add logging/metrics
 * - Use different HTTP libraries
 * - Mock for testing
 */
interface HttpClientPort {
    /**
     * Make an HTTP request
     * @param request - Request configuration
     * @returns Promise resolving to the response
     * @throws NetworkError on connection failure
     */
    request(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * TTS Source Port - Abstract contract for fetching TTS audio data
 *
 * This port separates the I/O (fetching audio) from playback logic.
 * The core TTS playback module uses this port to get audio streams.
 *
 * This enables:
 * - Testing with mock audio data
 * - Swapping TTS providers (ElevenLabs, OpenAI, etc.)
 * - Server-side rendering compatibility
 */

/**
 * Options for fetching TTS audio
 */
interface TTSFetchOptions {
    /** Voice ID (provider-specific or preset name) */
    voice?: string;
    /** TTS model override */
    model?: string;
    /** Speech speed (0.5-1.5) */
    speed?: number;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
}
/**
 * Result of a TTS fetch - either streaming or complete
 */
interface TTSAudioResult {
    /** Audio content type (e.g., "audio/pcm", "audio/mp3") */
    contentType: string;
    /** Sample rate in Hz (e.g., 24000) */
    sampleRate: number;
    /** Number of channels (1 = mono, 2 = stereo) */
    channels: number;
    /** Bits per sample (e.g., 16) */
    bitsPerSample: number;
    /** Stream of audio chunks */
    stream: AsyncIterable<Uint8Array>;
}
/**
 * Port for fetching TTS audio data
 *
 * Implementation examples:
 * - HttpTTSSource: Fetches from a TTS API endpoint
 * - MockTTSSource: Returns pre-recorded audio for testing
 * - WebRTCTTSSource: Real-time TTS over WebRTC
 */
interface TTSSourcePort {
    /**
     * Fetch TTS audio for the given text
     *
     * @param text - Text to synthesize
     * @param locale - Language locale
     * @param options - Additional options
     * @returns Audio result with stream of PCM chunks
     * @throws TTSError on failure
     */
    fetchAudio(text: string, locale: Locale, options?: TTSFetchOptions): Promise<TTSAudioResult>;
    /**
     * Prefetch audio for later playback (optional optimization)
     * Returns a handle that can be passed to a player
     *
     * @param text - Text to synthesize
     * @param locale - Language locale
     * @param options - Additional options
     * @returns Promise of prefetched audio handle
     */
    prefetch?(text: string, locale: Locale, options?: TTSFetchOptions): Promise<PrefetchedAudio>;
    /**
     * Cancel a prefetch operation
     */
    cancelPrefetch?(handle: PrefetchedAudio): void;
}
/**
 * Handle for prefetched audio
 */
interface PrefetchedAudio {
    /** Unique ID for this prefetch */
    id: string;
    /** Whether prefetch is complete */
    isComplete: boolean;
    /** Total bytes fetched so far */
    totalBytes: number;
    /** Any error that occurred */
    error?: Error;
    /** Get the audio result (may block until prefetch complete) */
    getResult(): Promise<TTSAudioResult>;
}

/**
 * VoiceKit - Main class for voice conversations
 *
 * Provides a simple high-level API for integrating voice capabilities.
 *
 * @example
 * ```typescript
 * import { VoiceKit } from "@kond.studio/voicekit";
 *
 * const voice = new VoiceKit({
 *   locale: "fr",
 *   onTranscript: async (text) => {
 *     const response = await myLLM.generate(text);
 *     voice.speak(response);
 *   },
 *   onStateChange: (state) => console.log("State:", state),
 * });
 *
 * // Start listening
 * await voice.start();
 *
 * // User speaks... onTranscript is called
 *
 * // Stop when done
 * voice.stop();
 * ```
 */

/**
 * Optional dependencies that can be injected into VoiceKit.
 * All have sensible defaults but can be overridden for testing or customization.
 */
interface VoiceKitDeps {
    /** HTTP client for API calls */
    httpClient?: HttpClientPort;
    /** TTS audio source (for fetching audio streams) */
    ttsSource?: TTSSourcePort;
    /** STT adapter (speech-to-text) */
    sttProvider?: StreamingSTTPort;
    /** VAD adapter (voice activity detection) */
    vadProvider?: VADProvider;
    /** Turn detector adapter */
    turnDetectorProvider?: TurnDetectorProvider;
}
/**
 * VoiceKit instance
 */
declare class VoiceKit {
    private config;
    private deps;
    private state;
    private locale;
    private httpClient;
    private ttsSource;
    private stt;
    private vad;
    private turnDetector;
    private turnManager;
    private ttsPlayer;
    private mediaStream;
    private isInitialized;
    private audioContext;
    private audioWorklet;
    private audioSource;
    private ttsQueue;
    private sentenceAccumulator;
    private currentTranscript;
    private isProcessing;
    /**
     * Create a VoiceKit instance
     *
     * @param config - Configuration options
     * @param deps - Optional dependency injection for testing/customization
     */
    constructor(config: VoiceKitConfig, deps?: VoiceKitDeps);
    /**
     * Initialize adapters and request microphone permission
     */
    init(): Promise<void>;
    /**
     * Create the appropriate turn detector based on type
     *
     * Strategy:
     * - "local" / "onnx": Force local ONNX inference (desktop only)
     * - "cloud": Force cloud API inference
     * - "heuristic": Fast regex-based fallback
     * - "auto" (default): Device capability detection:
     *   - Desktop with 4GB+ RAM → local ONNX
     *   - Mobile or low memory → cloud API
     *   - No auth → heuristic fallback
     */
    private createTurnDetector;
    /**
     * Auto-select turn detector based on device capabilities
     *
     * Decision tree:
     * 1. Can run local ONNX? (desktop with 4GB+ RAM, WebAssembly, IndexedDB)
     *    → Use local ONNX for fastest latency
     * 2. Has cloud auth? (apiKey or token)
     *    → Use cloud API
     * 3. No auth?
     *    → Fall back to heuristic
     */
    private createAutoTurnDetector;
    /**
     * Start listening for voice input
     */
    start(): Promise<void>;
    /**
     * Stop listening
     */
    stop(): void;
    /**
     * Speak text using TTS
     * Handles sentence chunking and progressive playback
     */
    speak(text: string): void;
    /**
     * Finish speaking - flush any remaining text
     */
    finishSpeaking(): void;
    /**
     * Interrupt current TTS playback (barge-in)
     */
    interrupt(): void;
    private handleInterimTranscript;
    private handleFinalTranscript;
    private handleTurnComplete;
    private handleUtteranceEnd;
    private processTranscript;
    private handleSpeechStart;
    private handleSpeechEnd;
    private updateVADProbability;
    private setState;
    private handleError;
    /**
     * Get current conversation state
     */
    getState(): ConversationState;
    /**
     * Get current locale
     */
    getLocale(): Locale;
    /**
     * Check if voice is active (listening or processing)
     */
    isActive(): boolean;
    /**
     * Check if currently speaking
     */
    isSpeaking(): boolean;
    /**
     * Destroy instance and cleanup resources
     */
    destroy(): void;
}
/**
 * Create a VoiceKit instance
 *
 * @param config - Configuration options
 * @param deps - Optional dependency injection for testing/customization
 */
declare function createVoiceKit(config: VoiceKitConfig, deps?: VoiceKitDeps): VoiceKit;

/**
 * TTS Provider Port - Abstract contract for text-to-speech
 *
 * This port defines the interface for any TTS implementation,
 * allowing the core voice module to remain decoupled from
 * specific TTS services (ElevenLabs, OpenAI, etc.)
 */

interface TTSProvider {
    /**
     * Synthesize text to speech and play the audio
     * @param text - The text to synthesize
     * @param locale - Language locale ("fr" or "en")
     * @returns Promise that resolves when playback starts (not when it ends)
     */
    synthesize(text: string, locale: Locale): Promise<void>;
    /**
     * Stop any currently playing audio
     */
    stop(): void;
    /**
     * Check if audio is currently playing
     */
    isPlaying(): boolean;
}

/**
 * VoiceKit Error Classes
 *
 * Structured error handling for better debugging and error recovery.
 * All VoiceKit errors extend VoiceKitError for easy catching.
 */
/**
 * Error codes for VoiceKit errors
 */
type VoiceKitErrorCode = "NETWORK_ERROR" | "AUTH_FAILED" | "CONFIGURATION_ERROR" | "TRANSCRIPTION_FAILED" | "TTS_FAILED" | "VAD_FAILED" | "TURN_DETECTION_FAILED" | "RATE_LIMITED" | "TIMEOUT" | "CANCELLED" | "UNKNOWN";
/**
 * Base error class for all VoiceKit errors
 */
declare class VoiceKitError extends Error {
    readonly code: VoiceKitErrorCode;
    readonly retryable: boolean;
    readonly cause?: Error;
    constructor(message: string, code: VoiceKitErrorCode, options?: {
        retryable?: boolean;
        cause?: Error;
    });
}
/**
 * Network-related errors (connection failed, DNS resolution, etc.)
 */
declare class NetworkError extends VoiceKitError {
    constructor(message: string, cause?: Error);
}
/**
 * Authentication/Authorization errors
 */
declare class AuthError extends VoiceKitError {
    constructor(message: string, cause?: Error);
}
/**
 * Configuration errors (invalid config, missing required fields)
 */
declare class ConfigurationError extends VoiceKitError {
    constructor(message: string);
}
/**
 * Speech-to-Text transcription errors
 */
declare class TranscriptionError extends VoiceKitError {
    constructor(message: string, options?: {
        retryable?: boolean;
        cause?: Error;
    });
}
/**
 * Text-to-Speech synthesis errors
 */
declare class TTSError extends VoiceKitError {
    constructor(message: string, options?: {
        retryable?: boolean;
        cause?: Error;
    });
}
/**
 * Voice Activity Detection errors
 */
declare class VADError extends VoiceKitError {
    constructor(message: string, options?: {
        retryable?: boolean;
        cause?: Error;
    });
}
/**
 * Turn detection errors
 */
declare class TurnDetectionError extends VoiceKitError {
    constructor(message: string, options?: {
        retryable?: boolean;
        cause?: Error;
    });
}
/**
 * Rate limit exceeded
 */
declare class RateLimitError extends VoiceKitError {
    readonly retryAfter?: number;
    constructor(message: string, retryAfter?: number);
}
/**
 * Request timeout
 */
declare class TimeoutError extends VoiceKitError {
    constructor(message: string);
}
/**
 * Operation was cancelled
 */
declare class CancelledError extends VoiceKitError {
    constructor(message?: string);
}
/**
 * Check if an error is a VoiceKitError
 */
declare function isVoiceKitError(error: unknown): error is VoiceKitError;
/**
 * Check if an error is retryable
 */
declare function isRetryableError(error: unknown): boolean;
/**
 * Wrap unknown errors in VoiceKitError
 */
declare function wrapError(error: unknown, defaultMessage?: string): VoiceKitError;

/**
 * VoiceKit Environment Configuration
 *
 * Centralized configuration for all environments.
 * Users can override baseUrl in VoiceKitConfig, but endpoints are fixed.
 */
/**
 * Environment-specific API configuration
 */
interface EnvironmentConfig {
    /** Base URL for all API calls */
    baseUrl: string;
    /** WebSocket URL for STT (derived from baseUrl if not set) */
    wsUrl?: string;
}
/**
 * Built-in environment presets
 */
declare const ENVIRONMENTS: Record<string, EnvironmentConfig>;
/**
 * API endpoint paths (relative to baseUrl)
 * These are implementation details and should not be exposed to users.
 */
declare const ENDPOINTS: {
    /** Token exchange endpoint */
    readonly token: "/token";
    /** Turn detection API */
    readonly turnDetect: "/turn-detect";
    /** TTS streaming endpoint */
    readonly ttsStream: "/tts/stream";
};
/**
 * Default voice presets
 */
declare const VOICE_PRESETS: {
    readonly "marie-fr": "9BWtsMINqrJLrRacOk9x";
    readonly "thomas-fr": "ThT5KcBeYPX3keUQqHPh";
    readonly "emma-en": "21m00Tcm4TlvDq8ikWAM";
    readonly "james-en": "JBFqnCBsd6RMkjVDRZzb";
};
/**
 * Default configuration values
 */
declare const DEFAULTS: {
    /** Default base URL for API calls (production) */
    baseUrl: string;
    /** Default locale */
    locale: "fr";
    /** Default worklet URL */
    workletUrl: string;
    /** Turn detection defaults */
    turnDetection: {
        type: "auto";
        confidenceThreshold: number;
        silenceTimeoutMs: number;
        detectBackchannels: boolean;
    };
    /** TTS defaults */
    tts: {
        speed: number;
    };
    /** Internal timing */
    timing: {
        cooldownMs: number;
        gracePeriodMs: number;
        maxSilenceMs: number;
    };
    /** Debug mode */
    debug: boolean;
};
/**
 * Get environment config by name or detection
 */
declare function getEnvironmentConfig(env?: string): EnvironmentConfig;
/**
 * Build full endpoint URL from base URL and path
 */
declare function buildEndpointUrl(baseUrl: string, endpoint: keyof typeof ENDPOINTS): string;
/**
 * Resolve voice ID from preset name or direct ID
 */
declare function resolveVoiceId(voice: string): string;

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

interface TurnManagerConfig {
    /** Minimum silence duration before considering commit (default: 700ms) */
    silenceThresholdMs: number;
    /** Transcript must be stable (unchanged) for this long (default: 500ms) */
    stabilityThresholdMs: number;
    /** Force commit after this much silence regardless (default: 1500ms) */
    maxSilenceMs: number;
    /** Grace period after speechFinal before commit (default: 1200ms) */
    gracePeriodMs: number;
    /** RMS level below this = silence (default: 0.01) */
    rmsThreshold: number;
    /** Minimum speech duration to be considered real (default: 150ms) */
    speechHysteresisMs: number;
    /** Hangover time after RMS drops (default: 300ms) */
    speechHangoverMs: number;
    /** VAD probability threshold for active speech (default: 0.5) */
    vadProbabilityThreshold: number;
    /** Called when user's turn is complete - time to respond */
    onTurnComplete: (transcript: string, confidence: number) => void;
    /** Called when user interrupts during TTS playback */
    onBargeIn: () => void;
    /** Called when speech activity changes (for UI feedback) */
    onSpeechActivity: (speaking: boolean) => void;
    /** Language locale for semantic completion patterns (default: "fr") */
    locale?: "fr" | "en";
    /** Optional ML-based turn detector provider */
    turnDetector?: TurnDetectorProvider;
    /** Weight for ML prediction vs heuristics (0-1, default: 0.6) */
    mlWeight?: number;
    debug?: boolean;
}
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
/**
 * Create a Turn Manager instance
 */
declare function createTurnManager(config: Partial<TurnManagerConfig> & Pick<TurnManagerConfig, "onTurnComplete" | "onBargeIn" | "onSpeechActivity">): TurnManager;

/**
 * End-of-Utterance (EOU) Detector
 *
 * Hybrid approach combining multiple signals to determine
 * when the user has finished speaking:
 *
 * 1. Linguistic patterns (regex-based incomplete detection)
 * 2. VAD probability (voice activity from Silero/RMS)
 * 3. STT confidence scores
 * 4. Terminal punctuation detection
 * 5. Semantic completion patterns
 *
 * Industry standard: LiveKit/Vapi use 135M param ML models (~98% accuracy)
 * VoiceKit approach: Multi-signal heuristics (~90-95% accuracy)
 */

interface EOUResult {
    isComplete: boolean;
    score: number;
    reason: EOUReason;
}
type EOUReason = "regex_incomplete" | "vad_active" | "low_confidence" | "terminal_punctuation" | "semantic_complete" | "heuristic" | "short_utterance";
interface EOUContext {
    transcript: string;
    confidence: number;
    vadProbability: number;
    locale: Locale;
    silenceDurationMs: number;
    transcriptStableMs: number;
}
/**
 * Detect End-of-Utterance using hybrid multi-signal approach
 *
 * Decision tree:
 * 1. If regex detects incomplete → NOT complete (score 0.2)
 * 2. If VAD probability > 0.7 → NOT complete (score 0.3)
 * 3. If confidence < 0.7 → NOT complete (score = confidence)
 * 4. If very short (< 3 chars) → NOT complete (score 0.1)
 * 5. If terminal punctuation → COMPLETE (score 0.95)
 * 6. If semantic pattern match → COMPLETE (score 0.9)
 * 7. If long silence (> 800ms) + stable → COMPLETE (score 0.85)
 * 8. Default → COMPLETE with moderate confidence (score 0.75)
 *
 * @param context - All available signals
 * @returns EOUResult with completion status, confidence score, and reason
 */
declare function detectEndOfUtterance(context: EOUContext): EOUResult;
/**
 * Quick check for EOU (synchronous, no async overhead)
 * Use for real-time decisions in tight loops
 */
declare function isUtteranceComplete(transcript: string, confidence: number, locale: Locale): boolean;
/**
 * Get human-readable explanation for EOU decision
 */
declare function explainEOUResult(result: EOUResult): string;

/**
 * Trigger Detector - Detect when to trigger LLM early
 *
 * Uses simple regex patterns to detect verb + object combinations
 * that indicate a complete user intent.
 *
 * This is intentionally simple - no ML, no embeddings.
 * The goal is to detect "create an event tomorrow" as early as possible.
 */

interface TriggerState {
    hasVerb: boolean;
    hasObject: boolean;
    confidence: number;
    transcript: string;
}
/**
 * Analyze transcript for trigger conditions
 */
declare function analyzeTrigger(transcript: string, confidence: number): TriggerState;
/**
 * Check if we should trigger LLM early
 *
 * Conditions:
 * - verb + object detected
 * - confidence > 80%
 * - (silence will be checked by caller)
 */
declare function shouldTriggerEarly(transcript: string, confidence: number, minConfidence?: number): boolean;
/**
 * Check if transcript is a backchannel (acknowledgment that doesn't need a response)
 *
 * Backchannels are short utterances like "mm-hmm", "oui", "ok" that indicate
 * the user is listening but not asking a question or giving an instruction.
 *
 * @param transcript - The transcript to check
 * @param confidence - STT confidence score
 * @param locale - "fr" or "en"
 * @returns true if this is a backchannel
 */
declare function isBackchannel$1(transcript: string, confidence: number, locale?: Locale): boolean;
/**
 * Check if utterance is likely incomplete (user is mid-sentence)
 *
 * Uses multiple heuristics:
 * 1. Pattern matching for incomplete clauses
 * 2. Terminal punctuation check
 * 3. Minimum word count
 * 4. Partial word detection
 * 5. Unusual word endings (likely cut-off mid-word)
 *
 * @param transcript - The transcript to check
 * @param locale - "fr" or "en"
 * @returns true if utterance appears incomplete
 */
declare function isLikelyIncomplete$1(transcript: string, locale?: Locale): boolean;
/**
 * Check if utterance is likely complete (semantically finished)
 *
 * Detects patterns that indicate the user has finished their turn:
 * - Polite endings (please, s'il vous plaît)
 * - Gratitude (thanks, merci)
 * - Conclusions (that's all, voilà)
 * - Short definitive answers (yes, no)
 * - Commands (stop, continue)
 *
 * @param transcript - The transcript to check
 * @param locale - "fr" or "en"
 * @returns true if utterance appears complete
 */
declare function isLikelyComplete(transcript: string, locale?: Locale): boolean;
/**
 * Linguistic analysis signals for turn-taking decisions
 */
interface LinguisticSignals {
    endsWithTerminal: boolean;
    isQuestion: boolean;
    hasIncompleteClause: boolean;
    trailingConjunction: boolean;
    wordCount: number;
}
/**
 * Analyze linguistic signals in transcript
 */
declare function analyzeLinguisticSignals(transcript: string, locale?: Locale): LinguisticSignals;

/**
 * TTS Model Router - Turbo by Default
 *
 * Flash v2.5: ~75ms latency - DISABLED (causes word skipping issues)
 * Turbo v2.5: ~250-300ms latency, excellent quality - DEFAULT
 *
 * Flash was causing pronunciation issues (mots mâchés) even with
 * stability adjustments. Turbo provides reliable quality.
 */
type TtsModel = "eleven_flash_v2_5" | "eleven_turbo_v2_5";
interface TtsContext {
    /** Content importance level */
    importance?: "low" | "normal" | "high";
    /** Whether this is an explanation or instructional content */
    isExplanation?: boolean;
    /** Position in the response (0 = first sentence) */
    sentenceIndex?: number;
}
interface TtsModelSelection {
    model: TtsModel;
    reason: string;
}
/**
 * Select the appropriate TTS model based on text content and context
 *
 * @param text The text to speak
 * @param context Optional context for selection
 * @returns The selected model with reason
 */
declare function selectTtsModel(text: string, context?: TtsContext): TtsModel;
/**
 * Select model with detailed reason (for logging/debugging)
 */
declare function selectTtsModelWithReason(text: string, context?: TtsContext): TtsModelSelection;
/**
 * Check if text is likely a short acknowledgment
 * (useful for analytics)
 */
declare function isShortAcknowledgment(text: string): boolean;

/**
 * TTS Player - Clean Architecture PCM Audio Playback
 *
 * Plays PCM audio from a TTSSourcePort using Web Audio API.
 * No global state - all state is encapsulated in the class.
 * No direct fetch - uses injected TTSSourcePort for audio data.
 *
 * Audio format: 24kHz, 16-bit signed little-endian, mono
 */

/**
 * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
 */
declare function pcm16ToFloat32(pcmData: Uint8Array): Float32Array;
/**
 * Create AudioBuffer from Float32 samples
 */
declare function createAudioBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer;
/**
 * Handle incomplete PCM samples at chunk boundaries
 * Returns [processable data, remaining bytes]
 */
declare function alignPCMChunk(chunk: Uint8Array, pendingBytes: Uint8Array | null): [Uint8Array, Uint8Array | null];
/**
 * Configuration for TTSPlayer
 */
interface TTSPlayerConfig {
    /** Default voice ID */
    voice?: string;
    /** Debug logging */
    debug?: boolean;
}
/**
 * Callbacks for TTSPlayer events
 */
interface TTSPlayerCallbacks {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: Error) => void;
}
/**
 * TTS Player - Plays audio from TTSSourcePort
 *
 * Clean architecture: No global state, uses dependency injection.
 *
 * Usage:
 * ```typescript
 * const httpClient = new FetchHttpClient();
 * const ttsSource = new HttpTTSSource(httpClient, { baseUrl: "/api/voice/v1" });
 * const player = new TTSPlayer(ttsSource, { voice: "marie-fr" });
 *
 * await player.speak("Bonjour!", "fr", {
 *   onEnd: () => console.log("Done speaking")
 * });
 * ```
 */
declare class TTSPlayer {
    private source;
    private config;
    private audioContext;
    private isPlaying;
    private shouldStop;
    private pendingBytes;
    private nextPlayTime;
    private activeSourceNodes;
    constructor(source: TTSSourcePort, config?: TTSPlayerConfig);
    /**
     * Speak text using streaming TTS
     */
    speak(text: string, locale?: Locale, callbacks?: TTSPlayerCallbacks, options?: {
        voice?: string;
        model?: TtsModel;
    }): Promise<void>;
    /**
     * Stop playback
     */
    stop(): void;
    /**
     * Check if currently playing
     */
    get playing(): boolean;
    /**
     * Dispose of resources
     */
    dispose(): void;
    private getAudioContext;
    private processAndPlayChunk;
    private scheduleAudioBuffer;
    private waitForPlaybackComplete;
    private log;
}
/**
 * Create a TTSPlayer instance
 */
declare function createTTSPlayer(source: TTSSourcePort, config?: TTSPlayerConfig): TTSPlayer;

/**
 * Streaming TTS Client - PCM Real-time Playback
 * Uses Web Audio API for true chunk-by-chunk playback
 *
 * Server sends PCM 24kHz 16-bit signed little-endian mono
 * Client converts to Float32 and plays immediately
 *
 * Supports pre-fetching for seamless sentence transitions:
 * - prefetchAudio(): Fetch and buffer audio without playing
 * - playPreloadedAudio(): Play previously fetched audio instantly
 */

/**
 * TTS Streaming configuration
 */
interface TTSStreamingConfig {
    /** TTS stream endpoint URL (default: /api/voice/v1/tts/stream) */
    ttsStreamUrl: string;
}
/**
 * Configure TTS streaming endpoint
 * Call this before using any TTS functions to set your backend URL
 */
declare function configureTTSStreaming(newConfig: Partial<TTSStreamingConfig>): void;
/**
 * Get current TTS streaming config
 */
declare function getTTSStreamingConfig(): TTSStreamingConfig;
interface PreloadedAudio {
    chunks: Uint8Array[];
    totalBytes: number;
    abortController: AbortController;
    isComplete: boolean;
    error?: Error;
}
/**
 * Stop streaming playback completely
 */
declare function stopStreamingTTS(): void;
/**
 * Check if streaming TTS is playing
 */
declare function isStreamingTTSPlaying(): boolean;
/**
 * Speak text using real-time PCM streaming
 * Plays audio chunks as they arrive - no buffering delay
 *
 * @param ttsModel Optional TTS model override (defaults to server-side routing)
 * @param voice Optional ElevenLabs voice ID (defaults to locale-based selection)
 * @param ttsStreamUrl Optional explicit TTS endpoint URL (overrides global config)
 * @param apiKey Optional API key for authentication
 */
declare function speakTextStreaming(text: string, locale?: Locale, onStart?: () => void, onEnd?: () => void, onError?: (error: Error) => void, ttsModel?: TtsModel, voice?: string, ttsStreamUrl?: string, apiKey?: string): Promise<void>;
/**
 * Speak text with callback (wrapper for voice conversation)
 */
declare function speakTextStreamingWithCallback(text: string, locale: Locale | undefined, onEnd: () => void, onError?: (error: Error) => void, ttsModel?: TtsModel, voice?: string, ttsStreamUrl?: string, apiKey?: string): void;
/**
 * Pre-fetch audio without playing
 * Returns a PreloadedAudio object that can be played later with playPreloadedAudio()
 *
 * Usage:
 * 1. While current sentence plays: const next = await prefetchAudio("next sentence", "fr")
 * 2. When current ends: playPreloadedAudio(next, onEnd, onError)
 *
 * @param ttsModel Optional TTS model override (defaults to server-side routing)
 * @param voice Optional ElevenLabs voice ID (defaults to locale-based selection)
 * @param ttsStreamUrl Optional explicit TTS endpoint URL (overrides global config)
 * @param apiKey Optional API key for authentication
 */
declare function prefetchAudio(text: string, locale?: Locale, ttsModel?: TtsModel, voice?: string, ttsStreamUrl?: string, apiKey?: string): Promise<PreloadedAudio>;
/**
 * Cancel a pre-fetch in progress
 */
declare function cancelPrefetch(preloaded: PreloadedAudio): void;
/**
 * Play pre-fetched audio instantly
 * Much faster than speakTextStreaming because audio is already buffered
 */
declare function playPreloadedAudio(preloaded: PreloadedAudio, onStart?: () => void, onEnd?: () => void, onError?: (error: Error) => void): Promise<void>;
/**
 * Check if preloaded audio is ready to play
 */
declare function isPreloadedReady(preloaded: PreloadedAudio | null): boolean;
/**
 * DEBUG: Test AudioContext by playing a simple beep
 * Call from browser console: window.__testTTSBeep?.()
 */
declare function testAudioContextBeep(): void;

/**
 * Sentence Chunker - Robust sentence boundary detection for TTS
 * Handles edge cases: abbreviations, numbers, URLs, quotes, etc.
 */
/**
 * Sentence boundary detection for streaming text
 * Returns [completeSentences[], remainingIncomplete]
 */
declare function extractSentences(buffer: string, options?: {
    minLength?: number;
    maxLength?: number;
    forceFlush?: boolean;
}): [sentences: string[], remaining: string];
/**
 * Create a sentence accumulator for streaming text
 * Buffers text and emits complete sentences
 *
 * For TTS: Automatically strips code blocks (```...```) which should be
 * displayed but not read aloud.
 */
declare function createSentenceAccumulator(onSentence: (sentence: string) => void, options?: {
    minLength?: number;
    maxLength?: number;
}): {
    append: (text: string) => void;
    flush: () => void;
    reset: () => void;
    getBuffer: () => string;
};
/**
 * Type for the sentence accumulator returned by createSentenceAccumulator
 */
type SentenceAccumulator = ReturnType<typeof createSentenceAccumulator>;

/**
 * TTS Queue - Progressive sentence-by-sentence TTS playback with PRE-FETCH
 *
 * Allows streaming text to start playing immediately as sentences complete,
 * instead of waiting for the entire response.
 *
 * PRE-FETCH OPTIMIZATION:
 * While current sentence plays, the next one is being fetched in background.
 * When current ends, next plays INSTANTLY (no network latency).
 *
 * Architecture:
 *   currentAudio → playing
 *   nextAudio    → preloaded (N+1 only, never more)
 *
 * Usage:
 * 1. Create queue: const queue = createTTSQueue("fr", onEnd, onError)
 * 2. Feed sentences as they arrive: queue.push("Salut.")
 * 3. Signal end of stream: queue.finish()
 * 4. Cancel if needed: queue.cancel()
 */

interface TTSQueueOptions {
    locale: Locale;
    /** ElevenLabs voice ID (optional, defaults to locale-based selection) */
    voice?: string;
    /** Explicit TTS stream endpoint URL (overrides global config) */
    ttsStreamUrl?: string;
    /** API key for authentication */
    apiKey?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: Error) => void;
    debug?: boolean;
}
interface TTSQueue {
    /** Add a sentence to the queue with optional model override */
    push: (sentence: string, ttsModel?: TtsModel) => void;
    /** Signal that no more sentences will come */
    finish: () => void;
    /** Cancel playback and clear queue */
    cancel: () => void;
    /** Check if queue is active */
    isActive: () => boolean;
}
/**
 * Create a TTS queue for progressive playback with pre-fetching
 */
declare function createTTSQueue(options: TTSQueueOptions): TTSQueue;

/**
 * Sanitize text for TTS (Text-to-Speech)
 *
 * In voice conversation mode, the agent can generate visual blocks
 * (mermaid, cards, charts, etc.) that should be DISPLAYED but not READ aloud.
 *
 * This function strips those blocks and markdown formatting while keeping
 * the natural prose.
 */
/**
 * Remove all visual blocks, markdown syntax, and unreadable content from text
 * Handles: code blocks, markdown formatting, URLs, tables, etc.
 */
declare function sanitizeForTTS(text: string): string;
/**
 * Check if text has visual blocks that will be stripped
 * Useful to know if there's visual content to display
 */
declare function hasVisualBlocks(text: string): boolean;

/**
 * Device Capability Detection
 * Determines if device can run local ML models efficiently
 */
/**
 * Check if device is capable of running local ONNX models
 *
 * Criteria:
 * - Memory >= 4GB
 * - WASM SIMD support
 * - Not on slow connection (unless model cached)
 * - Desktop or powerful mobile
 */
declare function isDeviceCapableForLocalML(): Promise<boolean>;
/**
 * Get device capability summary (for debugging)
 */
declare function getDeviceCapabilitySummary(): Promise<{
    memory: number | undefined;
    wasmSimd: boolean;
    mobile: boolean;
    connectionType: string | undefined;
    saveData: boolean;
    modelCached: boolean;
    capable: boolean;
}>;

/**
 * Browser Utilities
 * Feature detection and device compatibility checks for voice conversations
 */
/**
 * Detect if running on iOS (iPhone, iPad, iPod)
 */
declare function isIOS(): boolean;
/**
 * Detect if running on Safari (macOS or iOS)
 */
declare function isSafari(): boolean;
/**
 * Get iOS version number
 * Returns 0 if not iOS or version cannot be determined
 */
declare function getIOSVersion(): number;
/**
 * Check if VAD (Voice Activity Detection) is supported
 * VAD requires:
 * - AudioContext / WebAudio API
 * - MediaDevices API
 * - WebAssembly
 * - On iOS: version 15+ for AudioContext behavior
 */
declare function isVADSupported(): boolean;
/**
 * Check if voice conversation mode should be enabled
 * Returns false to fallback to PTT mode
 */
declare function isVoiceConversationSupported(): boolean;
/**
 * Resume AudioContext if suspended (required after user gesture on iOS)
 */
declare function ensureAudioContextResumed(ctx: AudioContext): Promise<void>;
/**
 * Sleep utility - simple promise-based delay
 */
declare function sleep(ms: number): Promise<void>;

/**
 * Fetch HTTP Client Adapter
 *
 * Default implementation of HttpClientPort using the Fetch API.
 * Works in browsers and modern Node.js (18+).
 */

/**
 * Configuration for FetchHttpClient
 */
interface FetchHttpClientConfig {
    /** Base URL to prepend to relative URLs */
    baseUrl?: string;
    /** Default headers to include in all requests */
    defaultHeaders?: Record<string, string>;
    /** Default credentials mode */
    credentials?: RequestCredentials;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
}
/**
 * Default HTTP client using the Fetch API
 */
declare class FetchHttpClient implements HttpClientPort {
    private config;
    constructor(config?: FetchHttpClientConfig);
    request(req: HttpRequest): Promise<HttpResponse>;
    private buildUrl;
    private wrapResponse;
    private combineSignals;
}
/**
 * Create a FetchHttpClient instance
 */
declare function createFetchHttpClient(config?: FetchHttpClientConfig): FetchHttpClient;

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
 * Configure Deepgram adapter globally
 * @internal Usually not needed - SDK handles this automatically
 */
declare function configureDeepgram(config: Partial<DeepgramConfig>): void;
/**
 * Get current Deepgram config
 * @internal
 */
declare function getDeepgramConfig(): DeepgramConfig;
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
 * Create a Deepgram streaming adapter
 * Uses VoiceKit gateway for authentication
 *
 * @param config Config with apiKey (required) and optional baseUrl
 * @param userId User ID for observability
 */
declare function createDeepgramAdapter(config: Partial<DeepgramConfig> & {
    apiKey: string;
}, userId?: string): DeepgramStreamingAdapter;
/**
 * Create a Deepgram adapter with custom auth token provider
 * For advanced use cases where you handle token fetching yourself
 */
declare function createDeepgramAdapterWithAuth(getAuthToken: () => Promise<string | TokenResponse>, config?: Partial<DeepgramConfig>, userId?: string): DeepgramStreamingAdapter;

/**
 * Fetch-based TTS Adapter
 *
 * Implements TTSProvider using a configurable TTS streaming endpoint
 * (e.g., ElevenLabs via internal API route)
 *
 * Uses Web Audio API to decode PCM audio (browsers can't play raw PCM with Audio element)
 */

interface FetchTTSConfig {
    /** TTS stream URL (default: /api/voice/tts/stream) */
    ttsStreamUrl: string;
}
/**
 * Configure Fetch TTS adapter globally
 * Call this before creating adapters to set your backend URLs
 */
declare function configureFetchTTS(config: Partial<FetchTTSConfig>): void;
/**
 * Get current Fetch TTS config
 */
declare function getFetchTTSConfig(): FetchTTSConfig;
interface FetchTTSAdapterOptions {
    /** TTS stream URL (optional override) */
    ttsStreamUrl?: string;
}
declare class FetchTTSAdapter implements TTSProvider {
    private audioContext;
    private activeSource;
    private isCurrentlyPlaying;
    private ttsStreamUrl;
    constructor(options?: FetchTTSAdapterOptions);
    /**
     * Get or create AudioContext with correct sample rate
     */
    private getAudioContext;
    /**
     * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
     */
    private pcm16ToFloat32;
    synthesize(text: string, locale: Locale): Promise<void>;
    stop(): void;
    isPlaying(): boolean;
}
/**
 * Factory function to create a FetchTTSAdapter instance
 */
declare function createFetchTTSAdapter(options?: FetchTTSAdapterOptions): TTSProvider;

/**
 * HTTP TTS Source Adapter
 *
 * Fetches TTS audio from an HTTP streaming endpoint.
 * Uses HttpClientPort for all network I/O.
 */

/**
 * Configuration for HttpTTSSource
 */
interface HttpTTSSourceConfig {
    /** TTS stream endpoint URL (full URL or baseUrl) */
    ttsStreamUrl?: string;
    /** Base URL (used if ttsStreamUrl is not set) */
    baseUrl?: string;
    /** Default voice ID */
    defaultVoice?: string;
    /** Default TTS model */
    defaultModel?: string;
}
/**
 * HTTP-based TTS Source
 *
 * Streams PCM audio from a TTS API endpoint.
 * Audio format: 24kHz, 16-bit signed little-endian, mono
 */
declare class HttpTTSSource implements TTSSourcePort {
    private httpClient;
    private config;
    private prefetchCounter;
    private activePrefetches;
    constructor(httpClient: HttpClientPort, config?: HttpTTSSourceConfig);
    fetchAudio(text: string, locale: Locale, options?: TTSFetchOptions): Promise<TTSAudioResult>;
    prefetch(text: string, locale: Locale, options?: TTSFetchOptions): Promise<PrefetchedAudio>;
    cancelPrefetch(handle: PrefetchedAudio): void;
    private getTTSUrl;
    private streamFromReadable;
    private fetchInBackground;
    private getPrefetchResult;
}
/**
 * Create an HttpTTSSource instance
 */
declare function createHttpTTSSource(httpClient: HttpClientPort, config?: HttpTTSSourceConfig): HttpTTSSource;

/**
 * Silero VAD Adapter - ML-based voice activity detection
 *
 * Uses @ricky0123/vad-web which wraps Silero VAD ONNX model.
 * Runs in main thread with ~30ms latency per frame (96ms frame size).
 *
 * API Reference (@ricky0123/vad-web):
 * - positiveSpeechThreshold: Probability threshold for speech detection (0-1)
 * - negativeSpeechThreshold: Threshold to end speech (recommended: positive - 0.15)
 * - redemptionMs: Grace period before triggering onSpeechEnd
 * - minSpeechMs: Minimum duration to count as valid speech
 * - onFrameProcessed: Receives { isSpeech: number } probability each frame
 */

/**
 * Silero VAD configuration
 */
interface SileroVADConfig extends VADConfig {
    /** Base path for assets (ONNX model, worklet) - default: "/" */
    baseAssetPath?: string;
    /** ONNX WASM base path - default: CDN */
    onnxWASMBasePath?: string;
    /** VAD model version - default: "v5" */
    modelVersion?: "v5" | "legacy";
}
declare class SileroVADAdapter implements VADProvider {
    private vad;
    private config;
    private speechProbability;
    private isActive;
    private stream;
    constructor(config?: SileroVADConfig);
    init(): Promise<void>;
    start(stream: MediaStream, callbacks: VADCallbacks): void;
    stop(): void;
    isRunning(): boolean;
    getSpeechProbability(): number;
}
/**
 * Factory function to create Silero VAD adapter
 */
declare function createSileroVAD(config?: SileroVADConfig): VADProvider;

/**
 * Heuristic Turn Detector
 * Fallback adapter using regex patterns and timing heuristics
 *
 * Always available, no ML dependencies, ~1ms latency
 */

declare function isBackchannel(transcript: string, confidence: number, locale: Locale): boolean;
declare function isLikelyIncomplete(transcript: string, locale: Locale): boolean;
declare function isSemanticComplete(transcript: string, locale: Locale): boolean;
declare function hasTerminalPunctuation(transcript: string): boolean;
interface HeuristicTurnDetectorOptions extends TurnDetectorConfig {
    /** Minimum silence duration for completion (ms) */
    minSilenceMs?: number;
    /** Minimum transcript stable time for completion (ms) */
    minStableMs?: number;
}
/**
 * Heuristic Turn Detector
 * Always available fallback using regex patterns
 */
declare class HeuristicTurnDetector implements TurnDetectorProvider {
    readonly name = "heuristic";
    private config;
    private options;
    private history;
    constructor(options?: HeuristicTurnDetectorOptions);
    init(): Promise<void>;
    /**
     * Predict turn state using multi-signal heuristics
     */
    predict(context: TurnContext): Promise<TurnPrediction>;
    addTurn(turn: ConversationTurn): void;
    reset(): void;
    destroy(): void;
    getHistory(): ConversationTurn[];
}
/**
 * Factory function
 */
declare function createHeuristicTurnDetector(options?: HeuristicTurnDetectorOptions): TurnDetectorProvider;

/**
 * ONNX Turn Detector
 *
 * Local ML turn detection using ONNX runtime in the browser.
 * Uses the LiveKit turn-detector model (SmolLM2-135M based) for:
 * - End-of-turn prediction
 * - Semantic understanding of utterance completion
 *
 * Features:
 * - ~25-50ms inference latency (vs ~100-200ms cloud)
 * - IndexedDB caching (~100ms load after first download)
 * - Automatic fallback to heuristic on failure
 * - Works offline after initial model download
 *
 * @see https://github.com/livekit/agents for reference implementation
 */

interface OnnxTurnDetectorOptions extends TurnDetectorConfig {
    /** URL to the ONNX model file */
    modelUrl?: string;
    /** URL to the tokenizer.json file */
    tokenizerUrl?: string;
    /** Model version for cache invalidation */
    modelVersion?: string;
    /** Enable model caching in IndexedDB */
    enableCache?: boolean;
    /** ONNX execution provider */
    executionProvider?: "wasm" | "cpu";
    /** Probability threshold for EOT prediction */
    eotThreshold?: number;
    /** Maximum input sequence length */
    maxSeqLength?: number;
}
/**
 * ONNX Turn Detector
 *
 * Runs the turn-detector model locally in the browser using ONNX runtime.
 * Automatically falls back to heuristic detection on init or predict failure.
 */
declare class OnnxTurnDetector implements TurnDetectorProvider {
    readonly name = "onnx";
    private config;
    private onnxConfig;
    private session;
    private tokenizer;
    private modelCache;
    private heuristicFallback;
    private conversationHistory;
    private initialized;
    private initPromise;
    private initFailed;
    constructor(options?: OnnxTurnDetectorOptions);
    /**
     * Initialize the ONNX session and tokenizer
     * Downloads and caches model on first load
     */
    init(): Promise<void>;
    private doInit;
    /**
     * Predict if the current utterance is complete
     */
    predict(context: TurnContext): Promise<TurnPrediction>;
    /**
     * Add a completed turn to conversation history
     */
    addTurn(turn: ConversationTurn): void;
    /**
     * Reset state
     */
    reset(): void;
    /**
     * Cleanup resources
     */
    destroy(): void;
    /**
     * Extract logits from ONNX output
     * Handles different model output formats
     */
    private extractLogits;
    /**
     * Apply softmax to logits
     */
    private softmax;
    /**
     * Check if using fallback
     */
    get isUsingFallback(): boolean;
    /**
     * Get conversation history
     */
    getHistory(): ConversationTurn[];
}
/**
 * Factory function
 */
declare function createOnnxTurnDetector(options?: OnnxTurnDetectorOptions): TurnDetectorProvider;

/**
 * Cloud Turn Detector
 *
 * Remote ML model via KOND API for turn prediction.
 * Falls back to heuristic detection if API call fails.
 *
 * All authentication goes through VoiceKit API key (vk_xxx).
 */

interface CloudTurnDetectorOptions extends TurnDetectorConfig {
    /** VoiceKit API key (vk_xxx) - either apiKey or token required */
    apiKey?: string;
    /** JWT token for authentication (alternative to apiKey, for demo/SSR) */
    token?: string;
    /** API base URL @default "https://kond.studio/api/voice/v1" */
    baseUrl?: string;
    /** Callback when quota exceeded (402 response) */
    onQuotaExceeded?: (upgradeUrl: string) => void;
    /** Request timeout (ms) @default 2000 */
    timeoutMs?: number;
    /** Max retries on failure @default 1 */
    maxRetries?: number;
}
/**
 * Cloud Turn Detector
 *
 * Calls KOND turn detector API for ML-powered turn prediction.
 * Falls back to heuristic if API unavailable.
 */
declare class CloudTurnDetector implements TurnDetectorProvider {
    readonly name = "cloud";
    private config;
    private options;
    private history;
    private fallbackDetector;
    private baseUrl;
    constructor(options: CloudTurnDetectorOptions);
    init(): Promise<void>;
    /**
     * Predict turn state by calling KOND API
     */
    predict(context: TurnContext): Promise<TurnPrediction>;
    /**
     * Get the auth token (apiKey or JWT token)
     */
    private getAuthToken;
    /**
     * Call the KOND turn detector API
     */
    private callApi;
    /**
     * Use fallback heuristic detector
     */
    private useFallback;
    addTurn(turn: ConversationTurn): void;
    reset(): void;
    destroy(): void;
}
/**
 * Factory function
 */
declare function createCloudTurnDetector(options: CloudTurnDetectorOptions): TurnDetectorProvider;

/**
 * Mock Turn Detector
 * For testing purposes
 */

interface MockTurnDetectorOptions extends TurnDetectorConfig {
    /** Always return this prediction */
    alwaysReturn?: TurnPrediction;
    /** Return incomplete for first N predictions */
    incompleteUntil?: number;
    /** Simulate delay (ms) */
    delay?: number;
}
/**
 * Mock Turn Detector for testing
 */
declare class MockTurnDetector implements TurnDetectorProvider {
    readonly name = "mock";
    private config;
    private options;
    private history;
    private predictCount;
    constructor(options?: MockTurnDetectorOptions);
    init(): Promise<void>;
    predict(context: TurnContext): Promise<TurnPrediction>;
    addTurn(turn: ConversationTurn): void;
    reset(): void;
    destroy(): void;
    getHistory(): ConversationTurn[];
    getPredictCount(): number;
}
/**
 * Factory function
 */
declare function createMockTurnDetector(options?: MockTurnDetectorOptions): TurnDetectorProvider;

export { AuthError, CancelledError, CloudTurnDetector, type CloudTurnDetectorOptions, ConfigurationError, type ConversationState, type ConversationTurn, DEFAULTS, DEFAULT_CONFIG, DEFAULT_TURN_DETECTOR_CONFIG, DEFAULT_VAD_CONFIG, type DeepgramConfig, DeepgramStreamingAdapter, ENDPOINTS, ENVIRONMENTS, type EOUContext, type EOUReason, type EOUResult, type EnvironmentConfig, FetchHttpClient, type FetchHttpClientConfig, FetchTTSAdapter, type FetchTTSAdapterOptions, type FetchTTSConfig, HeuristicTurnDetector, type HeuristicTurnDetectorOptions, type HttpClientPort, type HttpRequest, type HttpResponse, HttpTTSSource, type HttpTTSSourceConfig, type LinguisticSignals, type Locale, MockTurnDetector, type MockTurnDetectorOptions, NetworkError, OnnxTurnDetector, type OnnxTurnDetectorOptions, type PreloadedAudio, RateLimitError, type SentenceAccumulator, SileroVADAdapter, type SileroVADConfig, type StreamingCallbacks, type StreamingSTTPort, type TTSAudioResult, TTSError, type TTSFetchOptions, TTSPlayer, type TTSPlayerCallbacks, type TTSPlayerConfig, type PrefetchedAudio as TTSPrefetchedAudio, type TTSProvider, type TTSSourcePort, type TTSStreamingConfig, TimeoutError, type TokenResponse, type TraceEvent, TranscriptionError, type TranscriptionResult, type TriggerState, type TtsContext, type TtsModel, type TtsModelSelection, type TurnContext, TurnDetectionError, type TurnDetectorConfig, type TurnDetectorProvider, type TurnManager, type TurnManagerConfig, type TurnPrediction, type VADCallbacks, type VADConfig, VADError, type VADProvider, VOICE_PRESETS, VoiceKit, type VoiceKitConfig, type VoiceKitDeps, VoiceKitError, type VoiceKitErrorCode, type VoiceKitError$1 as VoiceKitErrorInfo, alignPCMChunk, analyzeLinguisticSignals, analyzeTrigger, buildEndpointUrl, cancelPrefetch, extractSentences as chunkSentences, configureDeepgram, configureFetchTTS, configureTTSStreaming, createAudioBuffer, createCloudTurnDetector, createDeepgramAdapter, createDeepgramAdapterWithAuth, createFetchHttpClient, createFetchTTSAdapter, createHeuristicTurnDetector, createHttpTTSSource, createMockTurnDetector, createOnnxTurnDetector, createSentenceAccumulator, createSileroVAD, createTTSPlayer, createTTSQueue, createTurnManager, createVoiceKit, detectEndOfUtterance, ensureAudioContextResumed, explainEOUResult, extractSentences, getDeepgramConfig, getDeviceCapabilitySummary, getEnvironmentConfig, getFetchTTSConfig, getIOSVersion, getTTSStreamingConfig, hasTerminalPunctuation, hasVisualBlocks, isBackchannel, isDeviceCapableForLocalML, isIOS, isLikelyComplete, isLikelyIncomplete, isPreloadedReady, isRetryableError, isSafari, isSemanticComplete, isShortAcknowledgment, isStreamingTTSPlaying, isBackchannel$1 as isTriggerBackchannel, isLikelyIncomplete$1 as isTriggerIncomplete, isUtteranceComplete, isVADSupported, isVoiceConversationSupported, isVoiceKitError, pcm16ToFloat32, playPreloadedAudio, prefetchAudio, resolveVoiceId, sanitizeForTTS, selectTtsModel, selectTtsModelWithReason, shouldTriggerEarly, sleep, speakTextStreaming, speakTextStreamingWithCallback, stopStreamingTTS, testAudioContextBeep, wrapError };
