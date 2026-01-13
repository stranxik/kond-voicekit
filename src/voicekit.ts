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

import type {
  VoiceKitConfig,
  ConversationState,
  Locale,
  VoiceKitError,
} from "./types/config";
import { DEFAULT_CONFIG } from "./types/config";
import type { StreamingSTTPort } from "./ports/stt";
import type { VADProvider } from "./ports/vad";
import type { TurnDetectorProvider } from "./ports/turn-detector";

// Adapters
import { configureDeepgram, createDeepgramAdapter, createDeepgramAdapterWithAuth } from "./adapters/stt";
import { configureFetchTTS } from "./adapters/tts";
import { createSileroVAD } from "./adapters/vad";
import {
  createHeuristicTurnDetector,
  createCloudTurnDetector,
  createOnnxTurnDetector,
  configureCloudTurnDetector,
} from "./adapters/turn-detector";

// Core
import { createTurnManager, type TurnManager } from "./core/turn-manager";
import { createTTSQueue } from "./core/tts-queue";
import { createSentenceAccumulator } from "./core/sentence-chunker";
import { configureTTSStreaming, stopStreamingTTS } from "./core/tts-streaming";
import { selectTtsModel } from "./core/tts-model-router";

/**
 * VoiceKit instance
 */
export class VoiceKit {
  private config: VoiceKitConfig;
  private state: ConversationState = "idle";
  private locale: Locale;

  // Adapters
  private stt: StreamingSTTPort | null = null;
  private vad: VADProvider | null = null;
  private turnDetector: TurnDetectorProvider | null = null;

  // Core
  private turnManager: TurnManager | null = null;
  private mediaStream: MediaStream | null = null;
  private isInitialized = false;

  // TTS queue for speaking
  private ttsQueue: ReturnType<typeof createTTSQueue> | null = null;
  private sentenceAccumulator: ReturnType<typeof createSentenceAccumulator> | null = null;

  // Current transcript state
  private currentTranscript = "";
  private isProcessing = false;

  constructor(config: VoiceKitConfig) {
    this.config = {
      ...config,
      locale: config.locale || DEFAULT_CONFIG.locale,
      turnDetection: { ...DEFAULT_CONFIG.turnDetection, ...config.turnDetection },
      tts: { ...DEFAULT_CONFIG.tts, ...config.tts },
      timing: { ...DEFAULT_CONFIG.timing, ...config.timing },
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };
    this.locale = this.config.locale || "fr";

    // Configure adapters with endpoints if provided
    this.configureEndpoints();
  }

  /**
   * Configure adapter URLs from config
   */
  private configureEndpoints(): void {
    const { endpoints, getAuthToken } = this.config;

    if (endpoints?.sttWebSocket) {
      configureDeepgram({ wsUrl: endpoints.sttWebSocket });
    }

    if (endpoints?.ttsStream) {
      configureTTSStreaming({ ttsStreamUrl: endpoints.ttsStream });
      configureFetchTTS({ ttsStreamUrl: endpoints.ttsStream });
    }

    if (endpoints?.turnDetector) {
      configureCloudTurnDetector({ apiUrl: endpoints.turnDetector });
    }

    if (endpoints?.voiceToken) {
      configureDeepgram({ tokenUrl: endpoints.voiceToken });
      configureCloudTurnDetector({ tokenUrl: endpoints.voiceToken });
    }
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

      // Initialize STT adapter
      if (this.config.getAuthToken) {
        this.stt = createDeepgramAdapterWithAuth(this.config.getAuthToken);
      } else {
        this.stt = createDeepgramAdapter();
      }

      // Initialize VAD adapter
      this.vad = createSileroVAD({
        threshold: 0.5,
        minSpeechDuration: 250,
        silenceDuration: 700,
      });
      await this.vad.init?.();

      // Initialize Turn Detector based on config
      const detectorType = this.config.turnDetection?.type || "auto";
      this.turnDetector = await this.createTurnDetector(detectorType);
      await this.turnDetector.init();

      // Initialize Turn Manager with required callbacks
      this.turnManager = createTurnManager({
        locale: this.locale,
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
   */
  private async createTurnDetector(type: string): Promise<TurnDetectorProvider> {
    const baseConfig = {
      debug: this.config.debug,
      confidenceThreshold: this.config.turnDetection?.confidenceThreshold || 0.7,
      detectBackchannels: this.config.turnDetection?.detectBackchannels ?? true,
    };

    switch (type) {
      case "cloud":
        return createCloudTurnDetector({
          ...baseConfig,
          getAuthToken: this.config.getAuthToken,
        });
      case "onnx":
        return createOnnxTurnDetector(baseConfig);
      case "heuristic":
        return createHeuristicTurnDetector(baseConfig);
      case "auto":
      default:
        // Auto: try cloud if auth available, otherwise heuristic
        if (this.config.getAuthToken || this.config.endpoints?.turnDetector) {
          return createCloudTurnDetector({
            ...baseConfig,
            getAuthToken: this.config.getAuthToken,
          });
        }
        return createHeuristicTurnDetector(baseConfig);
    }
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

    // Create TTS queue if not exists
    if (!this.ttsQueue) {
      this.ttsQueue = createTTSQueue({
        locale: this.locale,
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

    // Cleanup adapters
    this.turnDetector?.destroy();
    this.turnManager?.destroy();

    this.isInitialized = false;

    if (this.config.debug) {
      console.log("[VoiceKit] Destroyed");
    }
  }
}

/**
 * Create a VoiceKit instance
 */
export function createVoiceKit(config: VoiceKitConfig): VoiceKit {
  return new VoiceKit(config);
}
