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

import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import { DEFAULT_TURN_DETECTOR_CONFIG } from "../../ports/turn-detector";

export interface OnnxTurnDetectorOptions extends TurnDetectorConfig {
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
export class OnnxTurnDetector implements TurnDetectorProvider {
  readonly name = "onnx";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private options: OnnxTurnDetectorOptions;
  private history: ConversationTurn[] = [];
  private initialized = false;

  constructor(options: OnnxTurnDetectorOptions = {}) {
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.config.debug) {
      console.log("[OnnxTurnDetector] Initializing (STUB)...");
      console.warn(
        "[OnnxTurnDetector] Full implementation pending - falling back to heuristic behavior"
      );
    }

    // TODO: Load ONNX model
    // const ort = await import('onnxruntime-web');
    // this.session = await ort.InferenceSession.create(modelUrl);

    this.initialized = true;
  }

  /**
   * STUB: Returns heuristic-based prediction
   * Full implementation would run ONNX inference
   */
  async predict(context: TurnContext): Promise<TurnPrediction> {
    // Ensure initialized
    if (!this.initialized) {
      await this.init();
    }

    // STUB: Simple heuristic fallback
    // Full implementation would:
    // 1. Tokenize transcript + conversation history
    // 2. Run ONNX inference
    // 3. Parse output probability

    const { transcript, silenceDurationMs, vadProbability, sttConfidence } = context;
    const trimmed = transcript.trim();

    // Basic heuristics (placeholder for ML)
    if (trimmed.length < 3) {
      return {
        shouldCommit: false,
        confidence: 0.9,
        reason: "incomplete",
      };
    }

    if (vadProbability > 0.7) {
      return {
        shouldCommit: false,
        confidence: 0.7,
        reason: "incomplete",
      };
    }

    if (/[.!?]$/.test(trimmed) && silenceDurationMs > 500) {
      return {
        shouldCommit: true,
        confidence: 0.9,
        reason: "model_prediction",
      };
    }

    if (silenceDurationMs > 1000 && sttConfidence > 0.8) {
      return {
        shouldCommit: true,
        confidence: 0.8,
        reason: "long_silence",
      };
    }

    return {
      shouldCommit: false,
      confidence: 0.6,
      reason: "incomplete",
    };
  }

  addTurn(turn: ConversationTurn): void {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
  }

  reset(): void {
    this.history = [];
  }

  destroy(): void {
    this.reset();
    this.initialized = false;
    // TODO: Cleanup ONNX session
    // this.session?.release();
  }
}

/**
 * Factory function
 */
export function createOnnxTurnDetector(
  options?: OnnxTurnDetectorOptions
): TurnDetectorProvider {
  return new OnnxTurnDetector(options);
}
