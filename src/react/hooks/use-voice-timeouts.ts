"use client";

/**
 * Voice Timeouts Hook
 * Centralized management of all 8 timeout types for voice conversation
 *
 * Timeout types:
 * 1. Idle - auto-stop after inactivity
 * 2. Max Session - maximum conversation duration
 * 3. Speech Final - grace period after final transcript
 * 4. Triggered - max wait in triggered state
 * 5. Silence - fallback commit on silence
 * 6. Streaming Safety - recovery if streaming never starts
 * 7. VAD Cooldown - noise absorption after speech end
 * 8. Max Utterance - prevents indefinite speaking
 */

import { useCallback, useRef } from "react";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_SESSION_MS,
  DEFAULT_SPEECH_FINAL_DELAY_MS,
  TRIGGERED_TIMEOUT_MS,
  SILENCE_FALLBACK_MS,
  STREAMING_SAFETY_TIMEOUT_MS,
  VAD_COOLDOWN_MS,
  MAX_UTTERANCE_MS,
} from "../types";

interface UseVoiceTimeoutsOptions {
  idleTimeoutMs?: number;
  maxSessionMs?: number;
  speechFinalDelayMs?: number;
  debug?: boolean;
  /** Called when idle timeout fires */
  onIdleTimeout: () => void;
  /** Called when max session timeout fires */
  onMaxSessionTimeout: () => void;
  /** Called when speech final grace period expires */
  onSpeechFinalCommit: () => void;
  /** Called when triggered state times out */
  onTriggeredTimeout: () => void;
  /** Called when silence fallback fires */
  onSilenceTimeout: () => void;
  /** Called when streaming safety timeout fires */
  onStreamingSafetyTimeout: () => void;
  /** Called when VAD cooldown expires (noise absorption complete) */
  onVADCooldownComplete: () => void;
  /** Called when max utterance timeout fires (30s limit) */
  onMaxUtteranceTimeout: () => void;
}

export interface UseVoiceTimeoutsReturn {
  // Idle/session management
  startIdleTimeout: () => void;
  resetIdleTimeout: () => void;
  startMaxSessionTimeout: () => void;

  // Speech/commit management
  scheduleSpeechFinalCommit: () => void;
  cancelSpeechFinalCommit: () => void;

  // Triggered state management
  startTriggeredTimeout: () => void;
  clearTriggeredTimeout: () => void;

  // Silence fallback
  startSilenceTimeout: () => void;
  clearSilenceTimeout: () => void;

  // Streaming safety
  startStreamingSafetyTimeout: () => void;
  clearStreamingSafetyTimeout: () => void;

  // VAD cooldown (noise absorption)
  startVADCooldownTimeout: () => void;
  clearVADCooldownTimeout: () => void;

  // Max utterance (30s limit)
  startMaxUtteranceTimeout: () => void;
  clearMaxUtteranceTimeout: () => void;

  // Cleanup
  clearAllTimeouts: () => void;

  // Refs (for external access if needed)
  lastSpeechTimeRef: React.MutableRefObject<number>;
}

export function useVoiceTimeouts(
  options: UseVoiceTimeoutsOptions
): UseVoiceTimeoutsReturn {
  const {
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxSessionMs = DEFAULT_MAX_SESSION_MS,
    speechFinalDelayMs = DEFAULT_SPEECH_FINAL_DELAY_MS,
    debug = false,
    onIdleTimeout,
    onMaxSessionTimeout,
    onSpeechFinalCommit,
    onTriggeredTimeout,
    onSilenceTimeout,
    onStreamingSafetyTimeout,
    onVADCooldownComplete,
    onMaxUtteranceTimeout,
  } = options;

  // Timeout refs
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const speechFinalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const triggeredTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const vadCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const maxUtteranceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Track last speech time for idle detection
  const lastSpeechTimeRef = useRef<number>(Date.now());

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[voice-timeouts]", ...args);
    },
    [debug]
  );

  // ==========================================================================
  // Clear helpers
  // ==========================================================================

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearMaxSessionTimeout = useCallback(() => {
    if (maxSessionTimeoutRef.current) {
      clearTimeout(maxSessionTimeoutRef.current);
      maxSessionTimeoutRef.current = null;
    }
  }, []);

  const clearSpeechFinalTimeout = useCallback(() => {
    if (speechFinalTimeoutRef.current) {
      clearTimeout(speechFinalTimeoutRef.current);
      speechFinalTimeoutRef.current = null;
    }
  }, []);

  const clearTriggeredTimeout = useCallback(() => {
    if (triggeredTimeoutRef.current) {
      clearTimeout(triggeredTimeoutRef.current);
      triggeredTimeoutRef.current = null;
    }
  }, []);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const clearStreamingSafetyTimeout = useCallback(() => {
    if (streamingSafetyTimeoutRef.current) {
      clearTimeout(streamingSafetyTimeoutRef.current);
      streamingSafetyTimeoutRef.current = null;
    }
  }, []);

  const clearVADCooldownTimeout = useCallback(() => {
    if (vadCooldownTimeoutRef.current) {
      clearTimeout(vadCooldownTimeoutRef.current);
      vadCooldownTimeoutRef.current = null;
    }
  }, []);

  const clearMaxUtteranceTimeout = useCallback(() => {
    if (maxUtteranceTimeoutRef.current) {
      clearTimeout(maxUtteranceTimeoutRef.current);
      maxUtteranceTimeoutRef.current = null;
    }
  }, []);

  const clearAllTimeouts = useCallback(() => {
    clearIdleTimeout();
    clearMaxSessionTimeout();
    clearSpeechFinalTimeout();
    clearTriggeredTimeout();
    clearSilenceTimeout();
    clearStreamingSafetyTimeout();
    clearVADCooldownTimeout();
    clearMaxUtteranceTimeout();
    log("All timeouts cleared");
  }, [
    clearIdleTimeout,
    clearMaxSessionTimeout,
    clearSpeechFinalTimeout,
    clearTriggeredTimeout,
    clearSilenceTimeout,
    clearStreamingSafetyTimeout,
    clearVADCooldownTimeout,
    clearMaxUtteranceTimeout,
    log,
  ]);

  // ==========================================================================
  // Idle/Session management
  // ==========================================================================

  const startIdleTimeout = useCallback(() => {
    if (idleTimeoutMs <= 0) return;

    clearIdleTimeout();
    lastSpeechTimeRef.current = Date.now();

    idleTimeoutRef.current = setTimeout(() => {
      log(`Idle timeout (${idleTimeoutMs / 1000}s) - auto-stopping`);
      onIdleTimeout();
    }, idleTimeoutMs);
  }, [idleTimeoutMs, clearIdleTimeout, onIdleTimeout, log]);

  const resetIdleTimeout = useCallback(() => {
    lastSpeechTimeRef.current = Date.now();
    if (idleTimeoutMs > 0) {
      startIdleTimeout();
    }
  }, [idleTimeoutMs, startIdleTimeout]);

  const startMaxSessionTimeout = useCallback(() => {
    if (maxSessionMs <= 0) return;

    clearMaxSessionTimeout();

    maxSessionTimeoutRef.current = setTimeout(() => {
      log(`Max session timeout (${maxSessionMs / 1000}s) - auto-stopping`);
      onMaxSessionTimeout();
    }, maxSessionMs);
  }, [maxSessionMs, clearMaxSessionTimeout, onMaxSessionTimeout, log]);

  // ==========================================================================
  // Speech/Commit management
  // ==========================================================================

  const scheduleSpeechFinalCommit = useCallback(() => {
    clearSpeechFinalTimeout();

    log(`Scheduling commit in ${speechFinalDelayMs}ms (grace period)`);

    speechFinalTimeoutRef.current = setTimeout(() => {
      speechFinalTimeoutRef.current = null;
      log("Grace period expired - committing");
      onSpeechFinalCommit();
    }, speechFinalDelayMs);
  }, [speechFinalDelayMs, clearSpeechFinalTimeout, onSpeechFinalCommit, log]);

  const cancelSpeechFinalCommit = useCallback(() => {
    let cancelled = false;

    if (speechFinalTimeoutRef.current) {
      clearSpeechFinalTimeout();
      cancelled = true;
    }
    if (silenceTimeoutRef.current) {
      clearSilenceTimeout();
      cancelled = true;
    }

    if (cancelled) {
      log("Cancelled pending commits (user resumed speaking)");
    }
  }, [clearSpeechFinalTimeout, clearSilenceTimeout, log]);

  // ==========================================================================
  // Triggered state management
  // ==========================================================================

  const startTriggeredTimeout = useCallback(() => {
    clearTriggeredTimeout();

    triggeredTimeoutRef.current = setTimeout(() => {
      log(`Triggered timeout (${TRIGGERED_TIMEOUT_MS / 1000}s) - forcing commit`);
      onTriggeredTimeout();
    }, TRIGGERED_TIMEOUT_MS);
  }, [clearTriggeredTimeout, onTriggeredTimeout, log]);

  // ==========================================================================
  // Silence fallback
  // ==========================================================================

  const startSilenceTimeout = useCallback(() => {
    clearSilenceTimeout();

    silenceTimeoutRef.current = setTimeout(() => {
      log(`Silence timeout (${SILENCE_FALLBACK_MS / 1000}s) - committing`);
      onSilenceTimeout();
    }, SILENCE_FALLBACK_MS);
  }, [clearSilenceTimeout, onSilenceTimeout, log]);

  // ==========================================================================
  // Streaming safety
  // ==========================================================================

  const startStreamingSafetyTimeout = useCallback(() => {
    clearStreamingSafetyTimeout();

    streamingSafetyTimeoutRef.current = setTimeout(() => {
      log(
        `Streaming safety timeout (${STREAMING_SAFETY_TIMEOUT_MS / 1000}s) - recovering`
      );
      onStreamingSafetyTimeout();
    }, STREAMING_SAFETY_TIMEOUT_MS);
  }, [clearStreamingSafetyTimeout, onStreamingSafetyTimeout, log]);

  // ==========================================================================
  // VAD cooldown (noise absorption after speech end)
  // ==========================================================================

  const startVADCooldownTimeout = useCallback(() => {
    clearVADCooldownTimeout();

    vadCooldownTimeoutRef.current = setTimeout(() => {
      log(`VAD cooldown complete (${VAD_COOLDOWN_MS}ms) - evaluating`);
      onVADCooldownComplete();
    }, VAD_COOLDOWN_MS);
  }, [clearVADCooldownTimeout, onVADCooldownComplete, log]);

  // ==========================================================================
  // Max utterance timeout (prevents indefinite speaking)
  // ==========================================================================

  const startMaxUtteranceTimeout = useCallback(() => {
    clearMaxUtteranceTimeout();

    maxUtteranceTimeoutRef.current = setTimeout(() => {
      log(`Max utterance timeout (${MAX_UTTERANCE_MS / 1000}s) - forcing commit`);
      onMaxUtteranceTimeout();
    }, MAX_UTTERANCE_MS);
  }, [clearMaxUtteranceTimeout, onMaxUtteranceTimeout, log]);

  return {
    // Idle/session
    startIdleTimeout,
    resetIdleTimeout,
    startMaxSessionTimeout,

    // Speech/commit
    scheduleSpeechFinalCommit,
    cancelSpeechFinalCommit,

    // Triggered
    startTriggeredTimeout,
    clearTriggeredTimeout,

    // Silence
    startSilenceTimeout,
    clearSilenceTimeout,

    // Streaming safety
    startStreamingSafetyTimeout,
    clearStreamingSafetyTimeout,

    // VAD cooldown
    startVADCooldownTimeout,
    clearVADCooldownTimeout,

    // Max utterance
    startMaxUtteranceTimeout,
    clearMaxUtteranceTimeout,

    // Cleanup
    clearAllTimeouts,

    // Refs
    lastSpeechTimeRef,
  };
}
