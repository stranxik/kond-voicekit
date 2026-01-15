/**
 * TTS Provider Port - Abstract contract for text-to-speech
 *
 * This port defines the interface for any TTS implementation,
 * allowing the core voice module to remain decoupled from
 * specific TTS services (ElevenLabs, OpenAI, etc.)
 */

import type { Locale } from "../types/config";

export interface TTSProvider {
  /**
   * Synthesize text to speech and play the audio
   * @param text - The text to synthesize
   * @param locale - Language locale ("fr" or "en")
   * @returns Promise that resolves when playback starts (not when it ends)
   */
  synthesize(text: string, locale: Locale): Promise<void>;

  /**
   * Stop any currently playing audio
   */
  stop(): void;

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean;
}
