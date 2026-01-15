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
     * Free tier: 100 min/month
     */
    apiKey: string;
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
    /**
     * API base URL override
     * Only needed for staging/development environments
     * @default "https://kond.studio/api/voice/v1"
     * @internal
     */
    baseUrl?: string;
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
 * VoiceKit - Main class for voice conversations
 *
 * Provides a simple high-level API for integrating voice capabilities.
 *
 * @example
 * ```typescript
 * import { VoiceKit } from "@kond/voicekit";
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
 * VoiceKit instance
 */
declare class VoiceKit {
    private config;
    private state;
    private locale;
    private stt;
    private vad;
    private turnDetector;
    private turnManager;
    private mediaStream;
    private isInitialized;
    private ttsQueue;
    private sentenceAccumulator;
    private currentTranscript;
    private isProcessing;
    constructor(config: VoiceKitConfig);
    /**
     * Initialize adapters and request microphone permission
     */
    init(): Promise<void>;
    /**
     * Create the appropriate turn detector based on type
     */
    private createTurnDetector;
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
 */
declare function createVoiceKit(config: VoiceKitConfig): VoiceKit;

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
    /** TTS stream endpoint URL (default: /api/voice/tts/stream) */
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
 */
declare function speakTextStreaming(text: string, locale?: Locale, onStart?: () => void, onEnd?: () => void, onError?: (error: Error) => void, ttsModel?: TtsModel, voice?: string): Promise<void>;
/**
 * Speak text with callback (wrapper for voice conversation)
 */
declare function speakTextStreamingWithCallback(text: string, locale: Locale | undefined, onEnd: () => void, onError?: (error: Error) => void, ttsModel?: TtsModel, voice?: string): void;
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
 */
declare function prefetchAudio(text: string, locale?: Locale, ttsModel?: TtsModel, voice?: string): Promise<PreloadedAudio>;
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
 * ONNX Turn Detector (STUB)
 * Local ML model via ONNX.js for powerful devices
 *
 * This is a stub implementation. The full implementation requires:
 * - ONNX.js or onnxruntime-web package
 * - SmolLM2-135M model converted to ONNX format
 * - Model hosted on CDN or bundled
 *
 * Architecture:
 * 1. Load model from CDN/cache (~100MB first load, cached in IndexedDB)
 * 2. Process transcript with conversation context
 * 3. Return turn prediction with ~10ms latency
 *
 * @see https://github.com/livekit/agents for reference implementation
 */

interface OnnxTurnDetectorOptions extends TurnDetectorConfig {
    /** Model URL (default: CDN-hosted SmolLM2) */
    modelUrl?: string;
    /** Enable model caching in IndexedDB */
    enableCache?: boolean;
    /** WASM execution provider (cpu, wasm, webgl) */
    executionProvider?: "cpu" | "wasm" | "webgl";
}
/**
 * ONNX Turn Detector
 *
 * STUB IMPLEMENTATION - Full implementation pending:
 * 1. Install onnxruntime-web: pnpm add onnxruntime-web
 * 2. Host SmolLM2-135M ONNX model
 * 3. Implement inference pipeline
 */
declare class OnnxTurnDetector implements TurnDetectorProvider {
    readonly name = "onnx";
    private config;
    private options;
    private history;
    private initialized;
    constructor(options?: OnnxTurnDetectorOptions);
    init(): Promise<void>;
    /**
     * STUB: Returns heuristic-based prediction
     * Full implementation would run ONNX inference
     */
    predict(context: TurnContext): Promise<TurnPrediction>;
    addTurn(turn: ConversationTurn): void;
    reset(): void;
    destroy(): void;
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
    /** VoiceKit API key (vk_xxx) - required */
    apiKey: string;
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

export { CloudTurnDetector, type CloudTurnDetectorOptions, type ConversationState, type ConversationTurn, DEFAULT_CONFIG, DEFAULT_TURN_DETECTOR_CONFIG, DEFAULT_VAD_CONFIG, type DeepgramConfig, DeepgramStreamingAdapter, type EOUContext, type EOUReason, type EOUResult, FetchTTSAdapter, type FetchTTSAdapterOptions, type FetchTTSConfig, HeuristicTurnDetector, type HeuristicTurnDetectorOptions, type LinguisticSignals, type Locale, MockTurnDetector, type MockTurnDetectorOptions, OnnxTurnDetector, type OnnxTurnDetectorOptions, type PreloadedAudio, SileroVADAdapter, type SileroVADConfig, type StreamingCallbacks, type StreamingSTTPort, type TTSProvider, type TTSStreamingConfig, type TraceEvent, type TranscriptionResult, type TriggerState, type TtsContext, type TtsModel, type TtsModelSelection, type TurnContext, type TurnDetectorConfig, type TurnDetectorProvider, type TurnManager, type TurnManagerConfig, type TurnPrediction, type VADCallbacks, type VADConfig, type VADProvider, VoiceKit, type VoiceKitConfig, type VoiceKitError, analyzeLinguisticSignals, analyzeTrigger, cancelPrefetch, extractSentences as chunkSentences, configureDeepgram, configureFetchTTS, configureTTSStreaming, createCloudTurnDetector, createDeepgramAdapter, createDeepgramAdapterWithAuth, createFetchTTSAdapter, createHeuristicTurnDetector, createMockTurnDetector, createOnnxTurnDetector, createSentenceAccumulator, createSileroVAD, createTTSQueue, createTurnManager, createVoiceKit, detectEndOfUtterance, ensureAudioContextResumed, explainEOUResult, extractSentences, getDeepgramConfig, getDeviceCapabilitySummary, getFetchTTSConfig, getIOSVersion, getTTSStreamingConfig, hasTerminalPunctuation, hasVisualBlocks, isBackchannel, isDeviceCapableForLocalML, isIOS, isLikelyComplete, isLikelyIncomplete, isPreloadedReady, isSafari, isSemanticComplete, isShortAcknowledgment, isStreamingTTSPlaying, isBackchannel$1 as isTriggerBackchannel, isLikelyIncomplete$1 as isTriggerIncomplete, isUtteranceComplete, isVADSupported, isVoiceConversationSupported, playPreloadedAudio, prefetchAudio, sanitizeForTTS, selectTtsModel, selectTtsModelWithReason, shouldTriggerEarly, sleep, speakTextStreaming, speakTextStreamingWithCallback, stopStreamingTTS, testAudioContextBeep };
