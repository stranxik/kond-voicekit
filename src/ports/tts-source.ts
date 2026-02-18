/**
 * TTS Source Port - Abstract contract for fetching TTS audio data
 *
 * This port separates the I/O (fetching audio) from playback logic.
 * The core TTS playback module uses this port to get audio streams.
 *
 * This enables:
 * - Testing with mock audio data
 * - Swapping TTS providers (ElevenLabs, OpenAI, etc.)
 * - Server-side rendering compatibility
 */

import type { Locale } from "../types/config";

/**
 * Options for fetching TTS audio
 */
export interface TTSFetchOptions {
  /** Voice ID (provider-specific or preset name) */
  voice?: string;
  /** TTS model override */
  model?: string;
  /** Speech speed (0.5-1.5) */
  speed?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of a TTS fetch - either streaming or complete
 */
export interface TTSAudioResult {
  /** Audio content type (e.g., "audio/pcm", "audio/mp3") */
  contentType: string;
  /** Sample rate in Hz (e.g., 24000) */
  sampleRate: number;
  /** Number of channels (1 = mono, 2 = stereo) */
  channels: number;
  /** Bits per sample (e.g., 16) */
  bitsPerSample: number;
  /** Stream of audio chunks */
  stream: AsyncIterable<Uint8Array>;
}

/**
 * Port for fetching TTS audio data
 *
 * Implementation examples:
 * - HttpTTSSource: Fetches from a TTS API endpoint
 * - MockTTSSource: Returns pre-recorded audio for testing
 * - WebRTCTTSSource: Real-time TTS over WebRTC
 */
export interface TTSSourcePort {
  /**
   * Fetch TTS audio for the given text
   *
   * @param text - Text to synthesize
   * @param locale - Language locale
   * @param options - Additional options
   * @returns Audio result with stream of PCM chunks
   * @throws TTSError on failure
   */
  fetchAudio(
    text: string,
    locale: Locale,
    options?: TTSFetchOptions
  ): Promise<TTSAudioResult>;

  /**
   * Prefetch audio for later playback (optional optimization)
   * Returns a handle that can be passed to a player
   *
   * @param text - Text to synthesize
   * @param locale - Language locale
   * @param options - Additional options
   * @returns Promise of prefetched audio handle
   */
  prefetch?(
    text: string,
    locale: Locale,
    options?: TTSFetchOptions
  ): Promise<PrefetchedAudio>;

  /**
   * Cancel a prefetch operation
   */
  cancelPrefetch?(handle: PrefetchedAudio): void;
}

/**
 * Handle for prefetched audio
 */
export interface PrefetchedAudio {
  /** Unique ID for this prefetch */
  id: string;
  /** Whether prefetch is complete */
  isComplete: boolean;
  /** Total bytes fetched so far */
  totalBytes: number;
  /** Any error that occurred */
  error?: Error;
  /** Get the audio result (may block until prefetch complete) */
  getResult(): Promise<TTSAudioResult>;
}
