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
import { createDeepgramAdapter, createDeepgramAdapterWithAuth } from "./adapters/stt";
import { createSileroVAD } from "./adapters/vad";
import {
  createHeuristicTurnDetector,
  createCloudTurnDetector,
  createOnnxTurnDetector,
} from "./adapters/turn-detector";

// Core
import { createTurnManager, type TurnManager } from "./core/turn-manager";
import { createTTSQueue } from "./core/tts-queue";
import { createSentenceAccumulator } from "./core/sentence-chunker";
import { configureTTSStreaming, stopStreamingTTS } from "./core/tts-streaming";
import { selectTtsModel } from "./core/tts-model-router";
import { loadAudioWorklet } from "./core/worklet-loader";

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

  constructor(config: VoiceKitConfig) {
    // Validate authentication: either apiKey OR (token + tokenWsUrl) required
    const hasApiKey = !!config.apiKey;
    const hasToken = !!config.token && !!config.tokenWsUrl;

    if (!hasApiKey && !hasToken) {
      throw new Error(
        "VoiceKit requires either 'apiKey' or both 'token' and 'tokenWsUrl' for authentication"
      );
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
      const detectorType = this.config.turnDetection?.type || "auto";
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
   */
  private async createTurnDetector(type: string): Promise<TurnDetectorProvider> {
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
      onQuotaExceeded: this.config.onQuotaExceeded,
    };

    // Check if we have valid auth for cloud detector
    const hasCloudAuth = this.config.apiKey || this.config.token;

    switch (type) {
      case "cloud":
        return createCloudTurnDetector(cloudOptions);
      case "onnx":
        // ONNX stub kept for future v2, but not recommended
        return createOnnxTurnDetector(baseConfig);
      case "heuristic":
        return createHeuristicTurnDetector(baseConfig);
      case "auto":
      default:
        // Auto: use cloud if apiKey or token available, otherwise heuristic fallback
        if (hasCloudAuth) {
          return createCloudTurnDetector(cloudOptions);
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
            (this.stt as any).sendAudio(e.data.data);
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

    // Close AudioContext (only on destroy, not stop)
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
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
