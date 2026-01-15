/**
 * Turn Detector Port
 * Abstract interface for ML-based turn detection
 *
 * This is a SIGNAL provider, not a DECIDER.
 * The TurnManager combines this with EOU + VAD + timing to make final decisions.
 */

import type { Locale } from "../types/config";

/**
 * Prediction result from turn detector
 */
export interface TurnPrediction {
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
export type TurnPredictionReason =
  | "semantic_complete" // Sentence semantically finished
  | "prosodic_cue" // Pitch/energy suggests end
  | "long_silence" // Extended pause
  | "backchannel" // User just acknowledging (mh, ouais, ok)
  | "incomplete" // Still speaking
  | "interrupted" // User interrupted AI
  | "model_prediction" // ML model decision
  | "timeout"; // Max duration reached

/**
 * Context provided to turn detector
 */
export interface TurnContext {
  // Current utterance
  transcript: string;
  utteranceDurationMs: number;

  // STT signals
  sttConfidence: number;
  isFinal: boolean;
  speechFinal: boolean;

  // Audio signals
  vadProbability: number;
  silenceDurationMs: number;
  transcriptStableMs: number;

  // Conversation context (for ML models)
  conversationHistory?: ConversationTurn[];
  locale: Locale;
}

/**
 * A turn in the conversation history
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  durationMs?: number;
}

/**
 * Configuration for turn detector
 */
export interface TurnDetectorConfig {
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
export interface TurnDetectorProvider {
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
export const DEFAULT_TURN_DETECTOR_CONFIG: Required<
  Omit<TurnDetectorConfig, "forceProvider">
> = {
  detectBackchannels: true,
  detectInterruptions: true,
  confidenceThreshold: 0.7,
  maxContextTurns: 4,
  debug: false,
};
