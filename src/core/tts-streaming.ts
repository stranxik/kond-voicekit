/**
 * Streaming TTS Client - PCM Real-time Playback
 * Uses Web Audio API for true chunk-by-chunk playback
 *
 * Server sends PCM 24kHz 16-bit signed little-endian mono
 * Client converts to Float32 and plays immediately
 *
 * Supports pre-fetching for seamless sentence transitions:
 * - prefetchAudio(): Fetch and buffer audio without playing
 * - playPreloadedAudio(): Play previously fetched audio instantly
 */

import type { TtsModel } from "./tts-model-router";
import type { Locale } from "../types/config";

// ============================================
// CONFIGURATION
// ============================================

/**
 * TTS Streaming configuration
 */
export interface TTSStreamingConfig {
  /** TTS stream endpoint URL (default: /api/voice/v1/tts/stream) */
  ttsStreamUrl: string;
  /** Optional callback for capturing audio chunks (for recording) */
  onAudioChunk?: (samples: Float32Array) => void;
}

let config: TTSStreamingConfig = {
  ttsStreamUrl: "/api/voice/v1/tts/stream",
};

/**
 * Configure TTS streaming endpoint
 * Call this before using any TTS functions to set your backend URL
 */
export function configureTTSStreaming(newConfig: Partial<TTSStreamingConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current TTS streaming config
 */
export function getTTSStreamingConfig(): TTSStreamingConfig {
  return { ...config };
}

// ============================================
// AUDIO PROCESSING
// ============================================

// Audio config matching server output
const SAMPLE_RATE = 24000;
const CHANNELS = 1;

// Streaming state
let audioContext: AudioContext | null = null;
let isStreamPlaying = false;
let shouldStopStream = false;

// Stream generation guard — incremented on each new stream to ignore stale chunks
let currentStreamId = 0;

/** Timeout for individual chunk reads (prevents hang on server stall) */
const CHUNK_READ_TIMEOUT_MS = 15_000;

function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number = CHUNK_READ_TIMEOUT_MS
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reader.cancel("Chunk read timeout").catch(() => {});
        reject(new Error(`TTS chunk read timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    reader.read().then(
      (result) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(result); }
      },
      (error) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
      }
    );
  });
}

// Playback scheduling
let nextPlayTime = 0;
let activeSourceNodes: AudioBufferSourceNode[] = [];

// Pre-fetch types
export interface PreloadedAudio {
  chunks: Uint8Array[];
  totalBytes: number;
  abortController: AbortController;
  isComplete: boolean;
  error?: Error;
}

// Buffer for incomplete samples (PCM is 2 bytes per sample)
let pendingBytes: Uint8Array | null = null;

/**
 * Initialize or get AudioContext with correct sample rate
 * Note: resume() is async but scheduling still works because audio is scheduled for future time
 */
function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
 */
function pcm16ToFloat32(pcmData: Uint8Array): Float32Array {
  // Each sample is 2 bytes (16-bit)
  const numSamples = Math.floor(pcmData.length / 2);
  const float32 = new Float32Array(numSamples);
  const dataView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);

  for (let i = 0; i < numSamples; i++) {
    // Read 16-bit signed little-endian
    const int16 = dataView.getInt16(i * 2, true);
    // Convert to float (-1 to 1)
    float32[i] = int16 / 32768;
  }

  return float32;
}

/**
 * Create AudioBuffer from Float32 samples
 */
function createAudioBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(CHANNELS, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/**
 * Schedule an audio buffer for playback
 */
function scheduleAudioBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
  if (shouldStopStream) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  // Schedule playback
  const currentTime = ctx.currentTime;
  if (nextPlayTime < currentTime) {
    nextPlayTime = currentTime;
  }

  const startTime = nextPlayTime;
  source.start(startTime);

  nextPlayTime += buffer.duration;

  // Track for cleanup
  activeSourceNodes.push(source);

  // Capture audio for recording (if callback configured)
  if (config.onAudioChunk) {
    const samples = buffer.getChannelData(0);
    config.onAudioChunk(new Float32Array(samples));
  }

  source.onended = () => {
    const index = activeSourceNodes.indexOf(source);
    if (index > -1) {
      activeSourceNodes.splice(index, 1);
    }
    source.disconnect();
  };
}

// Track total bytes for debugging
let totalBytesProcessed = 0;

/**
 * Process a PCM chunk and play it
 * @param streamId - The stream generation this chunk belongs to (ignore if stale)
 */
function processAndPlayChunk(ctx: AudioContext, chunk: Uint8Array, streamId?: number): void {
  // Guard: ignore chunks from a cancelled/previous stream
  if (shouldStopStream) return;
  if (streamId !== undefined && streamId !== currentStreamId) return;

  // Combine with any pending bytes from previous chunk
  let pcmData: Uint8Array;
  if (pendingBytes && pendingBytes.length > 0) {
    pcmData = new Uint8Array(pendingBytes.length + chunk.length);
    pcmData.set(pendingBytes, 0);
    pcmData.set(chunk, pendingBytes.length);
    pendingBytes = null;
  } else {
    pcmData = chunk;
  }

  // PCM 16-bit = 2 bytes per sample
  // Save any incomplete sample for next chunk
  const remainder = pcmData.length % 2;
  if (remainder > 0) {
    pendingBytes = pcmData.slice(-remainder);
    pcmData = pcmData.slice(0, -remainder);
  }

  // Skip if no complete samples
  if (pcmData.length < 2) return;

  totalBytesProcessed += pcmData.length;

  // Convert and play
  const float32 = pcm16ToFloat32(pcmData);
  const buffer = createAudioBuffer(ctx, float32);
  scheduleAudioBuffer(ctx, buffer);
}

/**
 * Stop streaming playback completely
 */
export function stopStreamingTTS(): void {
  shouldStopStream = true;
  isStreamPlaying = false;
  pendingBytes = null;
  totalBytesProcessed = 0; // Reset for next stream
  currentStreamId++; // Invalidate any in-flight chunks from previous stream

  // Stop all active source nodes
  for (const source of activeSourceNodes) {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Ignore errors from already stopped sources
    }
  }
  activeSourceNodes = [];
  nextPlayTime = 0;
}

/**
 * Check if streaming TTS is playing
 */
export function isStreamingTTSPlaying(): boolean {
  return isStreamPlaying;
}

/**
 * Wait for all scheduled audio to complete
 */
async function waitForPlaybackComplete(): Promise<void> {
  return new Promise((resolve) => {
    const checkComplete = () => {
      if (shouldStopStream || activeSourceNodes.length === 0) {
        resolve();
      } else {
        setTimeout(checkComplete, 50);
      }
    };
    checkComplete();
  });
}

/**
 * Speak text using real-time PCM streaming
 * Plays audio chunks as they arrive - no buffering delay
 *
 * @param ttsModel Optional TTS model override (defaults to server-side routing)
 * @param voice Optional ElevenLabs voice ID (defaults to locale-based selection)
 * @param ttsStreamUrl Optional explicit TTS endpoint URL (overrides global config)
 * @param apiKey Optional API key for authentication
 */
export async function speakTextStreaming(
  text: string,
  locale: Locale = "fr",
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: Error) => void,
  ttsModel?: TtsModel,
  voice?: string,
  ttsStreamUrl?: string,
  apiKey?: string
): Promise<void> {
  // Reset state
  stopStreamingTTS();
  shouldStopStream = false;
  isStreamPlaying = true;
  pendingBytes = null;
  const streamId = ++currentStreamId;

  const ctx = getAudioContext();

  // Use explicit URL if provided, otherwise fall back to global config
  const url = ttsStreamUrl || config.ttsStreamUrl;

  // Build headers with optional auth
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, locale, ttsModel, voice }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "TTS streaming failed");
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    let hasStarted = false;

    // Process chunks as they arrive - TRUE STREAMING
    while (true) {
      if (shouldStopStream || streamId !== currentStreamId) {
        reader.cancel();
        break;
      }

      const { done, value } = await readWithTimeout(reader);

      if (done) {
        break;
      }

      if (value && value.length > 0) {
        // Notify on first chunk
        if (!hasStarted) {
          hasStarted = true;
          console.log("[TTS] Streaming started");
          onStart?.();
        }

        // Play immediately (with streamId guard)
        processAndPlayChunk(ctx, value, streamId);
      }
    }

    // Wait for all audio to finish playing
    if (!shouldStopStream) {
      await waitForPlaybackComplete();
      onEnd?.();
    }
  } catch (error) {
    isStreamPlaying = false;
    onError?.(error instanceof Error ? error : new Error("Streaming TTS failed"));
  } finally {
    isStreamPlaying = false;
    pendingBytes = null;
  }
}

/**
 * Speak text with callback (wrapper for voice conversation)
 */
export function speakTextStreamingWithCallback(
  text: string,
  locale: Locale = "fr",
  onEnd: () => void,
  onError?: (error: Error) => void,
  ttsModel?: TtsModel,
  voice?: string,
  ttsStreamUrl?: string,
  apiKey?: string
): void {
  speakTextStreaming(text, locale, undefined, onEnd, onError, ttsModel, voice, ttsStreamUrl, apiKey).catch((err) => {
    onError?.(err instanceof Error ? err : new Error("Streaming TTS failed"));
  });
}

// ============================================
// PRE-FETCH API (for seamless sentence transitions)
// ============================================

/**
 * Pre-fetch audio without playing
 * Returns a PreloadedAudio object that can be played later with playPreloadedAudio()
 *
 * Usage:
 * 1. While current sentence plays: const next = await prefetchAudio("next sentence", "fr")
 * 2. When current ends: playPreloadedAudio(next, onEnd, onError)
 *
 * @param ttsModel Optional TTS model override (defaults to server-side routing)
 * @param voice Optional ElevenLabs voice ID (defaults to locale-based selection)
 * @param ttsStreamUrl Optional explicit TTS endpoint URL (overrides global config)
 * @param apiKey Optional API key for authentication
 */
export async function prefetchAudio(
  text: string,
  locale: Locale = "fr",
  ttsModel?: TtsModel,
  voice?: string,
  ttsStreamUrl?: string,
  apiKey?: string
): Promise<PreloadedAudio> {
  const abortController = new AbortController();
  const preloaded: PreloadedAudio = {
    chunks: [],
    totalBytes: 0,
    abortController,
    isComplete: false,
  };

  // Use explicit URL if provided, otherwise fall back to global config
  const url = ttsStreamUrl || config.ttsStreamUrl;

  // Build headers with optional auth
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, locale, ttsModel, voice }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "TTS prefetch failed");
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();

    // Collect all chunks without playing
    while (true) {
      if (abortController.signal.aborted) {
        reader.cancel();
        break;
      }

      const { done, value } = await readWithTimeout(reader);

      if (done) {
        preloaded.isComplete = true;
        break;
      }

      if (value && value.length > 0) {
        preloaded.chunks.push(value);
        preloaded.totalBytes += value.length;
      }
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      // Cancelled - not an error
      preloaded.isComplete = false;
    } else {
      preloaded.error = error instanceof Error ? error : new Error("Prefetch failed");
      preloaded.isComplete = true;
    }
  }

  return preloaded;
}

/**
 * Cancel a pre-fetch in progress
 */
export function cancelPrefetch(preloaded: PreloadedAudio): void {
  if (!preloaded.isComplete) {
    preloaded.abortController.abort();
  }
}

/**
 * Play pre-fetched audio instantly
 * Much faster than speakTextStreaming because audio is already buffered
 */
export async function playPreloadedAudio(
  preloaded: PreloadedAudio,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  // Check for errors
  if (preloaded.error) {
    onError?.(preloaded.error);
    return;
  }

  // Check for empty/incomplete
  if (preloaded.chunks.length === 0) {
    onEnd?.();
    return;
  }

  // Preloaded audio ready

  // Reset playback state
  stopStreamingTTS();
  shouldStopStream = false;
  isStreamPlaying = true;
  pendingBytes = null;
  const streamId = ++currentStreamId;

  const ctx = getAudioContext();

  try {
    onStart?.();

    // Play all buffered chunks immediately (with streamId guard)
    for (const chunk of preloaded.chunks) {
      if (shouldStopStream || streamId !== currentStreamId) break;
      processAndPlayChunk(ctx, chunk, streamId);
    }

    // Wait for all audio to finish
    if (!shouldStopStream) {
      await waitForPlaybackComplete();
      onEnd?.();
    }
  } catch (error) {
    isStreamPlaying = false;
    onError?.(error instanceof Error ? error : new Error("Preloaded playback failed"));
  } finally {
    isStreamPlaying = false;
    pendingBytes = null;
  }
}

/**
 * Check if preloaded audio is ready to play
 */
export function isPreloadedReady(preloaded: PreloadedAudio | null): boolean {
  if (!preloaded) return false;
  // Ready if complete (success or error) or if we have some chunks
  return preloaded.isComplete || preloaded.chunks.length > 0;
}

/**
 * DEBUG: Test AudioContext by playing a simple beep
 * Call from browser console: window.__testTTSBeep?.()
 */
export function testAudioContextBeep(): void {
  const ctx = getAudioContext();

  // Create a simple 440Hz sine wave (A4 note) for 0.5 seconds
  const duration = 0.5;
  const frequency = 440;
  const sampleRate = ctx.sampleRate;
  const samples = new Float32Array(Math.floor(duration * sampleRate));

  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.3 * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }

  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();

  source.onended = () => {
    // Test beep finished
  };
}

// Expose to window for debugging
if (typeof window !== "undefined") {
  (window as unknown as { __testTTSBeep: typeof testAudioContextBeep }).__testTTSBeep = testAudioContextBeep;
}
