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

import type {
  VoiceKitConfig,
  ConversationState,
  Locale,
  VoiceKitError,
  TurnDetectorType,
} from "./types/config";
import { DEFAULT_CONFIG } from "./types/config";
import type { StreamingSTTPort } from "./ports/stt";
import type { VADProvider } from "./ports/vad";
import type { TurnDetectorProvider } from "./ports/turn-detector";
import type { HttpClientPort } from "./ports/http-client";
import type { TTSSourcePort } from "./ports/tts-source";
import type {
  RecordingProvider,
  RecordingResult,
  RecordingState,
} from "./ports/recording";
import { DEFAULT_RECORDING_CONFIG } from "./ports/recording";

// Adapters
import { createDeepgramAdapter, createDeepgramAdapterWithAuth } from "./adapters/stt";
import { createSileroVAD } from "./adapters/vad";
import {
  createHeuristicTurnDetector,
  createCloudTurnDetector,
  createOnnxTurnDetector,
} from "./adapters/turn-detector";
import { FetchHttpClient } from "./adapters/http";
import { HttpTTSSource } from "./adapters/tts";
import { detectDeviceCapabilities } from "./adapters/utils/device-capability";
import { MediaRecorderAdapter } from "./adapters/recording";
import { RecordingError } from "./errors";

// Core
import { createTurnManager, type TurnManager } from "./core/turn-manager";
import { createTTSQueue } from "./core/tts-queue";
import { createSentenceAccumulator } from "./core/sentence-chunker";
import { configureTTSStreaming, stopStreamingTTS } from "./core/tts-streaming";
import { TTSPlayer } from "./core/tts-player";
import { selectTtsModel } from "./core/tts-model-router";
import { loadAudioWorklet } from "./core/worklet-loader";
import { DEFAULTS, buildEndpointUrl, validateSecureUrl } from "./config";

// ============================================
// DEPENDENCY INJECTION TYPES
// ============================================

/**
 * Optional dependencies that can be injected into VoiceKit.
 * All have sensible defaults but can be overridden for testing or customization.
 */
export interface VoiceKitDeps {
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
  /** Recording adapter (audio/transcript capture) */
  recordingProvider?: RecordingProvider;
}

/**
 * VoiceKit instance
 */
export class VoiceKit {
  private config: VoiceKitConfig;
  private deps: VoiceKitDeps;
  private state: ConversationState = "idle";
  private locale: Locale;

  // Injected adapters (from deps or created internally)
  private httpClient: HttpClientPort;
  private ttsSource: TTSSourcePort | null = null;
  private stt: StreamingSTTPort | null = null;
  private vad: VADProvider | null = null;
  private turnDetector: TurnDetectorProvider | null = null;
  private recorder: RecordingProvider | null = null;

  // Core
  private turnManager: TurnManager | null = null;
  private ttsPlayer: TTSPlayer | null = null;
  private mediaStream: MediaStream | null = null;
  private isInitialized = false;

  // Audio capture for routing to STT
  private audioContext: AudioContext | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;

  // TTS queue for speaking
  private ttsQueue: ReturnType<typeof createTTSQueue> | null = null;
  private sentenceAccumulator: ReturnType<typeof createSentenceAccumulator> | null = null;

  // Current transcript state
  private currentTranscript = "";
  private isProcessing = false;

  /**
   * Create a VoiceKit instance
   *
   * @param config - Configuration options
   * @param deps - Optional dependency injection for testing/customization
   */
  constructor(config: VoiceKitConfig, deps?: VoiceKitDeps) {
    // Validate authentication: either apiKey OR (token + tokenWsUrl) required
    const hasApiKey = !!config.apiKey;
    const hasToken = !!config.token && !!config.tokenWsUrl;

    if (!hasApiKey && !hasToken) {
      throw new Error(
        "VoiceKit requires either 'apiKey' or both 'token' and 'tokenWsUrl' for authentication"
      );
    }

    // Security: Validate HTTPS in production
    if (config.baseUrl) {
      validateSecureUrl(config.baseUrl, config.debug);
    }

    this.config = {
      ...config,
      locale: config.locale || DEFAULT_CONFIG.locale,
      turnDetection: { ...DEFAULT_CONFIG.turnDetection, ...config.turnDetection },
      tts: { ...DEFAULT_CONFIG.tts, ...config.tts },
      timing: { ...DEFAULT_CONFIG.timing, ...config.timing },
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };
    this.locale = this.config.locale || "fr";
    this.deps = deps ?? {};

    // Initialize HTTP client (injectable or default)
    this.httpClient = this.deps.httpClient ?? new FetchHttpClient({
      baseUrl: this.config.baseUrl || DEFAULTS.baseUrl,
    });

    // Initialize TTS source if provided, otherwise create lazily
    if (this.deps.ttsSource) {
      this.ttsSource = this.deps.ttsSource;
    }

    // Configure legacy TTS streaming for backward compatibility
    // TODO: Remove this once all code migrates to TTSPlayer
    const ttsStreamUrl = buildEndpointUrl(
      this.config.baseUrl || DEFAULTS.baseUrl,
      "ttsStream"
    );
    configureTTSStreaming({ ttsStreamUrl });
  }

  /**
   * Initialize adapters and request microphone permission
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.setState("connecting");

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Setup AudioContext for audio capture
      // The worklet will be created in start() so it can be recreated after stop()
      this.audioContext = new AudioContext();

      // Load worklet with intelligent fallback strategy:
      // 1. Custom URL if provided (config.workletUrl)
      // 2. Blob URL from embedded source (zero-config)
      // 3. CDN fallback if Blob fails (CSP restrictions)
      await loadAudioWorklet(this.audioContext, {
        workletUrl: this.config.workletUrl,
        debug: this.config.debug,
      });

      if (this.config.debug) {
        console.log("[VoiceKit] AudioContext and worklet initialized");
      }

      // Initialize STT adapter (cloud only via KOND)
      if (this.config.token && this.config.tokenWsUrl) {
        // Direct token mode: use pre-fetched token (for demo/server-side token exchange)
        const token = this.config.token;
        const wsUrl = this.config.tokenWsUrl;
        this.stt = createDeepgramAdapterWithAuth(
          async () => ({ token, wsUrl }),
          { baseUrl: this.config.baseUrl }
        );
      } else {
        // API key mode: SDK handles token exchange
        this.stt = createDeepgramAdapter({
          apiKey: this.config.apiKey!,
          baseUrl: this.config.baseUrl,
        });
      }

      // Initialize VAD adapter
      this.vad = createSileroVAD({
        threshold: 0.5,
        minSpeechDuration: 250,
        silenceDuration: 700,
      });
      await this.vad.init?.();

      // Initialize Turn Detector based on config
      const detectorType: TurnDetectorType = this.config.turnDetection?.type || "auto";
      this.turnDetector = await this.createTurnDetector(detectorType);
      await this.turnDetector.init();

      // Initialize Turn Manager with required callbacks
      // Note: Turn manager only supports fr/en for semantic patterns.
      // "multi" mode uses "fr" patterns by default.
      this.turnManager = createTurnManager({
        locale: this.locale === "multi" ? "fr" : this.locale,
        debug: this.config.debug,
        turnDetector: this.turnDetector ?? undefined,
        onTurnComplete: (transcript, confidence) => {
          this.handleTurnComplete(transcript, confidence);
        },
        onBargeIn: () => {
          this.interrupt();
        },
        onSpeechActivity: (speaking) => {
          this.config.onSpeechActivity?.(speaking);
        },
      });

      this.isInitialized = true;
      this.setState("idle");

      if (this.config.debug) {
        console.log("[VoiceKit] Initialized successfully");
      }
    } catch (error) {
      this.setState("idle");
      this.handleError("init_failed", error);
      throw error;
    }
  }

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
  private async createTurnDetector(type: TurnDetectorType): Promise<TurnDetectorProvider> {
    const baseConfig = {
      debug: this.config.debug,
      confidenceThreshold: this.config.turnDetection?.confidenceThreshold || 0.7,
      detectBackchannels: this.config.turnDetection?.detectBackchannels ?? true,
    };

    // Cloud detector options (cloud only via KOND)
    // Supports both apiKey and token authentication
    const cloudOptions = {
      ...baseConfig,
      apiKey: this.config.apiKey,
      token: this.config.token, // For demo/SSR mode
      baseUrl: this.config.baseUrl, // Pass through for dev/staging
      onQuotaExceeded: this.config.onQuotaExceeded,
    };

    // Check if we have valid auth for cloud detector
    const hasCloudAuth = !!(this.config.apiKey || this.config.token);

    switch (type) {
      case "local":
      case "onnx":
        // Force local ONNX inference
        if (this.config.debug) {
          console.log("[VoiceKit] Using local ONNX turn detector");
        }
        return createOnnxTurnDetector(baseConfig);

      case "cloud":
        // Force cloud API
        if (this.config.debug) {
          console.log("[VoiceKit] Using cloud turn detector");
        }
        return createCloudTurnDetector(cloudOptions);

      case "heuristic":
        // Force heuristic fallback
        if (this.config.debug) {
          console.log("[VoiceKit] Using heuristic turn detector");
        }
        return createHeuristicTurnDetector(baseConfig);

      case "auto":
      default:
        // Auto: device capability detection
        return this.createAutoTurnDetector(baseConfig, cloudOptions, hasCloudAuth);
    }
  }

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
  private createAutoTurnDetector(
    baseConfig: { debug?: boolean; confidenceThreshold: number; detectBackchannels: boolean },
    cloudOptions: Parameters<typeof createCloudTurnDetector>[0],
    hasCloudAuth: boolean
  ): TurnDetectorProvider {
    // Detect device capabilities
    const capabilities = detectDeviceCapabilities();

    if (this.config.debug) {
      console.log("[VoiceKit] Device capabilities:", {
        canRunLocalOnnx: capabilities.canRunLocalOnnx,
        isMobile: capabilities.isMobile,
        deviceMemoryGB: capabilities.deviceMemoryGB,
        hasWebAssembly: capabilities.hasWebAssembly,
        hasIndexedDB: capabilities.hasIndexedDB,
      });
    }

    // Strategy: Prefer local ONNX on capable devices
    if (capabilities.canRunLocalOnnx) {
      if (this.config.debug) {
        console.log("[VoiceKit] Auto: Using local ONNX turn detector (capable device)");
      }
      return createOnnxTurnDetector(baseConfig);
    }

    // Fall back to cloud if we have auth
    if (hasCloudAuth) {
      const reason = capabilities.isMobile ? "mobile device" : "low memory/no WASM support";
      if (this.config.debug) {
        console.log(`[VoiceKit] Auto: Using cloud turn detector (${reason})`);
      }
      return createCloudTurnDetector(cloudOptions);
    }

    // No auth and can't run local → heuristic
    if (this.config.debug) {
      console.log("[VoiceKit] Auto: Using heuristic turn detector (no auth, can't run local)");
    }
    return createHeuristicTurnDetector(baseConfig);
  }

  /**
   * Start listening for voice input
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (this.state !== "idle") {
      if (this.config.debug) {
        console.log(`[VoiceKit] Cannot start from state: ${this.state}`);
      }
      return;
    }

    try {
      this.setState("connecting");

      // Create audio worklet for capturing and routing audio to STT
      // This must be done in start() so it can be recreated after stop()
      if (this.audioContext && this.mediaStream) {
        this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.audioWorklet = new AudioWorkletNode(
          this.audioContext,
          "audio-capture-processor",
          {
            processorOptions: {
              inputSampleRate: this.audioContext.sampleRate,
              outputSampleRate: 16000, // Deepgram expects 16kHz
            },
          }
        );

        // Connect source to worklet (don't connect to destination to avoid feedback)
        this.audioSource.connect(this.audioWorklet);

        // Setup audio routing from worklet to STT
        // This is the critical part that sends microphone audio to Deepgram
        this.audioWorklet.port.onmessage = (e) => {
          if (e.data.type !== "audio") return;

          // Route audio to STT when in listening or processing state
          const sendingStates: ConversationState[] = ["listening", "processing"];
          if (sendingStates.includes(this.state) && this.stt) {
            // sendAudio accepts Float32Array or ArrayBuffer
            this.stt.sendAudio(e.data.data);
          }

          // Feed speech probability to turn manager for better turn detection
          if (this.turnManager && typeof e.data.speechProbability === "number") {
            this.turnManager.handleVADProbability(e.data.speechProbability);
          }
        };

        if (this.config.debug) {
          console.log("[VoiceKit] Audio worklet connected");
        }
      }

      // Start STT streaming
      await this.stt!.startStreaming(
        {
          onInterim: (result) => this.handleInterimTranscript(result.text, result.confidence),
          onFinal: (result) => this.handleFinalTranscript(result.text, result.confidence),
          onUtteranceEnd: () => this.handleUtteranceEnd(),
          onError: (error) => this.handleError("stt_error", error),
          onReady: () => {
            if (this.config.debug) {
              console.log("[VoiceKit] STT ready");
            }
          },
        },
        this.locale
      );

      // Start VAD
      this.vad!.start(this.mediaStream!, {
        onSpeechStart: () => this.handleSpeechStart(),
        onSpeechEnd: () => this.handleSpeechEnd(),
        onSpeechProbability: (prob) => this.updateVADProbability(prob),
        onError: (error) => this.handleError("vad_error", error),
      });

      this.setState("listening");
    } catch (error) {
      this.setState("idle");
      this.handleError("start_failed", error);
      throw error;
    }
  }

  /**
   * Stop listening
   */
  stop(): void {
    this.vad?.stop();
    this.stt?.close();
    this.turnManager?.reset();
    this.ttsQueue?.cancel();
    stopStreamingTTS();

    // Cleanup audio worklet (but keep AudioContext for restart)
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: "stop" });
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    this.currentTranscript = "";
    this.isProcessing = false;
    this.setState("idle");

    if (this.config.debug) {
      console.log("[VoiceKit] Stopped");
    }
  }

  /**
   * Speak text using TTS
   * Handles sentence chunking and progressive playback
   */
  speak(text: string): void {
    if (!text || text.trim().length === 0) return;

    // Capture assistant text for recording
    if (this.recorder?.isRecording()) {
      this.recorder.addTranscriptEntry({
        role: "assistant",
        text,
        isFinal: true,
      });
    }

    // Create TTS queue if not exists
    if (!this.ttsQueue) {
      // Build explicit TTS stream URL to avoid relative path issues in external apps
      const ttsStreamUrl = buildEndpointUrl(
        this.config.baseUrl || DEFAULTS.baseUrl,
        "ttsStream"
      );

      this.ttsQueue = createTTSQueue({
        locale: this.locale,
        ttsStreamUrl, // Pass explicit URL to avoid localhost resolution
        apiKey: this.config.apiKey, // Pass API key for authentication
        onStart: () => this.setState("speaking"),
        onEnd: () => {
          this.ttsQueue = null;
          this.sentenceAccumulator = null;
          this.setState("cooldown");
          // Resume listening after cooldown
          setTimeout(() => {
            if (this.state === "cooldown") {
              this.setState("listening");
            }
          }, this.config.timing?.cooldownMs || 150);
        },
        onError: (error) => this.handleError("tts_error", error),
        // Capture TTS audio for dual-voice recording
        onAudioChunk: (samples) => {
          if (this.recorder?.isRecording() && this.recorder.addAssistantAudio) {
            this.recorder.addAssistantAudio(samples);
          }
        },
        debug: this.config.debug,
      });
    }

    // Create sentence accumulator if not exists
    if (!this.sentenceAccumulator) {
      this.sentenceAccumulator = createSentenceAccumulator((sentence) => {
        const model = selectTtsModel(sentence);
        this.ttsQueue?.push(sentence, model);
      });
    }

    // Feed text to accumulator
    this.sentenceAccumulator.append(text);
  }

  /**
   * Finish speaking - flush any remaining text
   */
  finishSpeaking(): void {
    this.sentenceAccumulator?.flush();
    this.ttsQueue?.finish();
  }

  /**
   * Interrupt current TTS playback (barge-in)
   */
  interrupt(): void {
    this.ttsQueue?.cancel();
    this.ttsQueue = null;
    this.sentenceAccumulator = null;
    stopStreamingTTS();

    this.config.onBargeIn?.();

    if (this.state === "speaking") {
      this.setState("listening");
    }
  }

  // =========================================================================
  // Internal handlers
  // =========================================================================

  private handleInterimTranscript(text: string, confidence: number): void {
    this.currentTranscript = text;

    // Update turn manager (interim = isFinal: false, speechFinal: false)
    this.turnManager?.handleTranscript(text, false, false, confidence);
  }

  private handleFinalTranscript(text: string, confidence: number): void {
    this.currentTranscript = text;

    // Capture transcript for recording
    if (this.recorder?.isRecording()) {
      this.recorder.addTranscriptEntry({
        role: "user",
        text,
        confidence,
        isFinal: true,
      });
    }

    // Update turn manager with final (isFinal: true, speechFinal: false for now)
    this.turnManager?.handleTranscript(text, true, false, confidence);
  }

  private handleTurnComplete(transcript: string, confidence: number): void {
    if (this.isProcessing) return;
    this.currentTranscript = transcript;
    this.processTranscript();
  }

  private handleUtteranceEnd(): void {
    if (this.isProcessing || !this.currentTranscript.trim()) return;
    this.processTranscript();
  }

  private processTranscript(): void {
    if (!this.currentTranscript.trim()) return;

    this.isProcessing = true;
    this.setState("processing");

    // Call user callback
    const result = this.config.onTranscript(this.currentTranscript);

    // Handle async callback
    if (result instanceof Promise) {
      result
        .catch((error) => this.handleError("transcript_handler_error", error))
        .finally(() => {
          this.isProcessing = false;
          this.currentTranscript = "";
          this.turnManager?.reset();
        });
    } else {
      this.isProcessing = false;
      this.currentTranscript = "";
      this.turnManager?.reset();
    }
  }

  private handleSpeechStart(): void {
    this.config.onSpeechActivity?.(true);

    // If speaking, handle barge-in
    if (this.state === "speaking") {
      this.interrupt();
    }
  }

  private handleSpeechEnd(): void {
    this.config.onSpeechActivity?.(false);
  }

  private updateVADProbability(probability: number): void {
    this.turnManager?.handleVADProbability(probability);
  }

  // =========================================================================
  // State management
  // =========================================================================

  private setState(newState: ConversationState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    if (this.config.debug) {
      console.log(`[VoiceKit] State: ${oldState} → ${newState}`);
    }

    this.config.onStateChange?.(newState);
  }

  private handleError(code: string, error: unknown): void {
    const voiceError: VoiceKitError = {
      code,
      message: error instanceof Error ? error.message : String(error),
      details: error,
    };

    if (this.config.debug) {
      console.error(`[VoiceKit] Error (${code}):`, error);
    }

    this.config.onError?.(voiceError);
  }

  // =========================================================================
  // Public getters
  // =========================================================================

  /**
   * Get current conversation state
   */
  getState(): ConversationState {
    return this.state;
  }

  /**
   * Get current locale
   */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Check if voice is active (listening or processing)
   */
  isActive(): boolean {
    return this.state !== "idle";
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.state === "speaking";
  }

  // =========================================================================
  // Recording API
  // =========================================================================

  /**
   * Start recording the conversation (audio + transcripts)
   *
   * Recording can be started at any time after init(), regardless of conversation state.
   * The recording will capture user audio from the microphone and any transcripts.
   *
   * @example
   * ```typescript
   * await voice.start();
   * await voice.startRecording();
   *
   * // ... conversation happens ...
   *
   * const recording = await voice.stopRecording();
   * // recording.audioBlob → WebM audio file
   * // recording.transcript → Timed transcript
   * ```
   */
  async startRecording(): Promise<void> {
    if (!this.isInitialized || !this.mediaStream) {
      throw new RecordingError("VoiceKit must be initialized before recording. Call init() or start() first.");
    }

    if (this.recorder?.isRecording()) {
      if (this.config.debug) {
        console.log("[VoiceKit] Recording already in progress");
      }
      return;
    }

    // Create recorder if not injected via deps
    if (!this.recorder) {
      this.recorder = this.deps.recordingProvider ?? new MediaRecorderAdapter({
        debug: this.config.debug,
        captureTranscript: true,
      });
      await this.recorder.init();
    }

    // Start recording with callbacks
    this.recorder.start(this.mediaStream, {
      onStart: () => {
        if (this.config.debug) {
          console.log("[VoiceKit] Recording started");
        }
        this.config.onRecordingStart?.();
      },
      onStop: (result) => {
        if (this.config.debug) {
          console.log("[VoiceKit] Recording stopped", {
            durationMs: result.durationMs,
            sizeBytes: result.sizeBytes,
            transcriptEntries: result.transcript.entries.length,
          });
        }
        this.config.onRecordingStop?.(result);
      },
      onPause: () => {
        if (this.config.debug) {
          console.log("[VoiceKit] Recording paused");
        }
      },
      onResume: () => {
        if (this.config.debug) {
          console.log("[VoiceKit] Recording resumed");
        }
      },
      onError: (error) => {
        if (this.config.debug) {
          console.error("[VoiceKit] Recording error:", error);
        }
        this.config.onRecordingError?.(error);
      },
      onProgress: (durationMs, sizeBytes) => {
        if (this.config.debug) {
          console.log(`[VoiceKit] Recording progress: ${durationMs}ms, ${sizeBytes} bytes`);
        }
      },
    });
  }

  /**
   * Stop recording and get the result
   *
   * @returns The recording result with audio blob and transcript, or null if not recording
   */
  async stopRecording(): Promise<RecordingResult | null> {
    if (!this.recorder || !this.recorder.isRecording() && !this.recorder.isPaused()) {
      if (this.config.debug) {
        console.log("[VoiceKit] No recording in progress");
      }
      return null;
    }

    const result = await this.recorder.stop();
    return result;
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (!this.recorder?.isRecording()) {
      if (this.config.debug) {
        console.log("[VoiceKit] No recording in progress to pause");
      }
      return;
    }
    this.recorder.pause();
  }

  /**
   * Resume a paused recording
   */
  resumeRecording(): void {
    if (!this.recorder?.isPaused()) {
      if (this.config.debug) {
        console.log("[VoiceKit] No paused recording to resume");
      }
      return;
    }
    this.recorder.resume();
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recorder?.isRecording() ?? false;
  }

  /**
   * Get current recording state
   */
  getRecordingState(): RecordingState {
    return this.recorder?.getState() ?? "idle";
  }

  /**
   * Destroy instance and cleanup resources
   */
  destroy(): void {
    this.stop();

    // Release media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Close AudioContext (only on destroy, not stop)
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Cleanup adapters
    this.turnDetector?.destroy();
    this.turnManager?.destroy();
    this.recorder?.destroy();
    this.recorder = null;

    this.isInitialized = false;

    if (this.config.debug) {
      console.log("[VoiceKit] Destroyed");
    }
  }
}

/**
 * Create a VoiceKit instance
 *
 * @param config - Configuration options
 * @param deps - Optional dependency injection for testing/customization
 */
export function createVoiceKit(config: VoiceKitConfig, deps?: VoiceKitDeps): VoiceKit {
  return new VoiceKit(config, deps);
}
