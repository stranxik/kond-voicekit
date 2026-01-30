"use client";

/**
 * useVoiceKit - React hook for voice conversations
 *
 * Provides a simple API for integrating voice capabilities into React apps.
 *
 * @example
 * ```tsx
 * import { useVoiceKit } from "@kond.studio/voicekit/react";
 *
 * function VoiceChat() {
 *   const voice = useVoiceKit({
 *     locale: "fr",
 *     onTranscript: async (text) => {
 *       const response = await fetch("/api/chat", {
 *         method: "POST",
 *         body: JSON.stringify({ message: text }),
 *       }).then(r => r.json());
 *       voice.speak(response.reply);
 *       voice.finishSpeaking();
 *     },
 *   });
 *
 *   return (
 *     <button onClick={voice.isActive ? voice.stop : voice.start}>
 *       {voice.isActive ? "Stop" : "Start"} Voice
 *     </button>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { VoiceKit } from "../voicekit";
import type { VoiceKitConfig, ConversationState, VoiceKitError } from "../types/config";
import type { RecordingResult, RecordingState } from "../ports/recording";

export interface UseVoiceKitOptions extends Omit<VoiceKitConfig, "onTranscript" | "onStateChange" | "onError"> {
  /**
   * Called when user finishes speaking with the final transcript
   * This is where you integrate your LLM
   */
  onTranscript: (transcript: string) => void | Promise<void>;
}

export interface UseVoiceKitReturn {
  /** Current conversation state */
  state: ConversationState;
  /** Is voice active (listening, processing, or speaking) */
  isActive: boolean;
  /** Is TTS currently playing */
  isSpeaking: boolean;
  /** Start voice conversation */
  start: () => Promise<void>;
  /** Stop voice conversation */
  stop: () => void;
  /** Speak text using TTS */
  speak: (text: string) => void;
  /** Finish speaking (flush remaining text) */
  finishSpeaking: () => void;
  /** Interrupt current TTS playback */
  interrupt: () => void;
  /** Last error if any */
  error: VoiceKitError | null;

  // Recording API
  /** Is currently recording */
  isRecording: boolean;
  /** Current recording state */
  recordingState: RecordingState;
  /** Start recording the conversation */
  startRecording: () => Promise<void>;
  /** Stop recording and get the result */
  stopRecording: () => Promise<RecordingResult | null>;
  /** Pause recording */
  pauseRecording: () => void;
  /** Resume a paused recording */
  resumeRecording: () => void;
}

/**
 * React hook for voice conversations
 */
export function useVoiceKit(options: UseVoiceKitOptions): UseVoiceKitReturn {
  const [state, setState] = useState<ConversationState>("idle");
  const [error, setError] = useState<VoiceKitError | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");

  const voiceKitRef = useRef<VoiceKit | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Create VoiceKit instance when auth is available
  // Dependencies: apiKey OR (token + tokenWsUrl)
  const hasAuth = options.apiKey || (options.token && options.tokenWsUrl);

  useEffect(() => {
    // Don't create instance until we have auth
    if (!hasAuth) {
      console.warn(
        "[VoiceKit] Missing authentication. Provide either 'apiKey' or both 'token' and 'tokenWsUrl'. " +
        "Get your free API key at https://kond.studio/developers/voicekit/keys"
      );
      return;
    }

    const config: VoiceKitConfig = {
      ...optionsRef.current,
      onTranscript: (transcript) => optionsRef.current.onTranscript(transcript),
      onStateChange: (newState) => setState(newState),
      onError: (err) => setError(err),
      onBargeIn: () => {
        // Hook into barge-in if needed
      },
    };

    voiceKitRef.current = new VoiceKit(config);

    return () => {
      voiceKitRef.current?.destroy();
      voiceKitRef.current = null;
    };
  }, [hasAuth, options.apiKey, options.token, options.tokenWsUrl]); // Recreate when auth changes

  const start = useCallback(async () => {
    setError(null);
    try {
      await voiceKitRef.current?.start();
    } catch (err) {
      setError({
        code: "start_failed",
        message: err instanceof Error ? err.message : "Failed to start voice",
        details: err,
      });
    }
  }, []);

  const stop = useCallback(() => {
    voiceKitRef.current?.stop();
  }, []);

  const speak = useCallback((text: string) => {
    voiceKitRef.current?.speak(text);
  }, []);

  const finishSpeaking = useCallback(() => {
    voiceKitRef.current?.finishSpeaking();
  }, []);

  const interrupt = useCallback(() => {
    voiceKitRef.current?.interrupt();
  }, []);

  // Recording methods
  const startRecording = useCallback(async () => {
    try {
      await voiceKitRef.current?.startRecording();
      setIsRecording(true);
      setRecordingState("recording");
    } catch (err) {
      setError({
        code: "recording_start_failed",
        message: err instanceof Error ? err.message : "Failed to start recording",
        details: err,
      });
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    try {
      const result = await voiceKitRef.current?.stopRecording();
      setIsRecording(false);
      setRecordingState("idle");
      return result ?? null;
    } catch (err) {
      setError({
        code: "recording_stop_failed",
        message: err instanceof Error ? err.message : "Failed to stop recording",
        details: err,
      });
      return null;
    }
  }, []);

  const pauseRecording = useCallback(() => {
    voiceKitRef.current?.pauseRecording();
    setRecordingState("paused");
  }, []);

  const resumeRecording = useCallback(() => {
    voiceKitRef.current?.resumeRecording();
    setRecordingState("recording");
  }, []);

  return {
    state,
    isActive: state !== "idle",
    isSpeaking: state === "speaking",
    start,
    stop,
    speak,
    finishSpeaking,
    interrupt,
    error,
    // Recording
    isRecording,
    recordingState,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}

export default useVoiceKit;
