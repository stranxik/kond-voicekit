"use client";

/**
 * Turn Coordination Hook
 * Wrapper for TurnManager - intelligent turn-taking for voice conversations
 */

import { useCallback, useRef, useEffect } from "react";
import { createTurnManager, type TurnManager } from "../../core/turn-manager";
import type { TurnDetectorProvider } from "../../ports/turn-detector";
import { SPEECH_HYSTERESIS_MS } from "../types";

/** Conversation states supported by TurnManager */
type ConversationState =
  | "idle"
  | "connecting"
  | "listening"
  | "vad_cooldown"
  | "triggered"
  | "streaming"
  | "processing"
  | "speaking"
  | "cooldown";

interface UseTurnCoordinationOptions {
  speechFinalDelayMs: number;
  debug?: boolean;
  /** Optional ML-based turn detector provider */
  turnDetector?: TurnDetectorProvider | null;
  /** Called when user's turn is complete */
  onTurnComplete: (transcript: string, confidence: number) => void;
  /** Called when user interrupts during TTS */
  onBargeIn: () => void;
  /** Called when speech activity changes (for UI) */
  onSpeechActivity: (speaking: boolean) => void;
}

export interface UseTurnCoordinationReturn {
  // Ref for external access
  turnManagerRef: React.MutableRefObject<TurnManager | null>;

  // Lifecycle
  createTurnManager: () => void;
  destroyTurnManager: () => void;
  resetTurnManager: () => void;

  // Feed events from STT
  feedTranscript: (
    text: string,
    isFinal: boolean,
    speechFinal: boolean,
    confidence: number
  ) => void;

  // Feed RMS from AudioWorklet
  feedRMS: (level: number) => void;

  // Feed VAD events
  feedVADEvent: (event: "started" | "ended") => void;

  // Feed continuous VAD probability (0-1)
  feedVADProbability: (probability: number) => void;

  // Sync conversation state
  syncState: (state: ConversationState) => void;

  // Get accumulated transcript from TurnManager
  getTranscript: () => string;

  // Set turn detector dynamically (for late initialization)
  setTurnDetector: (detector: TurnDetectorProvider | null) => void;
}

export function useTurnCoordination(
  options: UseTurnCoordinationOptions
): UseTurnCoordinationReturn {
  const {
    speechFinalDelayMs,
    debug = false,
    turnDetector,
    onTurnComplete,
    onBargeIn,
    onSpeechActivity,
  } = options;

  const turnManagerRef = useRef<TurnManager | null>(null);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[turn-coordination]", ...args);
    },
    [debug]
  );

  /**
   * Create a new TurnManager instance
   */
  const createTurnManagerFn = useCallback(() => {
    // Cleanup existing
    if (turnManagerRef.current) {
      turnManagerRef.current.destroy();
    }

    log(
      "Creating TurnManager",
      turnDetector ? `with ${turnDetector.name} detector` : "without ML detector"
    );
    turnManagerRef.current = createTurnManager({
      silenceThresholdMs: 700,
      stabilityThresholdMs: 500,
      maxSilenceMs: 1500,
      gracePeriodMs: speechFinalDelayMs,
      rmsThreshold: 0.015,
      speechHysteresisMs: SPEECH_HYSTERESIS_MS,
      speechHangoverMs: 300,
      debug,
      turnDetector: turnDetector ?? undefined,
      onTurnComplete: (transcript, confidence) => {
        log("Turn complete:", transcript.substring(0, 50) + "...");
        onTurnComplete(transcript, confidence);
      },
      onBargeIn: () => {
        log("Barge-in detected");
        onBargeIn();
      },
      onSpeechActivity: (speaking) => {
        onSpeechActivity(speaking);
      },
    });
  }, [
    speechFinalDelayMs,
    debug,
    turnDetector,
    onTurnComplete,
    onBargeIn,
    onSpeechActivity,
    log,
  ]);

  /**
   * Destroy TurnManager and cleanup
   */
  const destroyTurnManager = useCallback(() => {
    if (turnManagerRef.current) {
      log("Destroying TurnManager");
      turnManagerRef.current.destroy();
      turnManagerRef.current = null;
    }
  }, [log]);

  /**
   * Reset TurnManager state for new turn
   */
  const resetTurnManager = useCallback(() => {
    if (turnManagerRef.current) {
      log("Resetting TurnManager");
      turnManagerRef.current.reset();
    }
  }, [log]);

  /**
   * Feed transcript from STT
   */
  const feedTranscript = useCallback(
    (
      text: string,
      isFinal: boolean,
      speechFinal: boolean,
      confidence: number
    ) => {
      turnManagerRef.current?.handleTranscript(
        text,
        isFinal,
        speechFinal,
        confidence
      );
    },
    []
  );

  /**
   * Feed RMS level from AudioWorklet
   */
  const feedRMS = useCallback((level: number) => {
    turnManagerRef.current?.handleRMS(level);
  }, []);

  /**
   * Feed VAD event from STT
   */
  const feedVADEvent = useCallback((event: "started" | "ended") => {
    turnManagerRef.current?.handleVADEvent(event);
  }, []);

  /**
   * Feed continuous VAD probability (0-1) from AudioWorklet
   */
  const feedVADProbability = useCallback((probability: number) => {
    turnManagerRef.current?.handleVADProbability(probability);
  }, []);

  /**
   * Sync conversation state to TurnManager for context-aware decisions
   */
  const syncState = useCallback((state: ConversationState) => {
    if (!turnManagerRef.current) return;

    // Map conversation state to TurnManager state
    const tmState =
      state === "listening"
        ? "listening"
        : state === "triggered"
          ? "triggered"
          : state === "streaming"
            ? "streaming"
            : state === "speaking"
              ? "speaking"
              : state === "cooldown"
                ? "cooldown"
                : state === "vad_cooldown"
                  ? "vad_cooldown"
                  : "listening"; // Default for idle, connecting, processing

    turnManagerRef.current.setState(tmState);
  }, []);

  /**
   * Get accumulated transcript from TurnManager
   * This returns the full transcript accumulated across STT utterances
   */
  const getTranscript = useCallback(() => {
    return turnManagerRef.current?.getTranscript() ?? "";
  }, []);

  /**
   * Set turn detector dynamically (for late initialization)
   */
  const setTurnDetector = useCallback(
    (detector: TurnDetectorProvider | null) => {
      if (turnManagerRef.current) {
        log("Setting TurnDetector:", detector?.name ?? "none");
        turnManagerRef.current.setTurnDetector(detector);
      }
    },
    [log]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyTurnManager();
    };
  }, [destroyTurnManager]);

  return {
    turnManagerRef,
    createTurnManager: createTurnManagerFn,
    destroyTurnManager,
    resetTurnManager,
    feedTranscript,
    feedRMS,
    feedVADEvent,
    feedVADProbability,
    syncState,
    getTranscript,
    setTurnDetector,
  };
}
