/**
 * Cloud Turn Detector
 *
 * Remote ML model via KOND API for turn prediction.
 * Falls back to heuristic detection if API call fails.
 *
 * All authentication goes through VoiceKit API key (vk_xxx).
 */

import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import { DEFAULT_TURN_DETECTOR_CONFIG } from "../../ports/turn-detector";
import { createHeuristicTurnDetector } from "./heuristic";
import { getEndpointUrl, ENDPOINT_PATHS, DEFAULT_BASE_URL } from "../../types/config";

// =============================================================================
// Adapter Implementation
// =============================================================================

export interface CloudTurnDetectorOptions extends TurnDetectorConfig {
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
export class CloudTurnDetector implements TurnDetectorProvider {
  readonly name = "cloud";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private options: CloudTurnDetectorOptions;
  private history: ConversationTurn[] = [];
  private fallbackDetector: TurnDetectorProvider | null = null;
  private baseUrl: string;

  constructor(options: CloudTurnDetectorOptions) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 2000,
      maxRetries: options.maxRetries ?? 1,
      ...options,
    };
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  }

  async init(): Promise<void> {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Initializing with KOND API`);
    }

    // Initialize fallback detector
    this.fallbackDetector = createHeuristicTurnDetector(this.config);
    await this.fallbackDetector.init();

    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Ready`);
    }
  }

  /**
   * Predict turn state by calling KOND API
   */
  async predict(context: TurnContext): Promise<TurnPrediction> {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] predict() - transcript: "${context.transcript.substring(0, 30)}..."`);
    }

    try {
      const prediction = await this.callApi(context);
      if (this.config.debug) {
        console.log(`[CloudTurnDetector] API response: ${prediction.reason} (${(prediction.confidence * 100).toFixed(0)}%)`);
      }
      return prediction;
    } catch (error) {
      console.warn("[CloudTurnDetector] API call failed, using fallback:", error);
      return this.useFallback(context, "api_error");
    }
  }

  /**
   * Call the KOND turn detector API
   */
  private async callApi(context: TurnContext): Promise<TurnPrediction> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );

    try {
      const url = getEndpointUrl(this.baseUrl, ENDPOINT_PATHS.turnDetect);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          transcript: context.transcript,
          locale: context.locale,
          vadProbability: context.vadProbability,
          silenceDurationMs: context.silenceDurationMs,
          sttConfidence: context.sttConfidence,
          utteranceDurationMs: context.utteranceDurationMs,
          history: this.history.slice(-4), // Last 4 turns
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 402 Quota Exceeded
      if (response.status === 402) {
        const data = await response.json();
        if (this.config.debug) {
          console.log("[CloudTurnDetector] Quota exceeded, using fallback");
        }
        // Notify via callback
        if (this.options.onQuotaExceeded && data.upgradeUrl) {
          this.options.onQuotaExceeded(data.upgradeUrl);
        }
        // Fall back to heuristic
        return this.useFallback(context, "quota_exceeded");
      }

      // Handle 401 Unauthorized (invalid API key)
      if (response.status === 401) {
        console.warn("[CloudTurnDetector] Invalid API key (401)");
        return this.useFallback(context, "invalid_api_key");
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        shouldCommit: data.shouldCommit,
        confidence: data.confidence,
        reason: data.reason || "model_prediction",
        predictedEndMs: data.predictedEndMs,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Use fallback heuristic detector
   */
  private async useFallback(
    context: TurnContext,
    reason: string
  ): Promise<TurnPrediction> {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Using fallback (${reason})`);
    }

    if (!this.fallbackDetector) {
      // Emergency fallback if detector not initialized
      return {
        shouldCommit: context.silenceDurationMs > 1000,
        confidence: 0.5,
        reason: "incomplete",
      };
    }

    return this.fallbackDetector.predict(context);
  }

  addTurn(turn: ConversationTurn): void {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
    // Also update fallback detector
    this.fallbackDetector?.addTurn(turn);
  }

  reset(): void {
    this.history = [];
    this.fallbackDetector?.reset();
  }

  destroy(): void {
    this.reset();
    this.fallbackDetector?.destroy();
    this.fallbackDetector = null;
  }
}

/**
 * Factory function
 */
export function createCloudTurnDetector(
  options: CloudTurnDetectorOptions
): TurnDetectorProvider {
  return new CloudTurnDetector(options);
}
