"use client";

/**
 * Voice Conversation Hook - Full-Featured Orchestrator
 * Composes sub-hooks for voice conversation functionality
 *
 * This hook provides KOND-level quality voice conversation with:
 * - 9 conversation states (idle, connecting, listening, vad_cooldown, triggered, streaming, processing, speaking, cooldown)
 * - 8 timeout types for robust conversation handling
 * - Barge-in detection with interruption context
 * - Backchannel detection (skip LLM for "ouais", "ok", etc.)
 * - Early LLM triggering for low latency
 * - ML-based turn detection (auto-selects based on device capability)
 *
 * Sub-hooks composed:
 * - useAudioSetup: MediaStream, AudioContext, AudioWorklet
 * - useSTTConnection: STT WebSocket with exponential backoff
 * - useVoiceTimeouts: All 8 timeout types
 * - useTurnCoordination: TurnManager wrapper
 * - useLlmIntegration: Early trigger + buffering (provider-agnostic)
 * - useSileroVAD: ML-based voice activity detection
 * - useTurnDetector: Auto-select heuristic/cloud/onnx
 *
 * @example
 * ```tsx
 * const voice = useVoiceConversation({
 *   locale: "fr",
 *   sendMessage: myLLM.generate,
 *   onUserMessage: (text) => addToChat(text),
 *   cancelTTS: () => stopTTS(),
 *   idleTimeoutMs: 60000,
 * });
 *
 * // 9 states available
 * // voice.state: "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown"
 *
 * // Interruption context for barge-in awareness
 * const ctx = voice.getInterruptionContext();
 * if (ctx) {
 *   // User interrupted, ctx contains partial response
 * }
 * ```
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  shouldTriggerEarly,
  isBackchannel,
  isLikelyIncomplete,
} from "../core/trigger-detector";
import { isVoiceConversationSupported, sleep } from "../core/utils/browser";
import {
  useAudioSetup,
  useSTTConnection,
  useVoiceTimeouts,
  useTurnCoordination,
  useLlmIntegration,
  useSileroVAD,
  useTurnDetector,
  type STTCallbacks,
} from "./hooks";
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_SESSION_MS,
  DEFAULT_SPEECH_FINAL_DELAY_MS,
  SPEECH_HYSTERESIS_MS,
} from "./types";
import type {
  UseVoiceConversationOptions,
  UseVoiceConversationReturn,
  InterruptionContext,
  AutoStopReason,
} from "./types";

// 9-state conversation FSM
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

export function useVoiceConversation(
  options: UseVoiceConversationOptions = {}
): UseVoiceConversationReturn {
  const {
    locale = "fr",
    userId = "anonymous",
    onUserMessage,
    sendMessage,
    onAutoStop,
    cancelTTS,
    onTTSStart,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxSessionMs = DEFAULT_MAX_SESSION_MS,
    speechFinalDelayMs = DEFAULT_SPEECH_FINAL_DELAY_MS,
    debug = false,
  } = options;

  // ==========================================================================
  // State
  // ==========================================================================
  const [state, setState] = useState<ConversationState>("idle");
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);

  // Refs for state access in callbacks
  const stateRef = useRef<ConversationState>("idle");
  const isActiveRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const lastInterimRef = useRef("");
  const streamingStartedRef = useRef(false);
  const speechStartedTimeRef = useRef(0);
  const maxUtteranceStartedRef = useRef(false);
  // Track the last user message sent to LLM (for interruption context)
  const lastUserMessageRef = useRef("");
  // Interruption context: stored when user interrupts, consumed on next message
  const interruptionContextRef = useRef<InterruptionContext | null>(null);

  const isSupported = isVoiceConversationSupported();

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[voice-conversation]", ...args);
    },
    [debug]
  );

  // Sync refs
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // ==========================================================================
  // Sub-hooks
  // ==========================================================================
  const audio = useAudioSetup({ debug });
  const stt = useSTTConnection({ userId, debug });
  const llm = useLlmIntegration({ sendMessage, debug });
  const sileroVAD = useSileroVAD({
    threshold: 0.5,
    silenceDuration: 700,
    minSpeechDuration: 250,
    debug,
  });

  // ML Turn Detector - auto-selects based on device capability
  const turnDetectorConfig = {
    type: "heuristic" as const, // Default to heuristic, can be configured
    locale: locale === "en" ? ("en" as const) : ("fr" as const),
    detectBackchannels: true,
    detectInterruptions: true,
  };
  const {
    getProvider: getTurnDetectorProvider,
    init: initTurnDetector,
    isReady: turnDetectorReady,
    activeType: turnDetectorActiveType,
  } = useTurnDetector(turnDetectorConfig);

  // Forward declarations for circular deps
  const commitResponseRef = useRef<() => Promise<void>>(async () => {
    // No-op until properly initialized
  });

  // Map locale to STT language code
  const sttLanguage = locale === "en" ? "en" : locale === "fr" ? "fr" : "multi";

  // Forward declarations for resumeListening
  const resumeListeningRef = useRef<() => Promise<void>>(async () => {});

  // Timeouts need callbacks that reference other hooks
  const timeouts = useVoiceTimeouts({
    idleTimeoutMs,
    maxSessionMs,
    speechFinalDelayMs,
    debug,
    onIdleTimeout: () => handleAutoStop("idle"),
    onMaxSessionTimeout: () => handleAutoStop("max_duration"),
    onSpeechFinalCommit: () => {
      // Clear silence timeout to prevent double commit
      timeouts.clearSilenceTimeout();
      setUserSpeaking(false);
      maxUtteranceStartedRef.current = false;
      commitResponseRef.current();
    },
    onTriggeredTimeout: () => commitResponseRef.current(),
    onSilenceTimeout: () => {
      if (
        isActiveRef.current &&
        stateRef.current !== "speaking" &&
        stateRef.current !== "cooldown"
      ) {
        // Clear speech final timeout to prevent double commit
        timeouts.cancelSpeechFinalCommit();
        setUserSpeaking(false);
        maxUtteranceStartedRef.current = false;
        commitResponseRef.current();
      }
    },
    onStreamingSafetyTimeout: () => {
      if (
        stateRef.current === "triggered" &&
        !streamingStartedRef.current &&
        isActiveRef.current
      ) {
        log("Safety timeout: no streaming after 30s");
        setState("listening");
        resumeListeningRef.current();
      }
    },
    onVADCooldownComplete: () => {
      if (stateRef.current !== "vad_cooldown") return;
      log("VAD cooldown complete - evaluating commit");
      // Use TurnManager's accumulated transcript for full utterance
      const text =
        turn.getTranscript() ||
        finalTranscriptRef.current ||
        lastInterimRef.current;

      if (!text.trim()) {
        log("No transcript, back to listening");
        setState("listening");
        return;
      }

      // Don't commit incomplete utterances - wait for more
      const localeKey = locale === "en" ? "en" : "fr";
      if (isLikelyIncomplete(text, localeKey)) {
        log(
          "Incomplete utterance detected:",
          text.substring(0, 30),
          "- waiting for more"
        );
        setState("listening");
        // Keep transcript for continuation
        return;
      }

      // Proceed to trigger LLM
      startLlmEarly(text);
    },
    // Max utterance timeout - prevents user from speaking indefinitely
    onMaxUtteranceTimeout: () => {
      log("Max utterance timeout (30s) - forcing commit");
      maxUtteranceStartedRef.current = false;
      // Use TurnManager's accumulated transcript
      const text =
        turn.getTranscript() ||
        finalTranscriptRef.current ||
        lastInterimRef.current;
      if (text.trim() && stateRef.current === "listening") {
        startLlmEarly(text);
      }
    },
  });

  // Turn coordination needs callbacks + ML turn detector
  const turn = useTurnCoordination({
    speechFinalDelayMs,
    debug,
    turnDetector: getTurnDetectorProvider(),
    onTurnComplete: (text) => {
      finalTranscriptRef.current = text;
      if (stateRef.current === "listening") {
        startLlmEarly(text);
      }
      timeouts.scheduleSpeechFinalCommit();
    },
    onBargeIn: handleBargeIn,
    onSpeechActivity: (speaking) => {
      setUserSpeaking(speaking);
      if (speaking) timeouts.resetIdleTimeout();
    },
  });

  // ==========================================================================
  // Core Logic
  // ==========================================================================

  const startLlmEarly = useCallback(
    async (text: string) => {
      if (stateRef.current === "triggered" || !sendMessage) return;
      log("Early trigger:", text.substring(0, 40));
      setState("triggered");

      // Store for interruption context (in case user interrupts)
      lastUserMessageRef.current = text;

      timeouts.startTriggeredTimeout();
      await llm.startLlmEarly(text);
    },
    [sendMessage, timeouts, llm, log]
  );

  const handleAutoStop = useCallback(
    (reason: AutoStopReason) => {
      log("Auto-stop:", reason);
      timeouts.clearAllTimeouts();
      turn.destroyTurnManager();
      llm.abortLlm();
      sileroVAD.stopVAD();
      stt.disconnect();
      audio.cleanupAudio();
      setUserSpeaking(false);
      setIsActive(false);
      setState("idle");
      setTranscript("");
      llm.clearBuffer();
      finalTranscriptRef.current = "";
      lastInterimRef.current = "";
      maxUtteranceStartedRef.current = false;
      onAutoStop?.(reason);
    },
    [timeouts, turn, llm, sileroVAD, stt, audio, onAutoStop, log]
  );

  function handleBargeIn() {
    // Accept speaking OR cooldown (edge case: user speaks during cooldown)
    if (stateRef.current === "speaking" || stateRef.current === "cooldown") {
      log("Barge-in detected in state:", stateRef.current);

      // Store interruption context BEFORE clearing anything
      // This will be passed to LLM with the next message
      const partialResponse = llm.getBufferedResponse();
      if (partialResponse && lastUserMessageRef.current) {
        interruptionContextRef.current = {
          partialResponse,
          userMessage: lastUserMessageRef.current,
          interruptedAt: Date.now(),
        };
        log("Stored interruption context:", {
          userMessage: lastUserMessageRef.current.substring(0, 30) + "...",
          partialResponse: partialResponse.substring(0, 50) + "...",
        });
      }

      // 1. Stop LLM stream (idempotent)
      llm.abortLlm();
      // 2. Stop TTS playback (via callback)
      cancelTTS?.();
      // 3. Return to listening state
      setState("listening");
      turn.syncState("listening");
    }
  }

  const resumeListening = useCallback(async () => {
    turn.resetTurnManager();
    await stt.reconnect(createSTTCallbacks(), sttLanguage);
  }, [turn, stt, sttLanguage]);

  // Update ref for use in timeout callbacks
  useEffect(() => {
    resumeListeningRef.current = resumeListening;
  }, [resumeListening]);

  const handleStreamingStart = useCallback(() => {
    if (stateRef.current === "triggered") {
      log("Streaming started");
      streamingStartedRef.current = true;
      timeouts.clearTriggeredTimeout();
      timeouts.clearStreamingSafetyTimeout();
      setState("streaming");
    }
  }, [timeouts, log]);

  // Called when TTS actually starts playing audio (activates barge-in detection)
  const handleTTSSpeakingStart = useCallback(() => {
    if (stateRef.current === "streaming") {
      log("TTS speaking started");
      setState("speaking");
      turn.syncState("speaking");
    }
  }, [turn, log]);

  const handleStreamingEnd = useCallback(async () => {
    log("Streaming end → cooldown");
    streamingStartedRef.current = false;
    maxUtteranceStartedRef.current = false;
    timeouts.clearMaxUtteranceTimeout();
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    setTranscript("");
    if (!isActiveRef.current) return;
    setState("cooldown");
    turn.syncState("cooldown");
    await sleep(cooldownMs);
    if (isActiveRef.current) {
      setState("listening");
      turn.syncState("listening");
      resumeListening();
    }
  }, [cooldownMs, llm, timeouts, turn, resumeListening, log]);

  // Commit response logic
  const commitResponse = useCallback(async () => {
    timeouts.clearTriggeredTimeout();
    timeouts.clearMaxUtteranceTimeout();
    maxUtteranceStartedRef.current = false;
    // Use TurnManager's accumulated transcript for full utterance
    const text =
      turn.getTranscript() ||
      finalTranscriptRef.current ||
      lastInterimRef.current;
    log("Commit:", text.substring(0, 40), "state:", stateRef.current);

    if (
      stateRef.current === "triggered" ||
      stateRef.current === "streaming"
    ) {
      if (stateRef.current === "triggered" && !streamingStartedRef.current) {
        timeouts.startStreamingSafetyTimeout();
      }
      return;
    }

    if (text) onUserMessage?.(text);
    if (!llm.hasBufferedResponse() && sendMessage && text) {
      setState("processing");
      try {
        await llm.startLlmEarly(text);
      } catch {
        if (isActiveRef.current) {
          setState("listening");
          resumeListening();
        }
        return;
      }
    }

    const response = llm.getBufferedResponse();
    if (!response?.trim()?.replace(/\.{2,}|…/g, "")?.trim()) {
      llm.clearBuffer();
      if (isActiveRef.current) {
        setState("listening");
        resumeListening();
      }
      return;
    }

    setState("cooldown");
    await sleep(cooldownMs);
    if (isActiveRef.current) {
      setState("listening");
      resumeListening();
    }
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    setTranscript("");
  }, [
    timeouts,
    sendMessage,
    llm,
    onUserMessage,
    cooldownMs,
    resumeListening,
    log,
    turn,
  ]);

  useEffect(() => {
    commitResponseRef.current = commitResponse;
  }, [commitResponse]);

  // Sync state to turn manager
  useEffect(() => {
    turn.syncState(state);
  }, [state, turn]);

  // ==========================================================================
  // STT Callbacks Factory
  // ==========================================================================
  function createSTTCallbacks(): STTCallbacks {
    return {
      onReady: () => {
        // State guard - only transition from "connecting"
        if (stateRef.current !== "connecting") {
          return; // Silently ignore - normal after reconnect
        }
        log("STT ready");
        setState("listening");
      },
      onInterim: (result) => {
        if (!isActiveRef.current) return;
        turn.feedTranscript(result.text, false, false, result.confidence);
        timeouts.cancelSpeechFinalCommit();
        setTranscript(result.text);
        lastInterimRef.current = result.text;

        // Start max utterance timeout on first transcript
        if (
          !maxUtteranceStartedRef.current &&
          stateRef.current === "listening"
        ) {
          maxUtteranceStartedRef.current = true;
          timeouts.startMaxUtteranceTimeout();
        }
      },
      onFinal: (result) => {
        if (!isActiveRef.current) return;
        turn.feedTranscript(
          result.text,
          true,
          result.speechFinal || false,
          result.confidence
        );
        setTranscript(result.text);
        finalTranscriptRef.current = result.text;
        timeouts.startSilenceTimeout();

        // Backchannel detection - skip LLM for acknowledgments
        const localeKey = locale === "en" ? "en" : "fr";
        if (
          result.speechFinal &&
          isBackchannel(result.text, result.confidence, localeKey)
        ) {
          log("Backchannel detected:", result.text, "- skipping LLM");
          // Reset for next turn without calling LLM
          turn.resetTurnManager();
          finalTranscriptRef.current = "";
          lastInterimRef.current = "";
          setTranscript("");
          return;
        }

        // speechFinal from VAD → enter cooldown to absorb noise
        if (result.speechFinal && stateRef.current === "listening") {
          log("VAD speech end → entering cooldown");
          setState("vad_cooldown");
          timeouts.startVADCooldownTimeout();
          return; // Don't trigger LLM yet, wait for cooldown
        }

        // Only trigger early if phrase looks complete AND user stopped speaking
        const localeForIncomplete = locale === "en" ? "en" : "fr";
        const vadProbFinal = sileroVAD.getSpeechProbability();
        // Require very low VAD probability before triggering on final transcript
        if (
          stateRef.current === "listening" &&
          result.text.trim() &&
          !isLikelyIncomplete(result.text, localeForIncomplete) &&
          vadProbFinal < 0.15
        ) {
          log("onFinal trigger with VAD:", vadProbFinal.toFixed(2));
          startLlmEarly(result.text);
        } else if (
          vadProbFinal >= 0.15 &&
          stateRef.current === "listening"
        ) {
          log("onFinal trigger blocked by VAD:", vadProbFinal.toFixed(2));
        }
        if (result.speechFinal) timeouts.scheduleSpeechFinalCommit();
      },
      onUtteranceEnd: () => {
        if (!isActiveRef.current) return;

        // UtteranceEnd no longer triggers LLM directly
        // Let TurnManager handle commit via scheduleSpeechFinalCommit() which
        // combines all signals (VAD, transcript stability, speechFinal)
        log("UtteranceEnd → delegating to TurnManager");
        timeouts.scheduleSpeechFinalCommit();
      },
      onSpeechStarted: () => {
        if (!isActiveRef.current) return;

        // ALWAYS forward VAD event to TurnManager - it's the single arbiter for barge-in
        turn.feedVADEvent("started");

        // Skip hysteresis logic during TTS playback (speaking/cooldown)
        // Barge-in is handled by TurnManager
        if (
          stateRef.current === "speaking" ||
          stateRef.current === "cooldown"
        ) {
          return;
        }

        const now = Date.now();
        if (now - speechStartedTimeRef.current < SPEECH_HYSTERESIS_MS) return;
        speechStartedTimeRef.current = now;

        // User resumed speaking during VAD cooldown → cancel and go back to listening
        if (stateRef.current === "vad_cooldown") {
          log("User resumed during VAD cooldown → back to listening");
          timeouts.clearVADCooldownTimeout();
          setState("listening");
          return;
        }

        if (stateRef.current === "listening") timeouts.cancelSpeechFinalCommit();
      },
      onError: (err) => {
        log("STT error:", err);
        setError(err.message);
        if (isActiveRef.current) {
          audio.cleanupAudio();
          stt.disconnect();
          setIsActive(false);
          setState("idle");
        }
      },
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================
  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Voice not supported");
      return;
    }
    log("Starting...");
    setError(null);
    setTranscript("");
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";

    // Initialize ML turn detector if configured (non-blocking)
    initTurnDetector()
      .then(() => {
        const provider = getTurnDetectorProvider();
        if (provider) {
          log("Turn detector ready, setting on TurnManager:", provider.name);
          turn.setTurnDetector(provider);
        }
      })
      .catch((err) => {
        log("Turn detector init failed (using heuristic fallback):", err);
      });

    turn.createTurnManager();
    setIsActive(true);
    setState("connecting");

    try {
      const { worklet, stream } = await audio.setupAudio();
      await stt.connect(createSTTCallbacks(), sttLanguage);

      // Start Silero VAD for ML-based speech detection
      // Falls back to RMS-only if Silero fails (WASM not supported, etc.)
      sileroVAD
        .startVAD(stream, {
          onSpeechProbability: (prob) => {
            // Feed Silero's ML-based probability to TurnManager
            turn.feedVADProbability(prob);
          },
          onSpeechStart: () => {
            turn.feedVADEvent("started");
          },
          onSpeechEnd: () => {
            turn.feedVADEvent("ended");
          },
          onError: (error) => {
            console.log(
              "%c[VAD] RMS FALLBACK ACTIVE (Silero failed: " +
                error.message +
                ")",
              "color: #f59e0b; font-weight: bold"
            );
            // RMS-based VAD continues via AudioWorklet
          },
        })
        .catch((error) => {
          console.log(
            "%c[VAD] RMS FALLBACK ACTIVE (Silero init failed)",
            "color: #f59e0b; font-weight: bold",
            error
          );
          // Fallback to RMS-only VAD (already running in AudioWorklet)
        });

      worklet.port.onmessage = (e) => {
        if (e.data.type !== "audio") return;

        // Feed RMS to TurnManager for speech detection
        turn.feedRMS(e.data.isSpeaking ? 0.05 : 0.001);

        // Feed continuous speech probability (0-1) for nuanced EOU decisions
        if (e.data.speechProbability !== undefined) {
          turn.feedVADProbability(e.data.speechProbability);
        }

        if (
          stateRef.current === "listening" ||
          stateRef.current === "triggered"
        ) {
          setUserSpeaking(e.data.isSpeaking);
          if (e.data.isSpeaking) timeouts.resetIdleTimeout();
          stt.sendAudio(e.data.data);
        }
      };

      timeouts.startIdleTimeout();
      timeouts.startMaxSessionTimeout();
      log("Started");
    } catch (err) {
      log("Start failed:", err);
      setError(err instanceof Error ? err.message : "Start failed");
      audio.cleanupAudio();
      stt.disconnect();
      setIsActive(false);
      setState("idle");
    }
  }, [
    isSupported,
    audio,
    stt,
    llm,
    turn,
    timeouts,
    log,
    sttLanguage,
    initTurnDetector,
    sileroVAD,
  ]);

  const stop = useCallback(() => {
    log("Stopping");
    timeouts.clearAllTimeouts();
    turn.destroyTurnManager();
    llm.abortLlm();
    sileroVAD.stopVAD();
    stt.disconnect();
    audio.cleanupAudio();
    setUserSpeaking(false);
    setIsActive(false);
    setState("idle");
    setTranscript("");
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    maxUtteranceStartedRef.current = false;
  }, [timeouts, turn, llm, sileroVAD, stt, audio, log]);

  const interrupt = useCallback(() => {
    log("Interrupt");
    llm.abortLlm();
    if (stateRef.current === "speaking") setState("listening");
  }, [llm, log]);

  // Cleanup - only on unmount (empty deps to avoid StrictMode double-cleanup race)
  const cleanupRef = useRef({
    timeouts,
    turn,
    llm,
    audio,
    stt,
    sileroVAD,
  });
  useEffect(() => {
    cleanupRef.current = { timeouts, turn, llm, audio, stt, sileroVAD };
  }, [timeouts, turn, llm, audio, stt, sileroVAD]);

  useEffect(
    () => () => {
      const {
        timeouts: t,
        turn: tu,
        llm: l,
        audio: a,
        stt: s,
        sileroVAD: sv,
      } = cleanupRef.current;
      t.clearAllTimeouts();
      tu.destroyTurnManager();
      l.abortLlm();
      sv.stopVAD();
      a.cleanupAudio();
      s.disconnect();
    },
    []
  ); // Empty deps - only cleanup on actual unmount

  // Interruption context accessors
  const getInterruptionContext = useCallback(() => {
    return interruptionContextRef.current;
  }, []);

  const clearInterruptionContext = useCallback(() => {
    interruptionContextRef.current = null;
    log("Cleared interruption context");
  }, [log]);

  return {
    state,
    isActive,
    isSupported,
    start,
    stop,
    interrupt,
    transcript,
    error,
    userSpeaking,
    handleStreamingStart,
    handleTTSSpeakingStart,
    handleStreamingEnd,
    // Interruption context (for barge-in awareness)
    getInterruptionContext,
    clearInterruptionContext,
  };
}
