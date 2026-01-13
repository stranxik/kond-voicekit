"use client";

/**
 * Turn Detector Hook
 * Auto-selects the best turn detector based on device capability
 *
 * Selection strategy:
 * 1. If forceProvider specified -> use that provider
 * 2. If device capable (WASM SIMD, 4GB+ RAM) -> use ONNX (local)
 * 3. Otherwise -> use Cloud API or Heuristic fallback
 *
 * The hook manages:
 * - Provider initialization
 * - Turn predictions
 * - Conversation history
 * - Cleanup on unmount
 */

import { useCallback, useRef, useState, useEffect } from "react";
import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import {
  createHeuristicTurnDetector,
  createOnnxTurnDetector,
  createCloudTurnDetector,
} from "../../adapters/turn-detector";
import { isDeviceCapableForLocalML } from "../../core/utils/device-capability";

export type TurnDetectorType = "heuristic" | "onnx" | "cloud" | "auto";

export interface UseTurnDetectorOptions extends TurnDetectorConfig {
  /** Force specific provider type */
  type?: TurnDetectorType;
  /** Enable turn detector (default: true) */
  enabled?: boolean;
  /** Cloud API URL (for cloud provider) */
  cloudApiUrl?: string;
  /** Custom auth token provider for cloud provider */
  getAuthToken?: () => Promise<string>;
}

export interface UseTurnDetectorReturn {
  /** Provider is initialized and ready */
  isReady: boolean;
  /** Currently active provider type */
  activeType: TurnDetectorType | null;
  /** Initialize the provider (auto-selects if type is "auto") */
  init: () => Promise<void>;
  /** Get turn prediction */
  predict: (context: TurnContext) => Promise<TurnPrediction | null>;
  /** Add completed turn to history */
  addTurn: (turn: ConversationTurn) => void;
  /** Reset provider state */
  reset: () => void;
  /** Get raw provider instance (for advanced use) */
  getProvider: () => TurnDetectorProvider | null;
  /** Last prediction result */
  lastPrediction: TurnPrediction | null;
  /** Error if initialization failed */
  error: Error | null;
}

/**
 * Create turn detector based on type
 */
async function createDetector(
  type: TurnDetectorType,
  config: UseTurnDetectorOptions
): Promise<{ provider: TurnDetectorProvider; activeType: TurnDetectorType }> {
  // Handle auto-selection
  if (type === "auto") {
    try {
      const capable = await isDeviceCapableForLocalML();
      if (capable) {
        console.log("[useTurnDetector] Device capable for local ML -> ONNX");
        return {
          provider: createOnnxTurnDetector(config),
          activeType: "onnx",
        };
      } else {
        console.log("[useTurnDetector] Device not capable -> Cloud");
        return {
          provider: createCloudTurnDetector({
            ...config,
            apiUrl: config.cloudApiUrl,
            getAuthToken: config.getAuthToken,
          }),
          activeType: "cloud",
        };
      }
    } catch (error) {
      console.warn(
        "[useTurnDetector] Auto-select failed, using heuristic:",
        error
      );
      return {
        provider: createHeuristicTurnDetector(config),
        activeType: "heuristic",
      };
    }
  }

  // Explicit type selection
  switch (type) {
    case "onnx":
      return {
        provider: createOnnxTurnDetector(config),
        activeType: "onnx",
      };
    case "cloud":
      return {
        provider: createCloudTurnDetector({
          ...config,
          apiUrl: config.cloudApiUrl,
          getAuthToken: config.getAuthToken,
        }),
        activeType: "cloud",
      };
    case "heuristic":
    default:
      return {
        provider: createHeuristicTurnDetector(config),
        activeType: "heuristic",
      };
  }
}

/**
 * Hook for ML-based turn detection
 *
 * @example
 * ```tsx
 * const { isReady, predict, addTurn, reset } = useTurnDetector({
 *   type: "auto", // Auto-select based on device
 *   detectBackchannels: true,
 *   locale: "fr",
 * });
 *
 * // In your voice handler
 * const handleTranscript = async (context: TurnContext) => {
 *   if (!isReady) return;
 *
 *   const prediction = await predict(context);
 *   if (prediction?.shouldCommit) {
 *     // User finished speaking
 *   }
 * };
 * ```
 */
export function useTurnDetector(
  options: UseTurnDetectorOptions = {}
): UseTurnDetectorReturn {
  const { type = "heuristic", enabled = true, ...config } = options;

  const [isReady, setIsReady] = useState(false);
  const [activeType, setActiveType] = useState<TurnDetectorType | null>(null);
  const [lastPrediction, setLastPrediction] = useState<TurnPrediction | null>(
    null
  );
  const [error, setError] = useState<Error | null>(null);

  const providerRef = useRef<TurnDetectorProvider | null>(null);
  const initializingRef = useRef(false);

  /**
   * Initialize the provider
   */
  const init = useCallback(async () => {
    console.log(
      "[useTurnDetector] init() called - type:",
      type,
      "enabled:",
      enabled,
      "cloudApiUrl:",
      config.cloudApiUrl
    );

    if (!enabled) {
      console.log("[useTurnDetector] Disabled, skipping init");
      return;
    }

    if (providerRef.current || initializingRef.current) {
      console.log(
        "[useTurnDetector] Already initialized or initializing, skipping"
      );
      return;
    }

    initializingRef.current = true;
    setError(null);

    try {
      console.log("[useTurnDetector] Creating detector...");
      const { provider, activeType: selectedType } = await createDetector(
        type,
        config as UseTurnDetectorOptions
      );
      console.log(
        "[useTurnDetector] Provider created:",
        provider.name,
        "- calling init()..."
      );
      await provider.init();

      providerRef.current = provider;
      setActiveType(selectedType);
      setIsReady(true);

      console.log(
        `[useTurnDetector] Initialized with ${selectedType}`,
        provider
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("[useTurnDetector] Init failed:", error);

      // Fallback to heuristic on failure
      try {
        const fallback = createHeuristicTurnDetector(
          config as UseTurnDetectorOptions
        );
        await fallback.init();
        providerRef.current = fallback;
        setActiveType("heuristic");
        setIsReady(true);
        console.log("[useTurnDetector] Fell back to heuristic");
      } catch (fallbackErr) {
        console.error("[useTurnDetector] Fallback also failed:", fallbackErr);
      }
    } finally {
      initializingRef.current = false;
    }
  }, [enabled, type, config]);

  /**
   * Get turn prediction
   */
  const predict = useCallback(
    async (context: TurnContext): Promise<TurnPrediction | null> => {
      if (!providerRef.current) {
        return null;
      }

      try {
        const prediction = await providerRef.current.predict(context);
        setLastPrediction(prediction);
        return prediction;
      } catch (err) {
        console.error("[useTurnDetector] Prediction failed:", err);
        return null;
      }
    },
    []
  );

  /**
   * Add completed turn to history
   */
  const addTurn = useCallback((turn: ConversationTurn) => {
    providerRef.current?.addTurn(turn);
  }, []);

  /**
   * Reset provider state
   */
  const reset = useCallback(() => {
    providerRef.current?.reset();
    setLastPrediction(null);
  }, []);

  /**
   * Get raw provider instance
   */
  const getProvider = useCallback(() => providerRef.current, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, []);

  return {
    isReady,
    activeType,
    init,
    predict,
    addTurn,
    reset,
    getProvider,
    lastPrediction,
    error,
  };
}

/**
 * Create turn detector provider (non-hook version)
 * Use this for integration with TurnManager
 */
export async function createTurnDetector(
  options: UseTurnDetectorOptions = {}
): Promise<TurnDetectorProvider> {
  const { type = "auto", ...config } = options;
  const { provider } = await createDetector(type, config as UseTurnDetectorOptions);
  await provider.init();
  return provider;
}
