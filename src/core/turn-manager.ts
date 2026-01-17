/**
 * Turn Manager - Intelligent turn-taking for voice conversations
 *
 * Aggregates multiple signal sources to decide when the user has finished speaking:
 * - Deepgram transcripts (text, confidence, speechFinal)
 * - Local RMS levels from AudioWorklet
 * - Timing heuristics (silence duration, transcript stability)
 * - Semantic completion patterns (Phase 4)
 * - Optional ML-based Turn Detector (Phase 7)
 *
 * Philosophy: Deepgram is a SENSOR, not a DECIDER. We make the commit decision.
 */

import { isLikelyComplete } from "./trigger-detector";
import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
} from "../ports/turn-detector";

export interface TurnManagerConfig {
  // Timing thresholds (in ms)
  /** Minimum silence duration before considering commit (default: 700ms) */
  silenceThresholdMs: number;
  /** Transcript must be stable (unchanged) for this long (default: 500ms) */
  stabilityThresholdMs: number;
  /** Force commit after this much silence regardless (default: 1500ms) */
  maxSilenceMs: number;
  /** Grace period after speechFinal before commit (default: 1200ms) */
  gracePeriodMs: number;

  // Audio thresholds
  /** RMS level below this = silence (default: 0.01) */
  rmsThreshold: number;
  /** Minimum speech duration to be considered real (default: 150ms) */
  speechHysteresisMs: number;
  /** Hangover time after RMS drops (default: 300ms) */
  speechHangoverMs: number;
  /** VAD probability threshold for active speech (default: 0.5) */
  vadProbabilityThreshold: number;

  // Callbacks
  /** Called when user's turn is complete - time to respond */
  onTurnComplete: (transcript: string, confidence: number) => void;
  /** Called when user interrupts during TTS playback */
  onBargeIn: () => void;
  /** Called when speech activity changes (for UI feedback) */
  onSpeechActivity: (speaking: boolean) => void;

  // Locale for semantic patterns
  /** Language locale for semantic completion patterns (default: "fr") */
  locale?: "fr" | "en";

  // ML-based Turn Detection (Phase 7)
  /** Optional ML-based turn detector provider */
  turnDetector?: TurnDetectorProvider;
  /** Weight for ML prediction vs heuristics (0-1, default: 0.6) */
  mlWeight?: number;

  // Debug
  debug?: boolean;
}

export interface TurnManager {
  /** Process a transcript from Deepgram */
  handleTranscript(
    text: string,
    isFinal: boolean,
    speechFinal: boolean,
    confidence: number
  ): void;

  /** Process RMS level from AudioWorklet */
  handleRMS(level: number): void;

  /** Process VAD event from Deepgram */
  handleVADEvent(event: "started" | "ended"): void;

  /** Process continuous VAD probability (0-1) for more nuanced decisions */
  handleVADProbability(probability: number): void;

  /** Set current state (for context-aware decisions) */
  setState(state: "listening" | "triggered" | "streaming" | "speaking" | "cooldown" | "vad_cooldown"): void;

  /** Get current accumulated transcript */
  getTranscript(): string;

  /** Get current VAD probability (0-1) */
  getVADProbability(): number;

  /** Check if user is currently speaking (with hysteresis) */
  isSpeaking(): boolean;

  /** Add completed turn to history (for ML turn detector context) */
  addCompletedTurn(turn: ConversationTurn): void;

  /** Get latest ML turn prediction (if detector available) */
  getLastPrediction(): TurnPrediction | null;

  /** Set turn detector dynamically (for late initialization) */
  setTurnDetector(detector: TurnDetectorProvider | null): void;

  /** Reset state for new turn */
  reset(): void;

  /** Cleanup timers */
  destroy(): void;
}

const DEFAULT_CONFIG: Omit<
  TurnManagerConfig,
  "onTurnComplete" | "onBargeIn" | "onSpeechActivity"
> = {
  // Phase 6: Increased timings to give user more breathing room
  silenceThresholdMs: 1200,      // Was 700ms - wait longer before considering commit
  stabilityThresholdMs: 800,    // Was 500ms - transcript must be stable longer
  maxSilenceMs: 2500,           // Was 1500ms - force commit after longer silence
  gracePeriodMs: 2000,          // Was 1200ms - longer grace after speechFinal
  rmsThreshold: 0.01,
  speechHysteresisMs: 150,
  speechHangoverMs: 500,        // Was 300ms - stay "speaking" longer after audio drops
  vadProbabilityThreshold: 0.4, // Was 0.5 - be more sensitive to ongoing speech
  locale: "fr",
  // ML Turn Detection (Phase 7)
  turnDetector: undefined,
  mlWeight: 0.6,                // Balance between ML and heuristics
  debug: false,
};

/**
 * Create a Turn Manager instance
 */
export function createTurnManager(
  config: Partial<TurnManagerConfig> &
    Pick<TurnManagerConfig, "onTurnComplete" | "onBargeIn" | "onSpeechActivity">
): TurnManager {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // State
  let transcript = "";
  let lastTranscript = "";
  let accumulatedFinalTranscript = ""; // Phase 8: Accumulate finals across Deepgram utterances
  let confidence = 0;
  let currentState: "listening" | "triggered" | "streaming" | "speaking" | "cooldown" | "vad_cooldown" = "listening";

  // Timing
  let lastTokenTime = Date.now();
  let lastTranscriptChangeTime = Date.now();
  let silenceStartTime = 0;
  let isSilent = false;

  // Speech detection (RMS-based)
  let rmsAboveThreshold = false;
  let speechStartTime = 0;
  let lastSpeechTime = Date.now();
  let wasSpeaking = false;

  // VAD state
  let vadSpeechActive = false;
  let lastVADTime = 0;
  let vadProbability = 0; // Continuous 0-1 probability for nuanced decisions

  // Timers
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  let gracePeriodTimer: ReturnType<typeof setTimeout> | null = null;

  // Flag to prevent double commits
  let hasCommitted = false;

  // ML Turn Detection state
  let lastPrediction: TurnPrediction | null = null;
  let pendingPrediction: Promise<TurnPrediction | null> | null = null;

  const log = (...args: unknown[]) => {
    if (cfg.debug) console.log("[TurnManager]", ...args);
  };

  /**
   * Check if transcript ends with terminal punctuation
   */
  const endsWithPunctuation = (text: string): boolean => {
    return /[.!?。？！]$/.test(text.trim());
  };

  /**
   * Build TurnContext for ML detector
   */
  const buildTurnContext = (): TurnContext => {
    const now = Date.now();
    return {
      transcript,
      utteranceDurationMs: now - speechStartTime,
      sttConfidence: confidence,
      isFinal: true, // Only called on final transcripts
      speechFinal: false, // Updated separately
      vadProbability,
      silenceDurationMs: isSilent ? now - silenceStartTime : 0,
      transcriptStableMs: now - lastTranscriptChangeTime,
      locale: cfg.locale || "fr",
    };
  };

  /**
   * Get ML prediction (async, with caching)
   */
  const getMlPrediction = async (): Promise<TurnPrediction | null> => {
    if (!cfg.turnDetector) return null;

    try {
      const context = buildTurnContext();
      const prediction = await cfg.turnDetector.predict(context);
      lastPrediction = prediction;
      return prediction;
    } catch (error) {
      log("ML prediction error:", error);
      return null;
    }
  };

  /**
   * Combine heuristic and ML signals with weighted voting
   */
  const combineSignals = (
    heuristicCommit: boolean,
    heuristicConfidence: number,
    mlPrediction: TurnPrediction | null
  ): boolean => {
    // If no ML prediction, use heuristic only
    if (!mlPrediction) {
      return heuristicCommit;
    }

    const mlWeight = cfg.mlWeight ?? 0.6;
    const heuristicWeight = 1 - mlWeight;

    // Weighted voting
    const mlScore = mlPrediction.shouldCommit
      ? mlPrediction.confidence * mlWeight
      : (1 - mlPrediction.confidence) * mlWeight;

    const heuristicScore = heuristicCommit
      ? heuristicConfidence * heuristicWeight
      : (1 - heuristicConfidence) * heuristicWeight;

    const totalCommitScore = (mlPrediction.shouldCommit ? mlScore : 0) +
      (heuristicCommit ? heuristicScore : 0);

    log("Signal combination:", {
      mlPrediction: mlPrediction.shouldCommit,
      mlConfidence: mlPrediction.confidence,
      mlReason: mlPrediction.reason,
      heuristicCommit,
      heuristicConfidence,
      totalCommitScore,
      threshold: 0.5,
    });

    // Special handling for backchannel detection
    if (mlPrediction.reason === "backchannel" && mlPrediction.confidence > 0.8) {
      log("Backchannel detected by ML - blocking commit");
      return false;
    }

    return totalCommitScore > 0.5;
  };

  /**
   * Evaluate if we should commit the turn
   * Multi-factor heuristic combining time, audio, linguistic signals, and ML prediction
   */
  const evaluateCommit = (): boolean => {
    if (hasCommitted) return false;
    if (!transcript.trim()) return false;

    // Never commit during streaming - Claude is actively responding
    if (currentState === "streaming") return false;

    const now = Date.now();

    // Time since last token (transcript update)
    const timeSinceLastToken = now - lastTokenTime;

    // Time since transcript content changed
    const transcriptStable = now - lastTranscriptChangeTime;

    // Silence duration (RMS below threshold)
    const silenceDuration = isSilent ? now - silenceStartTime : 0;

    // Linguistic signal: ends with sentence-final punctuation
    const hasPunctuation = endsWithPunctuation(transcript);

    // Semantic completion: check for patterns like "merci", "voilà", "s'il te plaît"
    const semanticComplete = isLikelyComplete(transcript, cfg.locale || "fr");

    // VAD probability check: if voice activity is high, user might still be speaking
    const vadActive = vadProbability > cfg.vadProbabilityThreshold;

    log("Evaluating commit:", {
      timeSinceLastToken,
      transcriptStable,
      silenceDuration,
      hasPunctuation,
      semanticComplete,
      confidence,
      vadProbability,
      vadActive,
      state: currentState,
      hasMLDetector: !!cfg.turnDetector,
    });

    // Calculate heuristic decision
    let heuristicCommit = false;
    let heuristicConfidence = 0.5;

    // Fast path: Semantic completion patterns trigger faster (Phase 4)
    // DISABLED Phase 6: This was triggering too fast, causing interruptions
    // Now requires full stability time + low VAD for longer
    if (semanticComplete && !vadActive && transcriptStable > cfg.stabilityThresholdMs && timeSinceLastToken > cfg.silenceThresholdMs) {
      log("Semantic completion detected (conservative)");
      heuristicCommit = true;
      heuristicConfidence = 0.9;
    }
    // If VAD shows active speech, be more conservative about committing
    else if (vadActive) {
      // Only commit if we have very strong signals despite VAD activity
      heuristicCommit = (
        timeSinceLastToken > cfg.maxSilenceMs &&
        transcriptStable > cfg.stabilityThresholdMs * 2 &&
        hasPunctuation
      );
      heuristicConfidence = heuristicCommit ? 0.8 : 0.3;
    }
    // During "triggered" state, we're more lenient
    else if (currentState === "triggered") {
      heuristicCommit = (
        timeSinceLastToken > cfg.silenceThresholdMs * 1.5 &&
        transcriptStable > cfg.stabilityThresholdMs &&
        (hasPunctuation || silenceDuration > cfg.maxSilenceMs)
      );
      heuristicConfidence = heuristicCommit ? 0.75 : 0.4;
    }
    // Standard evaluation for "listening" state
    else {
      const lowVADBonus = vadProbability < 0.2 ? 0.7 : 1.0;
      heuristicCommit = (
        timeSinceLastToken > cfg.silenceThresholdMs * lowVADBonus &&
        transcriptStable > cfg.stabilityThresholdMs * lowVADBonus &&
        (hasPunctuation || silenceDuration > cfg.maxSilenceMs * lowVADBonus)
      );
      heuristicConfidence = heuristicCommit ? 0.75 : 0.4;
    }

    // If we have an ML turn detector, combine signals
    // Note: We use cached lastPrediction for sync evaluation
    // ML prediction is updated asynchronously
    if (cfg.turnDetector && lastPrediction) {
      return combineSignals(heuristicCommit, heuristicConfidence, lastPrediction);
    }

    return heuristicCommit;
  };

  /**
   * Schedule a commit check
   */
  const scheduleCommitCheck = (delayMs: number) => {
    if (commitTimer) clearTimeout(commitTimer);

    commitTimer = setTimeout(() => {
      if (evaluateCommit()) {
        doCommit();
      }
    }, delayMs);
  };

  /**
   * Execute the commit (user turn complete)
   */
  const doCommit = () => {
    if (hasCommitted) return;
    hasCommitted = true;

    // Security: Don't log transcript content - only metadata
    log("Committing turn:", { length: transcript.length, confidence });

    // Clear timers
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (gracePeriodTimer) {
      clearTimeout(gracePeriodTimer);
      gracePeriodTimer = null;
    }

    cfg.onTurnComplete(transcript, confidence);
  };

  /**
   * Cancel any pending commit (user resumed speaking)
   */
  const cancelPendingCommit = () => {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
      log("Cancelled pending commit");
    }
    if (gracePeriodTimer) {
      clearTimeout(gracePeriodTimer);
      gracePeriodTimer = null;
    }
  };

  /**
   * Update speech activity state
   */
  const updateSpeechActivity = () => {
    const now = Date.now();
    let speaking = false;

    // RMS-based detection with hysteresis
    if (rmsAboveThreshold) {
      const duration = now - speechStartTime;
      speaking = duration >= cfg.speechHysteresisMs;
    } else {
      // Hangover: stay "speaking" briefly after RMS drops
      const timeSinceSpeech = now - lastSpeechTime;
      speaking = timeSinceSpeech < cfg.speechHangoverMs;
    }

    // Also consider VAD events
    if (vadSpeechActive) {
      const timeSinceVAD = now - lastVADTime;
      if (timeSinceVAD < 500) {
        speaking = true;
      }
    }

    // Notify if changed
    if (speaking !== wasSpeaking) {
      wasSpeaking = speaking;
      cfg.onSpeechActivity(speaking);
    }
  };

  return {
    handleTranscript(
      text: string,
      isFinal: boolean,
      speechFinal: boolean,
      conf: number
    ): void {
      const now = Date.now();

      // Update timing
      lastTokenTime = now;

      // Track transcript changes
      if (text !== lastTranscript) {
        lastTranscriptChangeTime = now;
        lastTranscript = text;
      }

      // Update state
      if (isFinal) {
        // Phase 8: Accumulate finals across Deepgram utterances
        // Deepgram splits long speech into multiple utterances when there are pauses.
        // Each utterance gets its own final, which would normally overwrite the previous.
        // We detect "new utterance" by checking if text doesn't start with existing accumulated text.
        const trimmedNew = text.trim();
        const trimmedAccumulated = accumulatedFinalTranscript.trim();

        if (trimmedAccumulated && !trimmedNew.startsWith(trimmedAccumulated.substring(0, 10))) {
          // New utterance detected (doesn't continue from previous) - accumulate
          accumulatedFinalTranscript = `${trimmedAccumulated} ${trimmedNew}`;
          // Security: Don't log transcript content
          log("Accumulated transcript (new utterance), length:", accumulatedFinalTranscript.length);
        } else {
          // Same utterance or first one - just update
          accumulatedFinalTranscript = trimmedNew;
        }

        transcript = accumulatedFinalTranscript;
        confidence = conf;
      }

      // Security: Don't log transcript content - only metadata
      log("Transcript:", {
        length: text.length,
        isFinal,
        speechFinal,
        conf,
      });

      // Cancel pending commits on new speech
      if (!isFinal) {
        cancelPendingCommit();
        hasCommitted = false; // Allow new commits
      }

      // Handle speechFinal with grace period
      if (speechFinal && isFinal) {
        log("speechFinal detected, scheduling grace period");

        if (gracePeriodTimer) clearTimeout(gracePeriodTimer);

        gracePeriodTimer = setTimeout(() => {
          gracePeriodTimer = null;
          if (evaluateCommit()) {
            doCommit();
          }
        }, cfg.gracePeriodMs);
      }

      // Schedule commit check if final transcript
      if (isFinal) {
        // Request ML prediction asynchronously (non-blocking)
        if (cfg.turnDetector && !pendingPrediction) {
          pendingPrediction = getMlPrediction().finally(() => {
            pendingPrediction = null;
          });
        }

        scheduleCommitCheck(cfg.silenceThresholdMs);
      }
    },

    handleRMS(level: number): void {
      const now = Date.now();
      const wasAbove = rmsAboveThreshold;

      rmsAboveThreshold = level > cfg.rmsThreshold;

      // Track transitions
      if (rmsAboveThreshold && !wasAbove) {
        // Started speaking
        speechStartTime = now;
        isSilent = false;

        // Cancel pending commit if user resumes speaking
        if (currentState === "listening") {
          cancelPendingCommit();
          hasCommitted = false;
        }
      } else if (!rmsAboveThreshold && wasAbove) {
        // Stopped speaking
        lastSpeechTime = now;
        silenceStartTime = now;
        isSilent = true;
      }

      updateSpeechActivity();
    },

    handleVADEvent(event: "started" | "ended"): void {
      const now = Date.now();
      lastVADTime = now;

      if (event === "started") {
        vadSpeechActive = true;

        // Barge-in detection during TTS (speaking OR cooldown edge case)
        if (currentState === "speaking" || currentState === "cooldown") {
          log("Barge-in detected in state:", currentState);
          cfg.onBargeIn();
        }

        // Cancel pending commit during listening
        if (currentState === "listening") {
          cancelPendingCommit();
          hasCommitted = false;
        }
      } else {
        vadSpeechActive = false;
      }

      updateSpeechActivity();
    },

    handleVADProbability(probability: number): void {
      vadProbability = Math.max(0, Math.min(1, probability)); // Clamp 0-1

      // If probability suddenly spikes, cancel pending commit
      if (probability > cfg.vadProbabilityThreshold && currentState === "listening") {
        cancelPendingCommit();
        hasCommitted = false;
      }

      // Log significant changes
      if (cfg.debug && Math.abs(probability - vadProbability) > 0.3) {
        log("VAD probability:", probability.toFixed(2));
      }
    },

    setState(state: "listening" | "triggered" | "streaming" | "speaking" | "cooldown" | "vad_cooldown"): void {
      const prevState = currentState;
      currentState = state;

      log("State:", prevState, "→", state);

      // Reset commit flag when entering listening
      if (state === "listening") {
        hasCommitted = false;
      }

      // Cancel pending commits when entering speaking/cooldown/vad_cooldown
      if (state === "speaking" || state === "cooldown" || state === "vad_cooldown") {
        cancelPendingCommit();
      }
    },

    getTranscript(): string {
      return transcript;
    },

    getVADProbability(): number {
      return vadProbability;
    },

    isSpeaking(): boolean {
      const now = Date.now();

      // RMS-based with hysteresis
      if (rmsAboveThreshold) {
        const duration = now - speechStartTime;
        return duration >= cfg.speechHysteresisMs;
      }

      // Hangover
      const timeSinceSpeech = now - lastSpeechTime;
      return timeSinceSpeech < cfg.speechHangoverMs;
    },

    addCompletedTurn(turn: ConversationTurn): void {
      if (cfg.turnDetector) {
        cfg.turnDetector.addTurn(turn);
        // Security: Don't log turn content - only metadata
        log("Added turn to detector history:", turn.role, "length:", turn.text.length);
      }
    },

    getLastPrediction(): TurnPrediction | null {
      return lastPrediction;
    },

    reset(): void {
      transcript = "";
      lastTranscript = "";
      accumulatedFinalTranscript = ""; // Phase 8: Clear accumulated transcript
      confidence = 0;
      hasCommitted = false;

      lastTokenTime = Date.now();
      lastTranscriptChangeTime = Date.now();
      silenceStartTime = 0;
      isSilent = false;

      rmsAboveThreshold = false;
      speechStartTime = 0;
      lastSpeechTime = Date.now();
      wasSpeaking = false;

      vadSpeechActive = false;
      lastVADTime = 0;
      vadProbability = 0;

      // Reset ML state
      lastPrediction = null;
      pendingPrediction = null;

      cancelPendingCommit();

      log("Reset");
    },

    setTurnDetector(detector: TurnDetectorProvider | null): void {
      cfg.turnDetector = detector ?? undefined;
      log("TurnDetector set:", detector ? detector.name : "none");
    },

    destroy(): void {
      cancelPendingCommit();
      // Cleanup turn detector if available
      if (cfg.turnDetector) {
        cfg.turnDetector.reset();
      }
      log("Destroyed");
    },
  };
}
