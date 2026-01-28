/**
 * TTS Player - Clean Architecture PCM Audio Playback
 *
 * Plays PCM audio from a TTSSourcePort using Web Audio API.
 * No global state - all state is encapsulated in the class.
 * No direct fetch - uses injected TTSSourcePort for audio data.
 *
 * Audio format: 24kHz, 16-bit signed little-endian, mono
 */

import type { TTSSourcePort, TTSAudioResult } from "../ports/tts-source";
import type { Locale } from "../types/config";
import type { TtsModel } from "./tts-model-router";
import { TTSError } from "../errors";

// ============================================
// AUDIO CONSTANTS
// ============================================

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2; // 16-bit

// ============================================
// PURE FUNCTIONS (no state, no I/O)
// ============================================

/**
 * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
 */
export function pcm16ToFloat32(pcmData: Uint8Array): Float32Array {
  const numSamples = Math.floor(pcmData.length / BYTES_PER_SAMPLE);
  const float32 = new Float32Array(numSamples);
  const dataView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);

  for (let i = 0; i < numSamples; i++) {
    const int16 = dataView.getInt16(i * BYTES_PER_SAMPLE, true);
    float32[i] = int16 / 32768;
  }

  return float32;
}

/**
 * Create AudioBuffer from Float32 samples
 */
export function createAudioBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(CHANNELS, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/**
 * Handle incomplete PCM samples at chunk boundaries
 * Returns [processable data, remaining bytes]
 */
export function alignPCMChunk(
  chunk: Uint8Array,
  pendingBytes: Uint8Array | null
): [Uint8Array, Uint8Array | null] {
  let pcmData: Uint8Array;

  // Combine with pending bytes from previous chunk
  if (pendingBytes && pendingBytes.length > 0) {
    pcmData = new Uint8Array(pendingBytes.length + chunk.length);
    pcmData.set(pendingBytes, 0);
    pcmData.set(chunk, pendingBytes.length);
  } else {
    pcmData = chunk;
  }

  // Save any incomplete sample for next chunk
  const remainder = pcmData.length % BYTES_PER_SAMPLE;
  if (remainder > 0) {
    return [pcmData.slice(0, -remainder), pcmData.slice(-remainder)];
  }

  return [pcmData, null];
}

// ============================================
// TTS PLAYER CLASS
// ============================================

/**
 * Configuration for TTSPlayer
 */
export interface TTSPlayerConfig {
  /** Default voice ID */
  voice?: string;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Callbacks for TTSPlayer events
 */
export interface TTSPlayerCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * TTS Player - Plays audio from TTSSourcePort
 *
 * Clean architecture: No global state, uses dependency injection.
 *
 * Usage:
 * ```typescript
 * const httpClient = new FetchHttpClient();
 * const ttsSource = new HttpTTSSource(httpClient, { baseUrl: "/api/voice/v1" });
 * const player = new TTSPlayer(ttsSource, { voice: "marie-fr" });
 *
 * await player.speak("Bonjour!", "fr", {
 *   onEnd: () => console.log("Done speaking")
 * });
 * ```
 */
export class TTSPlayer {
  private source: TTSSourcePort;
  private config: TTSPlayerConfig;

  // Playback state (instance-level, not global)
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private shouldStop = false;
  private pendingBytes: Uint8Array | null = null;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];

  constructor(source: TTSSourcePort, config: TTSPlayerConfig = {}) {
    this.source = source;
    this.config = {
      voice: config.voice ?? "marie-fr",
      debug: config.debug ?? false,
    };
  }

  /**
   * Speak text using streaming TTS
   */
  async speak(
    text: string,
    locale: Locale = "fr",
    callbacks?: TTSPlayerCallbacks,
    options?: { voice?: string; model?: TtsModel }
  ): Promise<void> {
    // Reset state
    this.stop();
    this.shouldStop = false;
    this.isPlaying = true;
    this.pendingBytes = null;

    const ctx = this.getAudioContext();

    try {
      const result = await this.source.fetchAudio(text, locale, {
        voice: options?.voice ?? this.config.voice,
        model: options?.model,
      });

      let hasStarted = false;

      for await (const chunk of result.stream) {
        if (this.shouldStop) break;

        if (chunk && chunk.length > 0) {
          if (!hasStarted) {
            hasStarted = true;
            this.log("Streaming started");
            callbacks?.onStart?.();
          }

          this.processAndPlayChunk(ctx, chunk);
        }
      }

      // Wait for playback to complete
      if (!this.shouldStop) {
        await this.waitForPlaybackComplete();
        callbacks?.onEnd?.();
      }
    } catch (error) {
      this.isPlaying = false;
      const err = error instanceof Error ? error : new TTSError("TTS playback failed");
      callbacks?.onError?.(err);
      throw err;
    } finally {
      this.isPlaying = false;
      this.pendingBytes = null;
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.shouldStop = true;
    this.isPlaying = false;
    this.pendingBytes = null;

    for (const source of this.activeSourceNodes) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors from already stopped sources
      }
    }
    this.activeSourceNodes = [];
    this.nextPlayTime = 0;
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
    this.audioContext = null;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private processAndPlayChunk(ctx: AudioContext, chunk: Uint8Array): void {
    if (this.shouldStop) return;

    const [pcmData, remaining] = alignPCMChunk(chunk, this.pendingBytes);
    this.pendingBytes = remaining;

    if (pcmData.length < BYTES_PER_SAMPLE) return;

    const float32 = pcm16ToFloat32(pcmData);
    const buffer = createAudioBuffer(ctx, float32);
    this.scheduleAudioBuffer(ctx, buffer);
  }

  private scheduleAudioBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
    if (this.shouldStop) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

    this.activeSourceNodes.push(source);

    source.onended = () => {
      const index = this.activeSourceNodes.indexOf(source);
      if (index > -1) {
        this.activeSourceNodes.splice(index, 1);
      }
      source.disconnect();
    };
  }

  private async waitForPlaybackComplete(): Promise<void> {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.shouldStop || this.activeSourceNodes.length === 0) {
          resolve();
        } else {
          setTimeout(checkComplete, 50);
        }
      };
      checkComplete();
    });
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[TTSPlayer] ${message}`);
    }
  }
}

/**
 * Create a TTSPlayer instance
 */
export function createTTSPlayer(
  source: TTSSourcePort,
  config?: TTSPlayerConfig
): TTSPlayer {
  return new TTSPlayer(source, config);
}
