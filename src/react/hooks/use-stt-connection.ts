"use client";

/**
 * STT Connection Hook
 * Manages Speech-to-Text WebSocket connection with exponential backoff reconnection
 *
 * Uses the DeepgramStreamingAdapter from the SDK adapters layer.
 */

import { useCallback, useRef } from "react";
import {
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  type DeepgramStreamingAdapter,
} from "../../adapters/stt";
import type { TranscriptionResult } from "../../ports/stt";

// Exponential backoff sequence for reconnection
const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000, 30000];
const MAX_RECONNECT_ATTEMPTS = BACKOFF_SEQUENCE_MS.length;

/**
 * Callbacks for STT events
 */
export interface STTCallbacks {
  onReady: () => void;
  onInterim: (result: TranscriptionResult) => void;
  onFinal: (result: TranscriptionResult) => void;
  onUtteranceEnd: () => void;
  onSpeechStarted: () => void;
  onError: (error: Error) => void;
}

interface UseSTTConnectionOptions {
  /** User ID for session tracking */
  userId?: string;
  /** VoiceKit API key (vk_xxx) - required if not using getAuthToken */
  apiKey?: string;
  /** API base URL override */
  baseUrl?: string;
  /** Auth token provider for self-hosted setups (alternative to apiKey) */
  getAuthToken?: () => Promise<string>;
  debug?: boolean;
}

export interface UseSTTConnectionReturn {
  // Ref for external access
  sttRef: React.MutableRefObject<DeepgramStreamingAdapter | null>;

  // Connection management
  connect: (
    callbacks: STTCallbacks,
    language?: "multi" | "fr" | "en"
  ) => Promise<void>;
  reconnect: (
    callbacks: STTCallbacks,
    language?: "multi" | "fr" | "en"
  ) => Promise<void>;
  reconnectWithBackoff: (
    callbacks: STTCallbacks,
    language?: "multi" | "fr" | "en"
  ) => Promise<boolean>;
  disconnect: () => void;

  // Audio streaming
  sendAudio: (data: ArrayBuffer) => void;

  // Status
  isConnected: () => boolean;
  isStreaming: () => boolean;
}

export function useSTTConnection(
  options: UseSTTConnectionOptions = {}
): UseSTTConnectionReturn {
  const { userId = "anonymous", apiKey, baseUrl, getAuthToken, debug = false } = options;

  const sttRef = useRef<DeepgramStreamingAdapter | null>(null);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[stt-connection]", ...args);
    },
    [debug]
  );

  /**
   * Disconnect and cleanup STT adapter
   */
  const disconnect = useCallback(() => {
    if (sttRef.current) {
      log("Disconnecting STT");
      sttRef.current.close();
      sttRef.current = null;
    }
  }, [log]);

  /**
   * Connect to STT service
   */
  const connect = useCallback(
    async (
      callbacks: STTCallbacks,
      language: "multi" | "fr" | "en" = "multi"
    ): Promise<void> => {
      // Cleanup existing connection
      disconnect();

      log("Connecting to STT...");

      // Create adapter based on auth method
      let adapter: DeepgramStreamingAdapter;
      if (getAuthToken) {
        // Custom auth token provider (for KOND app with Stack Auth)
        adapter = createDeepgramAdapterWithAuth(getAuthToken, { baseUrl }, userId);
      } else if (apiKey) {
        // VoiceKit API key (for SDK users)
        adapter = createDeepgramAdapter({ apiKey, baseUrl }, userId);
      } else {
        throw new Error("Either apiKey or getAuthToken is required");
      }

      sttRef.current = adapter;

      await adapter.startStreaming(
        {
          onReady: () => {
            log("STT ready - forwarding to consumer");
            callbacks.onReady();
          },
          onInterim: (result) => {
            callbacks.onInterim(result);
          },
          onFinal: (result) => {
            callbacks.onFinal(result);
          },
          onUtteranceEnd: () => {
            log("UtteranceEnd - forwarding to consumer");
            callbacks.onUtteranceEnd();
          },
          onSpeechStarted: () => {
            callbacks.onSpeechStarted();
          },
          onError: (err) => {
            log("STT error:", err.message);
            callbacks.onError(err);
          },
        },
        language
      );
    },
    [userId, getAuthToken, disconnect, log]
  );

  /**
   * Reconnect if connection was closed
   */
  const reconnect = useCallback(
    async (
      callbacks: STTCallbacks,
      language: "multi" | "fr" | "en" = "multi"
    ): Promise<void> => {
      const isCurrentlyStreaming = sttRef.current?.isStreaming();
      log("Reconnect check - isStreaming:", isCurrentlyStreaming);

      if (!isCurrentlyStreaming) {
        log("Connection closed, reconnecting...");
        await connect(callbacks, language);
      }
    },
    [connect, log]
  );

  /**
   * Reconnect with exponential backoff
   * Retries connection with increasing delays: 1s, 2s, 4s, 8s, 30s
   * Returns true if reconnection succeeded, false if all retries failed
   */
  const reconnectWithBackoff = useCallback(
    async (
      callbacks: STTCallbacks,
      language: "multi" | "fr" | "en" = "multi"
    ): Promise<boolean> => {
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        try {
          log(`Reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS}...`);
          await connect(callbacks, language);
          log(`Reconnect succeeded on attempt ${attempt + 1}`);
          return true;
        } catch (err) {
          const delay = BACKOFF_SEQUENCE_MS[attempt];
          log(`Reconnect attempt ${attempt + 1} failed, retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      log("All reconnect attempts failed");
      callbacks.onError(new Error("Connection failed after max retries"));
      return false;
    },
    [connect, log]
  );

  /**
   * Send audio data to STT service
   */
  const sendAudio = useCallback((data: ArrayBuffer) => {
    if (sttRef.current?.isStreaming()) {
      sttRef.current.sendAudio(data);
    }
  }, []);

  /**
   * Check if adapter exists and has connection
   */
  const isConnected = useCallback((): boolean => {
    return sttRef.current !== null;
  }, []);

  /**
   * Check if actively streaming
   */
  const isStreaming = useCallback((): boolean => {
    return sttRef.current?.isStreaming() ?? false;
  }, []);

  return {
    sttRef,
    connect,
    reconnect,
    reconnectWithBackoff,
    disconnect,
    sendAudio,
    isConnected,
    isStreaming,
  };
}
