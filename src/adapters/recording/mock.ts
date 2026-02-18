/**
 * Mock Recording Adapter - For testing purposes
 *
 * This adapter simulates recording functionality without actual audio capture.
 * Useful for unit tests and development without microphone access.
 *
 * @example
 * ```typescript
 * const mockRecorder = createMockRecordingAdapter({
 *   simulatedDurationMs: 5000,
 *   simulatedSizeBytes: 50000,
 * });
 *
 * // Use in tests
 * await mockRecorder.init();
 * mockRecorder.start(fakeStream, callbacks);
 * const result = await mockRecorder.stop();
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

// =============================================================================
// Types
// =============================================================================

export interface MockRecordingAdapterConfig extends RecordingConfig {
  /** Simulated recording duration in ms (for stop result) */
  simulatedDurationMs?: number;
  /** Simulated file size in bytes */
  simulatedSizeBytes?: number;
  /** Delay before init completes (ms) */
  initDelayMs?: number;
  /** Delay before stop completes (ms) */
  stopDelayMs?: number;
  /** Force an error on start */
  forceStartError?: Error;
  /** Force an error on stop */
  forceStopError?: Error;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Mock recording adapter for testing
 */
export class MockRecordingAdapter implements RecordingProvider {
  readonly name = "MockRecordingAdapter";

  private config: Required<MockRecordingAdapterConfig>;
  private state: RecordingState = "idle";
  private transcriptEntries: TranscriptEntry[] = [];
  private callbacks: RecordingCallbacks | null = null;

  // Timing
  private startTime: number = 0;
  private pauseTime: number = 0;
  private totalPausedDuration: number = 0;
  private sessionId: string = "";
  private startedAt: string = "";

  // Track calls for assertions
  public callLog: Array<{ method: string; args?: unknown[] }> = [];

  constructor(config?: MockRecordingAdapterConfig) {
    this.config = {
      ...DEFAULT_RECORDING_CONFIG,
      simulatedDurationMs: config?.simulatedDurationMs ?? 5000,
      simulatedSizeBytes: config?.simulatedSizeBytes ?? 50000,
      initDelayMs: config?.initDelayMs ?? 0,
      stopDelayMs: config?.stopDelayMs ?? 0,
      forceStartError: config?.forceStartError,
      forceStopError: config?.forceStopError,
      ...config,
    } as Required<MockRecordingAdapterConfig>;
  }

  async init(): Promise<void> {
    this.callLog.push({ method: "init" });

    if (this.config.initDelayMs > 0) {
      await this.delay(this.config.initDelayMs);
    }

    if (this.config.debug) {
      console.log(`[${this.name}] Initialized`);
    }
  }

  start(stream: MediaStream, callbacks: RecordingCallbacks): void {
    this.callLog.push({ method: "start", args: [stream] });

    if (this.config.forceStartError) {
      callbacks.onError(this.config.forceStartError);
      return;
    }

    if (this.state !== "idle") {
      callbacks.onError(new Error(`Cannot start recording from state: ${this.state}`));
      return;
    }

    this.callbacks = callbacks;
    this.transcriptEntries = [];
    this.totalPausedDuration = 0;
    this.sessionId = `mock_${Date.now()}`;
    this.startedAt = new Date().toISOString();
    this.startTime = Date.now();
    this.state = "recording";

    if (this.config.debug) {
      console.log(`[${this.name}] Recording started`, { sessionId: this.sessionId });
    }

    callbacks.onStart?.();
  }

  async stop(): Promise<RecordingResult> {
    this.callLog.push({ method: "stop" });

    if (this.config.forceStopError) {
      throw this.config.forceStopError;
    }

    if (this.state === "idle") {
      throw new Error("Cannot stop: not recording");
    }

    this.state = "processing";

    if (this.config.stopDelayMs > 0) {
      await this.delay(this.config.stopDelayMs);
    }

    const endedAt = new Date().toISOString();
    const durationMs = this.config.simulatedDurationMs || this.getDuration();

    // Create fake audio blob
    const audioBlob = new Blob(
      [new Uint8Array(this.config.simulatedSizeBytes)],
      { type: "audio/webm" }
    );

    // Build transcript
    const transcript: ConversationTranscript = {
      entries: this.transcriptEntries,
      durationMs,
    };

    const result: RecordingResult = {
      sessionId: this.sessionId,
      audioBlob,
      format: this.config.format,
      durationMs,
      transcript,
      sizeBytes: this.config.simulatedSizeBytes,
      track: this.config.track,
      startedAt: this.startedAt,
      endedAt,
    };

    this.state = "idle";

    if (this.config.debug) {
      console.log(`[${this.name}] Recording stopped`, result);
    }

    this.callbacks?.onStop?.(result);
    return result;
  }

  pause(): void {
    this.callLog.push({ method: "pause" });

    if (this.state !== "recording") {
      return;
    }

    this.pauseTime = Date.now();
    this.state = "paused";

    if (this.config.debug) {
      console.log(`[${this.name}] Recording paused`);
    }

    this.callbacks?.onPause?.();
  }

  resume(): void {
    this.callLog.push({ method: "resume" });

    if (this.state !== "paused") {
      return;
    }

    this.totalPausedDuration += Date.now() - this.pauseTime;
    this.state = "recording";

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
    this.callLog.push({ method: "addTranscriptEntry", args: [entry] });

    if (!this.config.captureTranscript) {
      return;
    }

    const currentTime = this.getDuration();
    const lastEntry = this.transcriptEntries[this.transcriptEntries.length - 1];

    const fullEntry: TranscriptEntry = {
      ...entry,
      startMs: lastEntry?.endMs ?? Math.max(0, currentTime - 500),
      endMs: currentTime,
    };

    this.transcriptEntries.push(fullEntry);

    if (this.config.debug) {
      console.log(`[${this.name}] Transcript entry added`, fullEntry);
    }
  }

  addAssistantAudio(audioData: Float32Array): void {
    this.callLog.push({ method: "addAssistantAudio", args: [audioData.length] });

    if (this.config.debug) {
      console.log(`[${this.name}] Assistant audio added (${audioData.length} samples)`);
    }
  }

  destroy(): void {
    this.callLog.push({ method: "destroy" });

    this.state = "idle";
    this.transcriptEntries = [];
    this.callbacks = null;

    if (this.config.debug) {
      console.log(`[${this.name}] Destroyed`);
    }
  }

  // ==========================================================================
  // Test helpers
  // ==========================================================================

  /**
   * Reset the call log (useful between tests)
   */
  resetCallLog(): void {
    this.callLog = [];
  }

  /**
   * Get all transcript entries
   */
  getTranscriptEntries(): TranscriptEntry[] {
    return [...this.transcriptEntries];
  }

  /**
   * Simulate a recording error
   */
  simulateError(error: Error): void {
    this.callbacks?.onError(error);
  }

  /**
   * Simulate progress callback
   */
  simulateProgress(durationMs: number, sizeBytes: number): void {
    this.callbacks?.onProgress?.(durationMs, sizeBytes);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a mock recording adapter for testing
 *
 * @param config - Optional configuration
 * @returns A new MockRecordingAdapter instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const recorder = createMockRecordingAdapter();
 *
 * // With custom simulated values
 * const recorder = createMockRecordingAdapter({
 *   simulatedDurationMs: 10000,
 *   simulatedSizeBytes: 100000,
 * });
 *
 * // Force errors for testing error handling
 * const recorder = createMockRecordingAdapter({
 *   forceStartError: new Error("Microphone access denied"),
 * });
 * ```
 */
export function createMockRecordingAdapter(config?: MockRecordingAdapterConfig): MockRecordingAdapter {
  return new MockRecordingAdapter(config);
}
