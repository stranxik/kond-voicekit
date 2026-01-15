"use client";

/**
 * Audio Setup Hook
 * Manages MediaStream, AudioContext, and AudioWorklet lifecycle
 *
 * Firefox compatibility: Firefox doesn't support automatic resampling between
 * MediaStream and AudioContext. We use the stream's native sample rate
 * and do resampling in the AudioWorklet.
 */

import { useCallback, useRef, useState } from "react";

interface AudioResources {
  stream: MediaStream;
  context: AudioContext;
  worklet: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
}

interface UseAudioSetupOptions {
  /** Path to audio worklet processor script (default: "/audio-processor.worklet.js") */
  workletPath?: string;
  /** Target sample rate for STT (default: 16000) */
  targetSampleRate?: number;
  debug?: boolean;
}

export interface UseAudioSetupReturn {
  // Refs for external access
  mediaStreamRef: React.MutableRefObject<MediaStream | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  workletNodeRef: React.MutableRefObject<AudioWorkletNode | null>;

  // Actions
  setupAudio: () => Promise<AudioResources>;
  cleanupAudio: () => void;

  // State
  isAudioActive: boolean;
  audioError: string | null;
}

export function useAudioSetup(
  options: UseAudioSetupOptions = {}
): UseAudioSetupReturn {
  const {
    workletPath = "/audio-processor.worklet.js",
    targetSampleRate = 16000,
    debug = false,
  } = options;

  // State
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[audio-setup]", ...args);
    },
    [debug]
  );

  /**
   * Cleanup all audio resources
   */
  const cleanupAudio = useCallback(() => {
    log("Cleaning up audio resources");

    // Stop worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: "stop" });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Stop media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsAudioActive(false);
    setAudioError(null);
  }, [log]);

  /**
   * Setup audio pipeline: microphone -> AudioWorklet -> ready for STT
   */
  const setupAudio = useCallback(async (): Promise<AudioResources> => {
    // Cleanup any existing resources first
    cleanupAudio();
    setAudioError(null);

    try {
      // 1. Create AudioContext FIRST without specifying sample rate
      // Let the browser use its default/native rate for Firefox compatibility
      log("Creating audio context...");
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Get the actual sample rate the browser chose
      const nativeSampleRate = audioContext.sampleRate;
      log(`AudioContext sample rate: ${nativeSampleRate}Hz`);

      // 2. Get microphone access (don't force sample rate)
      log("Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          // Don't specify sampleRate - browser will match AudioContext
        },
      });
      mediaStreamRef.current = stream;

      // 3. Load AudioWorklet module
      log("Loading audio worklet...");
      await audioContext.audioWorklet.addModule(workletPath);

      // 4. Create worklet node with target sample rate info
      // The worklet will handle downsampling to 16000 Hz for STT
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioContext,
        "audio-capture-processor",
        {
          processorOptions: {
            inputSampleRate: nativeSampleRate,
            outputSampleRate: targetSampleRate,
          },
        }
      );
      workletNodeRef.current = workletNode;

      // 5. Connect the pipeline
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsAudioActive(true);
      log("Audio setup complete");

      return {
        stream,
        context: audioContext,
        worklet: workletNode,
        source,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio setup failed";
      log("Audio setup error:", message);
      setAudioError(message);
      cleanupAudio();
      throw err;
    }
  }, [cleanupAudio, workletPath, targetSampleRate, log]);

  return {
    // Refs
    mediaStreamRef,
    audioContextRef,
    workletNodeRef,

    // Actions
    setupAudio,
    cleanupAudio,

    // State
    isAudioActive,
    audioError,
  };
}
