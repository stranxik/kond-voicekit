/**
 * TTS Queue - Progressive sentence-by-sentence TTS playback with PRE-FETCH
 *
 * Allows streaming text to start playing immediately as sentences complete,
 * instead of waiting for the entire response.
 *
 * PRE-FETCH OPTIMIZATION:
 * While current sentence plays, the next one is being fetched in background.
 * When current ends, next plays INSTANTLY (no network latency).
 *
 * Architecture:
 *   currentAudio → playing
 *   nextAudio    → preloaded (N+1 only, never more)
 *
 * Usage:
 * 1. Create queue: const queue = createTTSQueue("fr", onEnd, onError)
 * 2. Feed sentences as they arrive: queue.push("Salut.")
 * 3. Signal end of stream: queue.finish()
 * 4. Cancel if needed: queue.cancel()
 */

import {
  speakTextStreaming,
  stopStreamingTTS,
  prefetchAudio,
  playPreloadedAudio,
  cancelPrefetch,
  type PreloadedAudio,
} from "./tts-streaming";
import { sanitizeForTTS } from "./sanitize-for-tts";
import type { TtsModel } from "./tts-model-router";
import type { Locale } from "../types/config";

// Re-export sentence chunker functions and types for backward compatibility
export { extractSentences, createSentenceAccumulator } from "./sentence-chunker";
export type { SentenceAccumulator } from "./sentence-chunker";

/** Queue item with optional model override */
interface QueueItem {
  text: string;
  ttsModel?: TtsModel;
}

interface TTSQueueOptions {
  locale: Locale;
  /** ElevenLabs voice ID (optional, defaults to locale-based selection) */
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  debug?: boolean;
}

interface TTSQueue {
  /** Add a sentence to the queue with optional model override */
  push: (sentence: string, ttsModel?: TtsModel) => void;
  /** Signal that no more sentences will come */
  finish: () => void;
  /** Cancel playback and clear queue */
  cancel: () => void;
  /** Check if queue is active */
  isActive: () => boolean;
}

/**
 * Create a TTS queue for progressive playback with pre-fetching
 */
export function createTTSQueue(options: TTSQueueOptions): TTSQueue {
  const { locale, voice, onStart, onEnd, onError, debug = false } = options;

  // Queue state - now stores items with optional model
  const queue: QueueItem[] = [];
  let isPlaying = false;
  let isFinished = false;
  let isCancelled = false;
  let hasStarted = false;

  // Pre-fetch state (N+1, N+2, N+3 for parallel prefetch)
  let nextPreloaded: PreloadedAudio | null = null;
  let nextItem: QueueItem | null = null;
  let isPrefetching = false;

  // Phase 4: Extended prefetch for N+2, N+3
  const extendedPrefetchMap = new Map<string, PreloadedAudio>();
  const extendedPrefetchPending = new Set<string>();

  const log = (...args: unknown[]) => {
    if (debug) console.log("[TTS Queue]", ...args);
  };

  /**
   * Get next clean item from queue (sanitized, non-empty)
   */
  const getNextCleanItem = (): QueueItem | null => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const clean = sanitizeForTTS(item.text);
      if (clean && clean.trim().length > 0) {
        return { text: clean, ttsModel: item.ttsModel };
      }
      log("Skipping empty sentence");
    }
    return null;
  };

  /**
   * Start prefetching the next sentence in background
   * Phase 4: Now prefetches N+1 (primary) and N+2, N+3 (extended) in parallel
   */
  const startPrefetch = () => {
    // Guard: already prefetching N+1 or have prefetched
    if (isPrefetching || nextPreloaded || isCancelled) {
      // Even if N+1 is done, try extended prefetch
      startExtendedPrefetch();
      return;
    }

    const item = getNextCleanItem();
    if (!item) return;

    isPrefetching = true;
    nextItem = item;
    log("Prefetching N+1:", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");

    prefetchAudio(item.text, locale, item.ttsModel, voice)
      .then((preloaded) => {
        isPrefetching = false;
        if (isCancelled) {
          cancelPrefetch(preloaded);
          return;
        }
        nextPreloaded = preloaded;
        log("Prefetch N+1 ready:", item.text.substring(0, 40) + "...", `(${preloaded.totalBytes} bytes)`);

        // Phase 4: Start extended prefetch for N+2, N+3
        startExtendedPrefetch();
      })
      .catch((err) => {
        isPrefetching = false;
        log("Prefetch error:", err);
        // Don't fail - we'll fall back to normal fetch
      });
  };

  /**
   * Phase 4: Start prefetching N+2 and N+3 sentences in parallel
   * This runs after N+1 is done or in parallel during playback
   */
  const startExtendedPrefetch = () => {
    if (isCancelled) return;

    // Prefetch up to 2 additional sentences (N+2, N+3)
    const toFetch: QueueItem[] = [];
    for (let i = 0; i < Math.min(2, queue.length); i++) {
      const item = queue[i];
      const clean = sanitizeForTTS(item.text);
      if (clean && clean.trim().length > 0) {
        const key = `${clean}-${item.ttsModel || "default"}`;
        // Skip if already prefetched or pending
        if (!extendedPrefetchMap.has(key) && !extendedPrefetchPending.has(key)) {
          toFetch.push({ text: clean, ttsModel: item.ttsModel });
        }
      }
    }

    // Start parallel prefetches
    for (const item of toFetch) {
      const key = `${item.text}-${item.ttsModel || "default"}`;
      extendedPrefetchPending.add(key);
      log("Prefetching N+2/3:", item.text.substring(0, 30) + "...");

      prefetchAudio(item.text, locale, item.ttsModel, voice)
        .then((preloaded) => {
          extendedPrefetchPending.delete(key);
          if (isCancelled) {
            cancelPrefetch(preloaded);
            return;
          }
          extendedPrefetchMap.set(key, preloaded);
          log("Extended prefetch ready:", item.text.substring(0, 30) + "...");
        })
        .catch((err) => {
          extendedPrefetchPending.delete(key);
          log("Extended prefetch error:", err);
        });
    }
  };

  /**
   * Try to get a preloaded audio from extended prefetch cache
   */
  const getExtendedPrefetch = (item: QueueItem): PreloadedAudio | null => {
    const key = `${item.text}-${item.ttsModel || "default"}`;
    const preloaded = extendedPrefetchMap.get(key);
    if (preloaded) {
      extendedPrefetchMap.delete(key);
      return preloaded;
    }
    return null;
  };

  /**
   * Play preloaded audio and handle completion
   */
  const playPreloaded = async (preloaded: PreloadedAudio, item: QueueItem) => {
    isPlaying = true;
    log("Playing (preloaded):", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");

    // Notify start on first sentence
    if (!hasStarted) {
      hasStarted = true;
      onStart?.();
    }

    // Clear prefetch state before playing
    nextPreloaded = null;
    nextItem = null;

    // Start prefetching next while this plays
    startPrefetch();

    await playPreloadedAudio(
      preloaded,
      undefined, // onStart (already handled)
      () => {
        // onEnd
        isPlaying = false;
        if (!isCancelled) {
          processNext();
        }
      },
      (err) => {
        // onError
        isPlaying = false;
        log("Playback error:", err);
        if (!isCancelled) {
          onError?.(err);
          processNext();
        }
      }
    );
  };

  /**
   * Play sentence with normal streaming (no prefetch available)
   */
  const playStreaming = async (item: QueueItem) => {
    isPlaying = true;
    log("Playing (streaming):", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");

    // Notify start on first sentence
    if (!hasStarted) {
      hasStarted = true;
      onStart?.();
    }

    // Start prefetching next while this plays
    startPrefetch();

    try {
      await speakTextStreaming(
        item.text,
        locale,
        undefined, // onStart (already handled)
        () => {
          // onEnd
          isPlaying = false;
          if (!isCancelled) {
            processNext();
          }
        },
        (err) => {
          // onError
          isPlaying = false;
          log("Streaming error:", err);
          if (!isCancelled) {
            onError?.(err);
            processNext();
          }
        },
        item.ttsModel,
        voice
      );
    } catch (err) {
      isPlaying = false;
      log("Exception:", err);
      if (!isCancelled) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        processNext();
      }
    }
  };

  /**
   * Process the next sentence
   */
  const processNext = async () => {
    // Guard: cancelled or already playing
    if (isCancelled || isPlaying) return;

    // Option 1: Play N+1 preloaded audio (instant!)
    if (nextPreloaded && nextItem) {
      await playPreloaded(nextPreloaded, nextItem);
      return;
    }

    // RACE CONDITION FIX: If N+1 is being prefetched, wait for it
    // Don't skip to N+2/N+3 just because they finished first
    if (isPrefetching && nextItem) {
      log("Waiting for N+1 prefetch to complete...");
      setTimeout(() => {
        if (!isCancelled) processNext();
      }, 50);
      return;
    }

    // Option 2: Get next from queue (only if no N+1 in progress)
    const item = getNextCleanItem();
    if (item) {
      // Phase 4: Check extended prefetch cache first
      const extendedPreload = getExtendedPrefetch(item);
      if (extendedPreload) {
        log("Using extended prefetch for:", item.text.substring(0, 30) + "...");
        await playPreloaded(extendedPreload, item);
        return;
      }

      // Fall back to streaming if no prefetch available
      await playStreaming(item);
      return;
    }

    // No more sentences - check if done
    if (isFinished) {
      log("Queue complete");
      onEnd?.();
    }
  };

  return {
    push: (sentence: string, ttsModel?: TtsModel) => {
      if (isCancelled) return;

      // IMPORTANT: If push arrives after finish(), reactivate the queue
      // This handles race conditions where flush happens after finish()
      if (isFinished) {
        log("Push after finish - reactivating queue");
        isFinished = false;
      }

      log("Queued:", sentence.substring(0, 40) + "...", ttsModel ? `(${ttsModel})` : "");
      queue.push({ text: sentence, ttsModel });

      // Start processing if not already
      if (!isPlaying && !isPrefetching) {
        processNext();
      } else if (isPlaying && !nextPreloaded && !isPrefetching) {
        // Currently playing but no prefetch - start one
        startPrefetch();
      }
    },

    finish: () => {
      if (isCancelled) return;

      log("Stream finished, items remaining:", queue.length);
      isFinished = true;

      // If nothing playing and queue empty, signal end
      if (!isPlaying && queue.length === 0 && !nextPreloaded) {
        if (hasStarted) {
          onEnd?.();
        } else {
          log("Nothing to play");
          onEnd?.();
        }
      }
    },

    cancel: () => {
      log("Cancelled");
      isCancelled = true;
      queue.length = 0;

      // Cancel N+1 prefetch in progress
      if (nextPreloaded) {
        cancelPrefetch(nextPreloaded);
        nextPreloaded = null;
        nextItem = null;
      }

      // Phase 4: Cancel all extended prefetches
      for (const preloaded of extendedPrefetchMap.values()) {
        cancelPrefetch(preloaded);
      }
      extendedPrefetchMap.clear();
      extendedPrefetchPending.clear();

      stopStreamingTTS();
    },

    isActive: () => !isCancelled && (isPlaying || queue.length > 0 || nextPreloaded !== null || !isFinished),
  };
}
