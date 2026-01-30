/**
 * AudioWorklet Recording Adapter - WAV recording with dual-voice mixing
 *
 * Records both user microphone AND assistant TTS audio into a single mixed WAV file.
 * Uses AudioWorklet for real-time mixing with minimal latency.
 *
 * Architecture:
 * ```
 * User Mic (48kHz) ──┐
 *                    ├──→ AudioMixerProcessor ──→ Mixed chunks (24kHz)
 * TTS Audio (24kHz) ─┘                                    │
 *                                                         ↓
 *                                              AudioWorkletRecordingAdapter
 *                                              - Accumulates chunks
 *                                              - Encodes to WAV on stop
 *                                              - Manages transcripts
 * ```
 *
 * @example
 * ```typescript
 * const recorder = createAudioWorkletRecorder({ debug: true });
 * await recorder.init();
 *
 * recorder.start(mediaStream, {
 *   onStart: () => console.log("Recording started"),
 *   onStop: (result) => {
 *     // result.audioBlob is WAV with both voices mixed
 *     downloadBlob(result.audioBlob, "conversation.wav");
 *   },
 *   onError: (error) => console.error(error),
 * });
 *
 * // Feed TTS audio as it plays
 * ttsPlayer.onAudioChunk = (samples) => {
 *   recorder.addAssistantAudio(samples);
 * };
 *
 * // Add transcripts as they arrive
 * recorder.addTranscriptEntry({ role: "user", text: "Hello", isFinal: true });
 * recorder.addTranscriptEntry({ role: "assistant", text: "Hi there!", isFinal: true });
 *
 * // Stop and get result
 * const result = await recorder.stop();
 * ```
 */

import type {
  RecordingProvider,
  RecordingConfig,
  RecordingCallbacks,
  RecordingResult,
  RecordingState,
  TranscriptEntry,
  ConversationTranscript,
} from "../../ports/recording";
import { DEFAULT_RECORDING_CONFIG } from "../../ports/recording";
import { RecordingError } from "../../errors";
import { encodeWAV, calculateDuration, estimateWAVSize } from "../../core/wav-encoder";
import { AUDIO_MIXER_WORKLET_SOURCE } from "../../core/mixer-worklet-source";

// =============================================================================
// Types
// =============================================================================

export interface AudioWorkletRecorderConfig extends RecordingConfig {
  /** Output sample rate in Hz @default 24000 */
  outputSampleRate?: number;
  /** Chunk size in milliseconds @default 100 */
  chunkSizeMs?: number;
  /** Maximum recording size in bytes (0 = unlimited) @default 52428800 (50MB) */
  maxSizeBytes?: number;
  /** Custom worklet URL (overrides embedded worklet) */
  mixerWorkletUrl?: string;
}

interface WorkletMessage {
  type: "started" | "stopped" | "audioChunk" | "metrics";
  samples?: Float32Array;
  isFinal?: boolean;
  totalSamples?: number;
  totalSamplesProcessed?: number;
  totalTTSSamplesReceived?: number;
  ttsBufferLevel?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OUTPUT_SAMPLE_RATE = 24000;
const DEFAULT_CHUNK_SIZE_MS = 100;
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const CDN_BASE_URL = "https://kond.studio/sdk/voicekit";

// =============================================================================
// Implementation
// =============================================================================

/**
 * AudioWorklet-based recording adapter for dual-voice capture
 */
export class AudioWorkletRecordingAdapter implements RecordingProvider {
  readonly name = "AudioWorkletRecordingAdapter";

  private config: Required<AudioWorkletRecorderConfig>;
  private state: RecordingState = "idle";
  private callbacks: RecordingCallbacks | null = null;

  // Audio context and nodes
  private audioContext: AudioContext | null = null;
  private mixerWorklet: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  // Recording buffers
  private audioChunks: Float32Array[] = [];
  private totalSamples = 0;
  private currentSizeBytes = 0;

  // Transcript management
  private transcriptEntries: TranscriptEntry[] = [];

  // Timing
  private startTime = 0;
  private pauseTime = 0;
  private totalPausedDuration = 0;
  private sessionId = "";
  private startedAt = "";

  // Progress tracking
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: AudioWorkletRecorderConfig) {
    this.config = {
      ...DEFAULT_RECORDING_CONFIG,
      outputSampleRate: config?.outputSampleRate ?? DEFAULT_OUTPUT_SAMPLE_RATE,
      chunkSizeMs: config?.chunkSizeMs ?? DEFAULT_CHUNK_SIZE_MS,
      maxSizeBytes: config?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
      mixerWorkletUrl: config?.mixerWorkletUrl ?? "",
      ...config,
    } as Required<AudioWorkletRecorderConfig>;
  }

  async init(): Promise<void> {
    // Verify AudioWorklet support
    if (typeof AudioWorkletNode === "undefined") {
      throw new RecordingError("AudioWorklet API not supported in this browser");
    }

    if (this.config.debug) {
      console.log(`[${this.name}] Initialized`);
    }
  }

  start(stream: MediaStream, callbacks: RecordingCallbacks): void {
    if (this.state !== "idle") {
      callbacks.onError(new RecordingError(`Cannot start recording from state: ${this.state}`));
      return;
    }

    this.callbacks = callbacks;
    this.reset();
    this.sessionId = this.generateSessionId();
    this.startedAt = new Date().toISOString();

    // Start async initialization
    this.initializeRecording(stream).catch((error) => {
      this.state = "idle";
      callbacks.onError(
        new RecordingError(
          `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined }
        )
      );
    });
  }

  private async initializeRecording(stream: MediaStream): Promise<void> {
    // Create AudioContext with target sample rate
    this.audioContext = new AudioContext({
      sampleRate: this.config.outputSampleRate,
    });

    // Load mixer worklet
    await this.loadMixerWorklet();

    // Create source node from MediaStream
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Create mixer worklet node
    this.mixerWorklet = new AudioWorkletNode(this.audioContext, "audio-mixer-processor", {
      processorOptions: {
        inputSampleRate: this.audioContext.sampleRate,
        outputSampleRate: this.config.outputSampleRate,
        chunkSizeMs: this.config.chunkSizeMs,
      },
    });

    // Handle messages from worklet
    this.mixerWorklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      this.handleWorkletMessage(event.data);
    };

    // Connect: source → mixer (don't connect to destination to avoid feedback)
    this.sourceNode.connect(this.mixerWorklet);

    // Start recording in worklet
    this.mixerWorklet.port.postMessage({ type: "start" });
    this.startTime = Date.now();
    this.state = "recording";

    // Start progress reporting
    this.startProgressReporting();

    if (this.config.debug) {
      console.log(`[${this.name}] Recording started`, {
        sessionId: this.sessionId,
        sampleRate: this.config.outputSampleRate,
      });
    }

    this.callbacks?.onStart?.();
  }

  private async loadMixerWorklet(): Promise<void> {
    if (!this.audioContext) {
      throw new RecordingError("AudioContext not initialized");
    }

    // Option 1: Custom URL
    if (this.config.mixerWorkletUrl) {
      if (this.config.debug) {
        console.log(`[${this.name}] Loading worklet from custom URL:`, this.config.mixerWorkletUrl);
      }
      await this.audioContext.audioWorklet.addModule(this.config.mixerWorkletUrl);
      return;
    }

    // Option 2: Try Blob URL (zero-config)
    try {
      const blob = new Blob([AUDIO_MIXER_WORKLET_SOURCE], {
        type: "application/javascript",
      });
      const blobUrl = URL.createObjectURL(blob);

      if (this.config.debug) {
        console.log(`[${this.name}] Loading worklet from Blob URL`);
      }

      await this.audioContext.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);
      return;
    } catch (blobError) {
      if (this.config.debug) {
        console.log(`[${this.name}] Blob URL failed, trying CDN fallback`, blobError);
      }
    }

    // Option 3: CDN fallback
    const cdnUrl = `${CDN_BASE_URL}/v1/audio-mixer.worklet.js`;

    try {
      if (this.config.debug) {
        console.log(`[${this.name}] Loading worklet from CDN:`, cdnUrl);
      }
      await this.audioContext.audioWorklet.addModule(cdnUrl);
    } catch (cdnError) {
      throw new RecordingError(
        `Failed to load audio mixer worklet. ` +
        `Blob URL was blocked (likely CSP) and CDN fallback failed. ` +
        `Add 'blob:' to script-src CSP or self-host the worklet.`,
        { cause: cdnError instanceof Error ? cdnError : undefined }
      );
    }
  }

  private handleWorkletMessage(data: WorkletMessage): void {
    switch (data.type) {
      case "audioChunk":
        if (data.samples && this.state === "recording") {
          this.handleAudioChunk(data.samples);
        }
        break;

      case "stopped":
        if (this.config.debug) {
          console.log(`[${this.name}] Worklet stopped`, { totalSamples: data.totalSamples });
        }
        break;

      case "metrics":
        if (this.config.debug) {
          console.log(`[${this.name}] Metrics`, data);
        }
        break;
    }
  }

  private handleAudioChunk(samples: Float32Array): void {
    const chunkSizeBytes = samples.length * 4; // Float32 = 4 bytes
    const wavEquivalentBytes = samples.length * 2; // WAV 16-bit = 2 bytes per sample

    // Check max size limit
    if (this.config.maxSizeBytes > 0) {
      const projectedSize = this.currentSizeBytes + wavEquivalentBytes + 44; // +44 for WAV header
      if (projectedSize > this.config.maxSizeBytes) {
        if (this.config.debug) {
          console.log(`[${this.name}] Max size reached, stopping`);
        }
        this.callbacks?.onMaxDurationReached?.();
        this.stop();
        return;
      }
    }

    // Store chunk
    this.audioChunks.push(samples);
    this.totalSamples += samples.length;
    this.currentSizeBytes += wavEquivalentBytes;
  }

  async stop(): Promise<RecordingResult> {
    if (this.state === "idle") {
      throw new RecordingError("Cannot stop: not recording");
    }

    return new Promise((resolve, reject) => {
      this.state = "processing";
      this.stopProgressReporting();

      try {
        // Signal worklet to stop
        if (this.mixerWorklet) {
          this.mixerWorklet.port.postMessage({ type: "stop" });
        }

        // Allow a small delay for final chunks
        setTimeout(() => {
          this.finalizeRecording()
            .then(resolve)
            .catch(reject);
        }, 100);
      } catch (error) {
        reject(
          new RecordingError(
            `Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error instanceof Error ? error : undefined }
          )
        );
      }
    });
  }

  private async finalizeRecording(): Promise<RecordingResult> {
    const endedAt = new Date().toISOString();
    const durationMs = this.getDuration();

    // Concatenate all chunks
    const allSamples = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      allSamples.set(chunk, offset);
      offset += chunk.length;
    }

    // Encode to WAV
    const audioBlob = encodeWAV(allSamples, {
      sampleRate: this.config.outputSampleRate,
      channels: 1,
      bitsPerSample: 16,
    });

    // Build transcript
    const transcript: ConversationTranscript = {
      entries: this.transcriptEntries,
      durationMs,
    };

    // Build result
    const result: RecordingResult = {
      sessionId: this.sessionId,
      audioBlob,
      format: "wav",
      durationMs,
      transcript,
      sizeBytes: audioBlob.size,
      track: this.config.track,
      startedAt: this.startedAt,
      endedAt,
    };

    // Cleanup
    this.cleanup();
    this.state = "idle";

    if (this.config.debug) {
      console.log(`[${this.name}] Recording stopped`, {
        durationMs,
        sizeBytes: result.sizeBytes,
        transcriptEntries: transcript.entries.length,
        totalSamples: this.totalSamples,
      });
    }

    this.callbacks?.onStop?.(result);
    return result;
  }

  pause(): void {
    if (this.state !== "recording") {
      if (this.config.debug) {
        console.warn(`[${this.name}] Cannot pause from state: ${this.state}`);
      }
      return;
    }

    // We can't truly pause the AudioWorklet, but we can ignore incoming data
    this.pauseTime = Date.now();
    this.state = "paused";
    this.stopProgressReporting();

    if (this.config.debug) {
      console.log(`[${this.name}] Recording paused`);
    }

    this.callbacks?.onPause?.();
  }

  resume(): void {
    if (this.state !== "paused") {
      if (this.config.debug) {
        console.warn(`[${this.name}] Cannot resume from state: ${this.state}`);
      }
      return;
    }

    this.totalPausedDuration += Date.now() - this.pauseTime;
    this.state = "recording";
    this.startProgressReporting();

    if (this.config.debug) {
      console.log(`[${this.name}] Recording resumed`);
    }

    this.callbacks?.onResume?.();
  }

  isRecording(): boolean {
    return this.state === "recording";
  }

  isPaused(): boolean {
    return this.state === "paused";
  }

  getState(): RecordingState {
    return this.state;
  }

  getDuration(): number {
    if (this.state === "idle") {
      return 0;
    }

    const now = this.state === "paused" ? this.pauseTime : Date.now();
    return now - this.startTime - this.totalPausedDuration;
  }

  addTranscriptEntry(entry: Omit<TranscriptEntry, "startMs" | "endMs">): void {
    if (!this.config.captureTranscript) {
      return;
    }

    const currentTime = this.getDuration();
    const lastEntry = this.transcriptEntries[this.transcriptEntries.length - 1];

    // Calculate start time based on audio position
    const startMs = lastEntry?.endMs ?? Math.max(0, currentTime - 500);

    const fullEntry: TranscriptEntry = {
      ...entry,
      startMs,
      endMs: currentTime,
    };

    this.transcriptEntries.push(fullEntry);

    if (this.config.debug) {
      console.log(`[${this.name}] Transcript entry added`, fullEntry);
    }
  }

  /**
   * Add assistant TTS audio data for mixing
   *
   * Call this method for each chunk of TTS audio as it plays.
   * The audio will be mixed with the user's microphone input.
   *
   * @param audioData - Float32Array of audio samples at 24kHz
   */
  addAssistantAudio(audioData: Float32Array): void {
    if (this.state !== "recording" || !this.mixerWorklet) {
      return;
    }

    // Send TTS audio to worklet for mixing
    this.mixerWorklet.port.postMessage({
      type: "ttsAudio",
      samples: audioData,
    });

    if (this.config.debug) {
      console.log(`[${this.name}] TTS audio added`, { samples: audioData.length });
    }
  }

  destroy(): void {
    this.stopProgressReporting();
    this.cleanup();

    this.callbacks = null;
    this.state = "idle";

    if (this.config.debug) {
      console.log(`[${this.name}] Destroyed`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private reset(): void {
    this.audioChunks = [];
    this.transcriptEntries = [];
    this.totalSamples = 0;
    this.currentSizeBytes = 0;
    this.totalPausedDuration = 0;
  }

  private cleanup(): void {
    // Disconnect nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mixerWorklet) {
      this.mixerWorklet.disconnect();
      this.mixerWorklet = null;
    }

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Clear buffers
    this.audioChunks = [];
    this.transcriptEntries = [];
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `rec_${timestamp}_${random}`;
  }

  private startProgressReporting(): void {
    if (this.callbacks?.onProgress) {
      this.progressInterval = setInterval(() => {
        this.callbacks?.onProgress?.(this.getDuration(), this.currentSizeBytes);
      }, 1000);
    }
  }

  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an AudioWorklet-based recording adapter for dual-voice capture
 *
 * @param config - Optional configuration
 * @returns A new AudioWorkletRecordingAdapter instance
 *
 * @example
 * ```typescript
 * const recorder = createAudioWorkletRecorder({
 *   format: "wav",
 *   outputSampleRate: 24000,
 *   debug: true,
 * });
 *
 * // Use with VoiceKit
 * const voice = new VoiceKit({
 *   // ...
 * }, {
 *   recordingProvider: recorder,
 * });
 * ```
 */
export function createAudioWorkletRecorder(
  config?: AudioWorkletRecorderConfig
): AudioWorkletRecordingAdapter {
  return new AudioWorkletRecordingAdapter(config);
}
