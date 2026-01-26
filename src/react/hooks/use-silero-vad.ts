"use client";

/**
 * Silero VAD Hook
 * Provides ML-based voice activity detection for voice conversations
 */

import { useCallback, useRef, useEffect } from "react";
import { createSileroVAD } from "../../adapters/vad";
import type { VADProvider, VADCallbacks } from "../../ports/vad";

interface UseSileroVADOptions {
  /** Probability threshold for speech detection (default: 0.5) */
  threshold?: number;
  /** Silence duration before triggering onSpeechEnd (default: 700ms) */
  silenceDuration?: number;
  /** Minimum speech duration (default: 250ms) */
  minSpeechDuration?: number;
  debug?: boolean;
}

export interface UseSileroVADReturn {
  /** Ref for external access to VAD instance */
  vadRef: React.MutableRefObject<VADProvider | null>;

  /** Start Silero VAD with the given MediaStream */
  startVAD: (stream: MediaStream, callbacks: VADCallbacks) => Promise<void>;

  /** Stop VAD and cleanup */
  stopVAD: () => void;

  /** Get current speech probability (0-1) */
  getSpeechProbability: () => number;

  /** Check if VAD is currently running */
  isVADRunning: () => boolean;
}

export function useSileroVAD(
  options: UseSileroVADOptions = {}
): UseSileroVADReturn {
  const {
    threshold = 0.5,
    silenceDuration = 700,
    minSpeechDuration = 250,
    debug = false,
  } = options;

  const vadRef = useRef<VADProvider | null>(null);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[silero-vad]", ...args);
    },
    [debug]
  );

  /**
   * Start Silero VAD with the given MediaStream
   */
  const startVAD = useCallback(
    async (stream: MediaStream, callbacks: VADCallbacks) => {
      // Cleanup existing
      if (vadRef.current) {
        vadRef.current.stop();
      }

      log("Starting Silero VAD");
      vadRef.current = createSileroVAD({
        threshold,
        silenceDuration,
        minSpeechDuration,
      });

      await vadRef.current.init();
      vadRef.current.start(stream, callbacks);
    },
    [threshold, silenceDuration, minSpeechDuration, log]
  );

  /**
   * Stop VAD and cleanup
   */
  const stopVAD = useCallback(() => {
    if (vadRef.current) {
      log("Stopping Silero VAD");
      vadRef.current.stop();
      vadRef.current = null;
    }
  }, [log]);

  /**
   * Get current speech probability (0-1)
   */
  const getSpeechProbability = useCallback(() => {
    return vadRef.current?.getSpeechProbability() ?? 0;
  }, []);

  /**
   * Check if VAD is currently running
   */
  const isVADRunning = useCallback(() => {
    return vadRef.current?.isRunning() ?? false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVAD();
    };
  }, [stopVAD]);

  return {
    vadRef,
    startVAD,
    stopVAD,
    getSpeechProbability,
    isVADRunning,
  };
}
