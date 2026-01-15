"use client";

/**
 * LLM Integration Hook
 * Manages early LLM triggering and response buffering
 *
 * Provider-agnostic: Works with any LLM (Claude, GPT-4, Gemini, Llama, etc.)
 * The user provides their own sendMessage callback to integrate their LLM of choice.
 */

import { useCallback, useRef } from "react";

interface UseLlmIntegrationOptions {
  sendMessage?: (text: string) => Promise<string>;
  debug?: boolean;
}

export interface UseLlmIntegrationReturn {
  // Refs for external access
  llmBufferRef: React.MutableRefObject<string>;
  llmAbortRef: React.MutableRefObject<AbortController | null>;

  // Actions
  startLlmEarly: (transcript: string) => Promise<void>;
  abortLlm: () => void;
  clearBuffer: () => void;

  // Status
  hasBufferedResponse: () => boolean;
  getBufferedResponse: () => string;
}

export function useLlmIntegration(
  options: UseLlmIntegrationOptions
): UseLlmIntegrationReturn {
  const { sendMessage, debug = false } = options;

  // Refs
  const llmBufferRef = useRef<string>("");
  const llmAbortRef = useRef<AbortController | null>(null);
  const isRequestingRef = useRef(false);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[llm-integration]", ...args);
    },
    [debug]
  );

  /**
   * Start LLM early when trigger is detected
   * Returns immediately - response is buffered in llmBufferRef
   */
  const startLlmEarly = useCallback(
    async (transcript: string): Promise<void> => {
      if (!sendMessage) {
        log("No sendMessage function provided");
        return;
      }

      if (isRequestingRef.current) {
        log("Already requesting LLM, skipping");
        return;
      }

      log("Starting LLM early with:", transcript.substring(0, 50) + "...");

      // Abort any existing request
      llmAbortRef.current?.abort();
      llmAbortRef.current = new AbortController();
      llmBufferRef.current = "";
      isRequestingRef.current = true;

      try {
        const response = await sendMessage(transcript);
        llmBufferRef.current = response;
        log("LLM response buffered:", response.substring(0, 50) + "...");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          log("LLM early error:", err);
        }
      } finally {
        isRequestingRef.current = false;
      }
    },
    [sendMessage, log]
  );

  /**
   * Abort any in-progress LLM request
   */
  const abortLlm = useCallback(() => {
    if (llmAbortRef.current) {
      log("Aborting LLM request");
      llmAbortRef.current.abort();
      llmAbortRef.current = null;
    }
    isRequestingRef.current = false;
  }, [log]);

  /**
   * Clear the buffered response
   */
  const clearBuffer = useCallback(() => {
    llmBufferRef.current = "";
  }, []);

  /**
   * Check if there's a buffered response ready
   */
  const hasBufferedResponse = useCallback((): boolean => {
    return llmBufferRef.current.length > 0;
  }, []);

  /**
   * Get the buffered response
   */
  const getBufferedResponse = useCallback((): string => {
    return llmBufferRef.current;
  }, []);

  return {
    llmBufferRef,
    llmAbortRef,
    startLlmEarly,
    abortLlm,
    clearBuffer,
    hasBufferedResponse,
    getBufferedResponse,
  };
}
