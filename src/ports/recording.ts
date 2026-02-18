/**
 * Recording Provider Port - Abstract contract for audio/transcript recording
 *
 * This port defines the interface for recording voice conversations,
 * allowing different implementations (MediaRecorder, AudioWorklet, etc.)
 * while keeping the core VoiceKit decoupled from recording specifics.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Which audio track(s) to record
 * - "user": Only user's microphone audio
 * - "assistant": Only AI assistant's TTS audio
 * - "mixed": Both user and assistant combined
 */
export type RecordingTrack = "user" | "assistant" | "mixed";

/**
 * Output audio format
 * - "webm": WebM/Opus (compressed, smaller files, good for streaming/upload)
 * - "wav": WAV (uncompressed, larger files, better for post-processing)
 */
export type RecordingFormat = "webm" | "wav";

/**
 * Recording state machine states
 */
export type RecordingState = "idle" | "recording" | "paused" | "processing";

/**
 * A single transcript entry with timing information
 */
export interface TranscriptEntry {
  /** Speaker role */
  role: "user" | "assistant";
  /** The spoken/generated text */
  text: string;
  /** Start time in milliseconds from recording start */
  startMs: number;
  /** End time in milliseconds from recording start */
  endMs: number;
  /** STT confidence score (0-1), only for user entries */
  confidence?: number;
  /** Whether this is a final transcript (vs interim) */
  isFinal: boolean;
}

/**
 * Complete conversation transcript with metadata
 */
export interface ConversationTranscript {
  /** All transcript entries in chronological order */
  entries: TranscriptEntry[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Detected language(s) if available */
  detectedLanguages?: string[];
}

/**
 * Complete recording result returned when recording stops
 */
export interface RecordingResult {
  /** Unique session identifier */
  sessionId: string;
  /** The recorded audio as a Blob */
  audioBlob: Blob;
  /** Audio format (webm or wav) */
  format: RecordingFormat;
  /** Total duration in milliseconds */
  durationMs: number;
  /** The conversation transcript with timing */
  transcript: ConversationTranscript;
  /** File size in bytes */
  sizeBytes: number;
  /** Which track was recorded */
  track: RecordingTrack;
  /** Recording start timestamp (ISO 8601) */
  startedAt: string;
  /** Recording end timestamp (ISO 8601) */
  endedAt: string;
}

/**
 * Callbacks for recording events
 */
export interface RecordingCallbacks {
  /** Called when recording starts successfully */
  onStart?: () => void;
  /** Called when recording stops with the final result */
  onStop?: (result: RecordingResult) => void;
  /** Called when recording is paused */
  onPause?: () => void;
  /** Called when recording is resumed */
  onResume?: () => void;
  /** Called on any recording error (required) */
  onError: (error: Error) => void;
  /** Called periodically with current duration and size */
  onProgress?: (durationMs: number, sizeBytes: number) => void;
  /** Called when max duration is reached (auto-stops) */
  onMaxDurationReached?: () => void;
}

/**
 * Recording configuration options
 */
export interface RecordingConfig {
  /** Audio output format @default "webm" */
  format?: RecordingFormat;
  /** Which track to record @default "mixed" */
  track?: RecordingTrack;
  /** Maximum recording duration in ms (0 = unlimited) @default 0 */
  maxDurationMs?: number;
  /** Audio bitrate in kbps @default 128 */
  audioBitrate?: number;
  /** Sample rate in Hz @default 16000 */
  sampleRate?: number;
  /** Whether to capture transcript @default true */
  captureTranscript?: boolean;
  /** Enable debug logging @default false */
  debug?: boolean;
}

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Recording Provider interface
 *
 * Implementations must handle:
 * - Audio capture from MediaStream
 * - Transcript synchronization with audio timeline
 * - State management (idle, recording, paused, processing)
 * - Proper cleanup on destroy
 */
export interface RecordingProvider {
  /** Human-readable name of the provider */
  readonly name: string;

  /**
   * Initialize the recording provider
   * May perform async setup (loading codecs, etc.)
   */
  init(): Promise<void>;

  /**
   * Start recording from the given MediaStream
   * @param stream - The MediaStream to record from (typically user's microphone)
   * @param callbacks - Event callbacks for recording lifecycle
   */
  start(stream: MediaStream, callbacks: RecordingCallbacks): void;

  /**
   * Stop recording and return the final result
   * @returns The complete recording result with audio and transcript
   */
  stop(): Promise<RecordingResult>;

  /**
   * Pause recording (keeps resources allocated)
   */
  pause(): void;

  /**
   * Resume a paused recording
   */
  resume(): void;

  /**
   * Check if currently recording
   */
  isRecording(): boolean;

  /**
   * Check if currently paused
   */
  isPaused(): boolean;

  /**
   * Get current recording state
   */
  getState(): RecordingState;

  /**
   * Get current recording duration in milliseconds
   */
  getDuration(): number;

  /**
   * Add a transcript entry (called by VoiceKit when transcripts arrive)
   * The provider will automatically timestamp the entry
   * @param entry - Partial entry without timing (timing added by provider)
   */
  addTranscriptEntry(entry: Omit<TranscriptEntry, "startMs" | "endMs">): void;

  /**
   * Add assistant audio data for recording (optional)
   * Used when recording "assistant" or "mixed" tracks
   * @param audioData - Float32Array of audio samples
   */
  addAssistantAudio?(audioData: Float32Array): void;

  /**
   * Cleanup and release all resources
   */
  destroy(): void;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default recording configuration
 */
export const DEFAULT_RECORDING_CONFIG: Required<RecordingConfig> = {
  format: "webm",
  track: "mixed",
  maxDurationMs: 0, // Unlimited
  audioBitrate: 128,
  sampleRate: 16000,
  captureTranscript: true,
  debug: false,
};
