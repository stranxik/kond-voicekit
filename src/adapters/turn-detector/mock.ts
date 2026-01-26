/**
 * Mock Turn Detector
 * For testing purposes
 */

import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import { DEFAULT_TURN_DETECTOR_CONFIG } from "../../ports/turn-detector";

export interface MockTurnDetectorOptions extends TurnDetectorConfig {
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
export class MockTurnDetector implements TurnDetectorProvider {
  readonly name = "mock";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private options: MockTurnDetectorOptions;
  private history: ConversationTurn[] = [];
  private predictCount = 0;

  constructor(options: MockTurnDetectorOptions = {}) {
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };
  }

  async init(): Promise<void> {
    // No-op for mock
    if (this.config.debug) {
      console.log("[MockTurnDetector] Initialized");
    }
  }

  async predict(context: TurnContext): Promise<TurnPrediction> {
    this.predictCount++;

    // Simulate delay if configured
    if (this.options.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    // Return fixed prediction if configured
    if (this.options.alwaysReturn) {
      return this.options.alwaysReturn;
    }

    // Return incomplete for first N predictions
    if (
      this.options.incompleteUntil &&
      this.predictCount <= this.options.incompleteUntil
    ) {
      return {
        shouldCommit: false,
        confidence: 0.9,
        reason: "incomplete",
      };
    }

    // Default: return complete
    return {
      shouldCommit: true,
      confidence: 0.85,
      reason: "model_prediction",
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
    this.predictCount = 0;
  }

  destroy(): void {
    this.reset();
  }

  // Test helpers
  getHistory(): ConversationTurn[] {
    return [...this.history];
  }

  getPredictCount(): number {
    return this.predictCount;
  }
}

/**
 * Factory function
 */
export function createMockTurnDetector(
  options?: MockTurnDetectorOptions
): TurnDetectorProvider {
  return new MockTurnDetector(options);
}
