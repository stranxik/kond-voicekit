/**
 * Fetch-based TTS Adapter
 *
 * Implements TTSProvider using a configurable TTS streaming endpoint
 * (e.g., ElevenLabs via internal API route)
 *
 * Uses Web Audio API to decode PCM audio (browsers can't play raw PCM with Audio element)
 */

import type { TTSProvider } from "../../ports/tts";
import type { Locale } from "../../types/config";

// =============================================================================
// Configuration (abstracted for SDK users)
// =============================================================================

export interface FetchTTSConfig {
  /** TTS stream URL (default: /api/voice/tts/stream) */
  ttsStreamUrl: string;
}

let globalConfig: FetchTTSConfig = {
  ttsStreamUrl: "/api/voice/tts/stream",
};

/**
 * Configure Fetch TTS adapter globally
 * Call this before creating adapters to set your backend URLs
 */
export function configureFetchTTS(config: Partial<FetchTTSConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current Fetch TTS config
 */
export function getFetchTTSConfig(): FetchTTSConfig {
  return { ...globalConfig };
}

// =============================================================================
// Adapter Implementation
// =============================================================================

// Audio config matching server output (PCM 24kHz 16-bit signed LE mono)
const SAMPLE_RATE = 24000;

export interface FetchTTSAdapterOptions {
  /** TTS stream URL (optional override) */
  ttsStreamUrl?: string;
}

export class FetchTTSAdapter implements TTSProvider {
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private isCurrentlyPlaying = false;
  private ttsStreamUrl: string;

  constructor(options: FetchTTSAdapterOptions = {}) {
    this.ttsStreamUrl = options.ttsStreamUrl || globalConfig.ttsStreamUrl;
  }

  /**
   * Get or create AudioContext with correct sample rate
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
   */
  private pcm16ToFloat32(pcmData: Uint8Array): Float32Array {
    const numSamples = Math.floor(pcmData.length / 2);
    const float32 = new Float32Array(numSamples);
    const dataView = new DataView(
      pcmData.buffer,
      pcmData.byteOffset,
      pcmData.byteLength
    );

    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      float32[i] = int16 / 32768;
    }

    return float32;
  }

  async synthesize(text: string, locale: Locale): Promise<void> {
    try {
      const response = await fetch(this.ttsStreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale }),
      });

      if (!response.ok) {
        if (response.status !== 0) {
          console.warn("[FetchTTSAdapter] TTS request failed:", response.status);
        }
        return;
      }

      // Get raw PCM data as ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return;
      }

      // Stop any current playback
      this.stop();

      // Convert PCM to Float32 and create AudioBuffer
      const ctx = this.getAudioContext();
      const pcmData = new Uint8Array(arrayBuffer);
      const float32 = this.pcm16ToFloat32(pcmData);

      const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(float32);

      // Create source and play
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      this.activeSource = source;
      this.isCurrentlyPlaying = true;

      source.onended = () => {
        this.isCurrentlyPlaying = false;
        this.activeSource = null;
      };

      source.start(0);
    } catch (error) {
      this.isCurrentlyPlaying = false;
      // Ignore AbortError and TypeError (fetch failed/aborted)
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TypeError")
      ) {
        return;
      }
      console.error("[FetchTTSAdapter] Playback error:", error);
      throw error;
    }
  }

  stop(): void {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore errors from already stopped sources
      }
      this.activeSource = null;
    }
    this.isCurrentlyPlaying = false;
  }

  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }
}

/**
 * Factory function to create a FetchTTSAdapter instance
 */
export function createFetchTTSAdapter(options?: FetchTTSAdapterOptions): TTSProvider {
  return new FetchTTSAdapter(options);
}
