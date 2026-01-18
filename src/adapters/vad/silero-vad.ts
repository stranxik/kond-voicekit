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

import { MicVAD, type RealTimeVADOptions } from "@ricky0123/vad-web";
import type { VADProvider, VADCallbacks, VADConfig } from "../../ports/vad";

// ============================================
// CONFIGURATION
// ============================================

/**
 * Silero VAD configuration
 */
export interface SileroVADConfig extends VADConfig {
  /** Base path for assets (ONNX model, worklet) - default: "/" */
  baseAssetPath?: string;
  /** ONNX WASM base path - default: CDN */
  onnxWASMBasePath?: string;
  /** VAD model version - default: "v5" */
  modelVersion?: "v5" | "legacy";
}

const DEFAULT_CONFIG: Required<Omit<SileroVADConfig, "baseAssetPath" | "onnxWASMBasePath" | "modelVersion">> & SileroVADConfig = {
  threshold: 0.5,
  minSpeechDuration: 250,
  silenceDuration: 700,
  hysteresisFrames: 3,
  // Use jsdelivr CDN for VAD model - avoids need to copy 2.3MB file to public/
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  modelVersion: "v5",
};

// ============================================
// ADAPTER IMPLEMENTATION
// ============================================

export class SileroVADAdapter implements VADProvider {
  private vad: MicVAD | null = null;
  private config: Required<Omit<SileroVADConfig, "baseAssetPath" | "onnxWASMBasePath" | "modelVersion">> & SileroVADConfig;
  private speechProbability = 0;
  private isActive = false;
  private stream: MediaStream | null = null;

  constructor(config?: SileroVADConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // Pre-loading happens on first start() call
    console.log("[SileroVAD] Initialized");
  }

  start(stream: MediaStream, callbacks: VADCallbacks): void {
    if (this.isActive) {
      console.warn("[SileroVAD] Already running");
      return;
    }

    this.isActive = true;
    this.stream = stream;

    const vadOptions: Partial<RealTimeVADOptions> = {
      // Stream handling - provide existing stream
      getStream: async () => stream,

      // Thresholds (Silero recommends negative = positive - 0.15)
      positiveSpeechThreshold: this.config.threshold,
      negativeSpeechThreshold: this.config.threshold - 0.15,

      // Timing (in ms)
      minSpeechMs: this.config.minSpeechDuration,
      redemptionMs: this.config.silenceDuration,
      preSpeechPadMs: 100,

      // Model selection
      model: this.config.modelVersion || "v5",

      // Asset paths
      baseAssetPath: this.config.baseAssetPath,
      onnxWASMBasePath: this.config.onnxWASMBasePath,

      // Start immediately when loaded
      startOnLoad: true,

      // Callbacks
      onSpeechStart: () => {
        console.log("[SileroVAD] Speech started");
        callbacks.onSpeechStart?.();
      },

      onSpeechEnd: (_audio: Float32Array) => {
        console.log("[SileroVAD] Speech ended");
        callbacks.onSpeechEnd?.();
      },

      onVADMisfire: () => {
        // Speech was too short - ignore
        console.log("[SileroVAD] Misfire (too short)");
      },

      onFrameProcessed: (probabilities, _frame) => {
        // probabilities.isSpeech is 0-1 probability from Silero model
        this.speechProbability = probabilities.isSpeech;
        callbacks.onSpeechProbability?.(probabilities.isSpeech);
      },
    };

    MicVAD.new(vadOptions)
      .then((vad) => {
        this.vad = vad;
        console.log(
          "%c[VAD] Silero VAD ACTIVE (ML-based)",
          "color: #22c55e; font-weight: bold"
        );
      })
      .catch((error) => {
        console.error(
          "%c[VAD] Silero VAD FAILED",
          "color: #ef4444; font-weight: bold",
          error
        );
        callbacks.onError?.(error as Error);
        this.isActive = false;
      });
  }

  stop(): void {
    if (this.vad) {
      this.vad.pause();
      this.vad.destroy();
      this.vad = null;
    }
    this.isActive = false;
    this.speechProbability = 0;
    this.stream = null;
    console.log("[SileroVAD] Stopped");
  }

  isRunning(): boolean {
    return this.isActive && this.vad !== null;
  }

  getSpeechProbability(): number {
    return this.speechProbability;
  }
}

/**
 * Factory function to create Silero VAD adapter
 */
export function createSileroVAD(config?: SileroVADConfig): VADProvider {
  return new SileroVADAdapter(config);
}
