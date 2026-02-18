/**
 * MediaRecorder Adapter - WebM/Opus recording using native MediaRecorder API
 *
 * This adapter uses the browser's built-in MediaRecorder API to record audio.
 * It produces WebM/Opus files which are compressed and efficient for streaming/upload.
 *
 * Limitations:
 * - Cannot record separate user/assistant tracks (mixed only)
 * - Format depends on browser support (typically WebM/Opus in Chrome, WebM/Vorbis in Firefox)
 *
 * @example
 * ```typescript
 * const recorder = createMediaRecorderAdapter({ debug: true });
 * await recorder.init();
 *
 * recorder.start(mediaStream, {
 *   onStart: () => console.log("Recording started"),
 *   onStop: (result) => console.log("Recording finished", result),
 *   onError: (error) => console.error("Recording error", error),
 * });
 *
 * // Add transcripts as they arrive
 * recorder.addTranscriptEntry({ role: "user", text: "Hello", isFinal: true });
 *
 * // Stop recording
 * const result = await recorder.stop();
 * // result.audioBlob contains the WebM audio
 * // result.transcript contains the timed transcript
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

// =============================================================================
// Types
// =============================================================================

export interface MediaRecorderAdapterConfig extends RecordingConfig {
  /** MIME type override (default: auto-detect best supported) */
  mimeType?: string;
  /** Time slice for ondataavailable events in ms @default 1000 */
  timeslice?: number;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * MediaRecorder-based recording adapter
 */
export class MediaRecorderAdapter implements RecordingProvider {
  readonly name = "MediaRecorderAdapter";

  private config: Required<MediaRecorderAdapterConfig>;
  private state: RecordingState = "idle";
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private transcriptEntries: TranscriptEntry[] = [];
  private callbacks: RecordingCallbacks | null = null;

  // Timing
  private startTime: number = 0;
  private pauseTime: number = 0;
  private totalPausedDuration: number = 0;
  private sessionId: string = "";
  private startedAt: string = "";

  // Progress tracking
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private currentSize: number = 0;
  private maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: MediaRecorderAdapterConfig) {
    this.config = {
      ...DEFAULT_RECORDING_CONFIG,
      mimeType: config?.mimeType || "",
      timeslice: config?.timeslice ?? 1000,
      ...config,
    } as Required<MediaRecorderAdapterConfig>;
  }

  async init(): Promise<void> {
    // Check MediaRecorder support
    if (typeof MediaRecorder === "undefined") {
      throw new RecordingError("MediaRecorder API not supported in this browser");
    }

    // Verify MIME type support if specified
    if (this.config.mimeType && !MediaRecorder.isTypeSupported(this.config.mimeType)) {
      throw new RecordingError(`MIME type not supported: ${this.config.mimeType}`);
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
    this.audioChunks = [];
    this.transcriptEntries = [];
    this.currentSize = 0;
    this.totalPausedDuration = 0;
    this.sessionId = this.generateSessionId();
    this.startedAt = new Date().toISOString();

    // Determine best MIME type
    const mimeType = this.config.mimeType || this.getBestMimeType();

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: this.config.audioBitrate * 1000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.currentSize += event.data.size;
        }
      };

      this.mediaRecorder.onerror = (event) => {
        const error = new RecordingError(
          `MediaRecorder error: ${(event as ErrorEvent).message || "Unknown error"}`
        );
        this.callbacks?.onError(error);
      };

      this.mediaRecorder.onstop = () => {
        // Handled in stop() method
      };

      // Start recording
      this.mediaRecorder.start(this.config.timeslice);
      this.startTime = Date.now();
      this.state = "recording";

      // Start progress reporting
      this.startProgressReporting();

      // Check max duration
      if (this.config.maxDurationMs > 0) {
        this.maxDurationTimeout = setTimeout(() => {
          this.maxDurationTimeout = null;
          if (this.state === "recording") {
            this.callbacks?.onMaxDurationReached?.();
            this.stop();
          }
        }, this.config.maxDurationMs);
      }

      if (this.config.debug) {
        console.log(`[${this.name}] Recording started`, { mimeType, sessionId: this.sessionId });
      }

      this.callbacks.onStart?.();
    } catch (error) {
      const recordingError = new RecordingError(
        `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined }
      );
      callbacks.onError(recordingError);
    }
  }

  async stop(): Promise<RecordingResult> {
    if (this.state === "idle" || this.state === "processing") {
      throw new RecordingError("Cannot stop: not recording");
    }

    // Clear max duration timeout to prevent re-entry
    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout);
      this.maxDurationTimeout = null;
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new RecordingError("MediaRecorder not initialized"));
        return;
      }

      this.state = "processing";
      this.stopProgressReporting();

      const handleStop = () => {
        try {
          const endedAt = new Date().toISOString();
          const durationMs = this.getDuration();

          // Create audio blob
          const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });

          // Build transcript
          const transcript: ConversationTranscript = {
            entries: this.transcriptEntries,
            durationMs,
          };

          // Build result
          const result: RecordingResult = {
            sessionId: this.sessionId,
            audioBlob,
            format: mimeType.includes("wav") ? "wav" : "webm",
            durationMs,
            transcript,
            sizeBytes: audioBlob.size,
            track: this.config.track,
            startedAt: this.startedAt,
            endedAt,
          };

          // Reset state
          this.state = "idle";
          this.mediaRecorder = null;
          this.audioChunks = [];

          if (this.config.debug) {
            console.log(`[${this.name}] Recording stopped`, {
              durationMs,
              sizeBytes: result.sizeBytes,
              transcriptEntries: transcript.entries.length,
            });
          }

          this.callbacks?.onStop?.(result);
          resolve(result);
        } catch (error) {
          const recordingError = new RecordingError(
            `Failed to finalize recording: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error instanceof Error ? error : undefined }
          );
          reject(recordingError);
        }
      };

      // If already stopped (e.g., from error), handle immediately
      if (this.mediaRecorder.state === "inactive") {
        handleStop();
      } else {
        this.mediaRecorder.onstop = handleStop;
        this.mediaRecorder.stop();
      }
    });
  }

  pause(): void {
    if (this.state !== "recording") {
      if (this.config.debug) {
        console.warn(`[${this.name}] Cannot pause from state: ${this.state}`);
      }
      return;
    }

    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.pause();
      this.pauseTime = Date.now();
      this.state = "paused";
      this.stopProgressReporting();

      if (this.config.debug) {
        console.log(`[${this.name}] Recording paused`);
      }

      this.callbacks?.onPause?.();
    }
  }

  resume(): void {
    if (this.state !== "paused") {
      if (this.config.debug) {
        console.warn(`[${this.name}] Cannot resume from state: ${this.state}`);
      }
      return;
    }

    if (this.mediaRecorder?.state === "paused") {
      // Track paused duration for accurate timing
      this.totalPausedDuration += Date.now() - this.pauseTime;
      this.mediaRecorder.resume();
      this.state = "recording";
      this.startProgressReporting();

      if (this.config.debug) {
        console.log(`[${this.name}] Recording resumed`);
      }

      this.callbacks?.onResume?.();
    }
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

    // Calculate start time (use last entry's end time or current time)
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

  addAssistantAudio(_audioData: Float32Array): void {
    // MediaRecorder cannot mix separate audio tracks
    // This would require AudioWorklet-based recording
    if (this.config.debug) {
      console.warn(`[${this.name}] addAssistantAudio not supported - use AudioWorkletRecorder for separate tracks`);
    }
  }

  destroy(): void {
    this.stopProgressReporting();

    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout);
      this.maxDurationTimeout = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.transcriptEntries = [];
    this.callbacks = null;
    this.state = "idle";

    if (this.config.debug) {
      console.log(`[${this.name}] Destroyed`);
    }
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private getBestMimeType(): string {
    // Prefer WebM/Opus for best compression
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback to default (browser will choose)
    return "";
  }

  private generateSessionId(): string {
    // Generate a unique session ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `rec_${timestamp}_${random}`;
  }

  private startProgressReporting(): void {
    if (this.callbacks?.onProgress) {
      this.progressInterval = setInterval(() => {
        this.callbacks?.onProgress?.(this.getDuration(), this.currentSize);
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
 * Create a MediaRecorder-based recording adapter
 *
 * @param config - Optional configuration
 * @returns A new MediaRecorderAdapter instance
 *
 * @example
 * ```typescript
 * const recorder = createMediaRecorderAdapter({
 *   format: "webm",
 *   audioBitrate: 128,
 *   debug: true,
 * });
 * ```
 */
export function createMediaRecorderAdapter(config?: MediaRecorderAdapterConfig): MediaRecorderAdapter {
  return new MediaRecorderAdapter(config);
}
