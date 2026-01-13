/**
 * Cloud Turn Detector
 * Remote ML model via API for weaker devices or when local ONNX is unavailable.
 *
 * Calls a turn-detector API service with JWT authentication.
 * Falls back to heuristic detection if API call fails.
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

// =============================================================================
// Configuration (abstracted for SDK users)
// =============================================================================

export interface CloudTurnDetectorConfig {
  /** API URL for turn detector service */
  apiUrl: string;
  /** Token endpoint URL (default: /api/voice/token) */
  tokenUrl?: string;
}

let globalConfig: CloudTurnDetectorConfig = {
  apiUrl: "",
  tokenUrl: "/api/voice/token",
};

/**
 * Configure Cloud Turn Detector globally
 * Call this before creating adapters to set your backend URLs
 */
export function configureCloudTurnDetector(config: Partial<CloudTurnDetectorConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current Cloud Turn Detector config
 */
export function getCloudTurnDetectorConfig(): CloudTurnDetectorConfig {
  return { ...globalConfig };
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export interface CloudTurnDetectorOptions extends TurnDetectorConfig {
  /** API URL for turn detector service (optional override) */
  apiUrl?: string;
  /** Token endpoint URL (optional override) */
  tokenUrl?: string;
  /** Custom auth token provider (alternative to tokenUrl) */
  getAuthToken?: () => Promise<string>;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Max retries on failure */
  maxRetries?: number;
}

/**
 * Cloud Turn Detector
 *
 * Calls remote API for turn prediction with JWT authentication.
 * Falls back to heuristic if API unavailable.
 */
export class CloudTurnDetector implements TurnDetectorProvider {
  readonly name = "cloud";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private options: CloudTurnDetectorOptions;
  private history: ConversationTurn[] = [];
  private apiUrl: string = "";
  private tokenUrl: string = "";
  private jwtToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private isRefreshing: boolean = false;
  private fallbackDetector: TurnDetectorProvider | null = null;

  // Refresh token 1 minute before expiry
  private static readonly TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

  constructor(options: CloudTurnDetectorOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 2000,
      maxRetries: options.maxRetries ?? 1,
      ...options,
    };
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };
  }

  async init(): Promise<void> {
    // Use instance options, then global config
    this.apiUrl = this.options.apiUrl || globalConfig.apiUrl;
    this.tokenUrl = this.options.tokenUrl || globalConfig.tokenUrl || "/api/voice/token";

    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Initializing with URL: ${this.apiUrl || "(empty)"}`);
    }

    // Initialize fallback detector
    this.fallbackDetector = createHeuristicTurnDetector(this.config);
    await this.fallbackDetector.init();

    // Get JWT token for authentication
    const tokenOk = await this.refreshToken();

    if (this.config.debug) {
      console.log(
        `[CloudTurnDetector] Ready - URL: ${this.apiUrl}, JWT: ${tokenOk ? "valid" : "failed"}`
      );
    }
  }

  /**
   * Check if token needs refresh (expired or expiring soon)
   */
  private needsTokenRefresh(): boolean {
    if (!this.jwtToken) return true;
    const now = Date.now();
    return now >= this.tokenExpiresAt - CloudTurnDetector.TOKEN_REFRESH_MARGIN_MS;
  }

  /**
   * Parse JWT to extract expiration time
   */
  private parseTokenExpiry(token: string): number {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return 0;
      const payload = JSON.parse(atob(parts[1]));
      // exp is in seconds, convert to ms
      return (payload.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  /**
   * Refresh JWT token from the app's auth endpoint
   */
  private async refreshToken(): Promise<boolean> {
    // Prevent concurrent refresh attempts
    if (this.isRefreshing) {
      return !!this.jwtToken;
    }

    this.isRefreshing = true;
    try {
      // Use custom auth provider if available
      if (this.options.getAuthToken) {
        const token = await this.options.getAuthToken();
        this.jwtToken = token;
        this.tokenExpiresAt = this.parseTokenExpiry(token);
        return true;
      }

      // Otherwise use tokenUrl endpoint
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        this.jwtToken = data.token;
        this.tokenExpiresAt = this.parseTokenExpiry(data.token);
        if (this.config.debug) {
          console.log(
            `[CloudTurnDetector] Token refreshed, expires in ${Math.round((this.tokenExpiresAt - Date.now()) / 1000)}s`
          );
        }
        return true;
      } else {
        console.warn(`[CloudTurnDetector] Token refresh failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.warn("[CloudTurnDetector] Failed to get JWT token:", error);
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Ensure we have a valid token, refreshing if needed
   */
  private async ensureValidToken(): Promise<boolean> {
    if (!this.needsTokenRefresh()) {
      return true;
    }
    return this.refreshToken();
  }

  /**
   * Predict turn state by calling remote API
   */
  async predict(context: TurnContext): Promise<TurnPrediction> {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] predict() - transcript: "${context.transcript.substring(0, 30)}..."`);
    }

    // If no API URL configured, use fallback
    if (!this.apiUrl) {
      console.warn("[CloudTurnDetector] No API URL configured, using fallback");
      return this.useFallback(context, "no_api_url");
    }

    // Ensure we have a valid token before calling API
    await this.ensureValidToken();

    try {
      const prediction = await this.callApi(context);
      if (this.config.debug) {
        console.log(`[CloudTurnDetector] API response: ${prediction.reason} (${(prediction.confidence * 100).toFixed(0)}%)`);
      }
      return prediction;
    } catch (error) {
      // On 401, try to refresh token and retry once
      if (error instanceof Error && error.message.includes("401")) {
        if (this.config.debug) {
          console.log("[CloudTurnDetector] Got 401, refreshing token and retrying...");
        }
        const refreshed = await this.refreshToken();
        if (refreshed) {
          try {
            const prediction = await this.callApi(context);
            return prediction;
          } catch (retryError) {
            console.warn("[CloudTurnDetector] Retry failed:", retryError);
          }
        }
      }
      console.warn("[CloudTurnDetector] API call failed, using fallback:", error);
      return this.useFallback(context, "api_error");
    }
  }

  /**
   * Call the turn detector API
   */
  private async callApi(context: TurnContext): Promise<TurnPrediction> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );

    try {
      const response = await fetch(`${this.apiUrl}/predict`, {
        method: "POST",
        headers,
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
  options?: CloudTurnDetectorOptions
): TurnDetectorProvider {
  return new CloudTurnDetector(options);
}

/**
 * Factory function with custom auth token provider
 */
export function createCloudTurnDetectorWithAuth(
  getAuthToken: () => Promise<string>,
  options?: Omit<CloudTurnDetectorOptions, "getAuthToken">
): TurnDetectorProvider {
  return new CloudTurnDetector({ ...options, getAuthToken });
}
