/**
 * STT Port - Clean Architecture interface for Speech-to-Text
 *
 * Defines the contract for streaming STT implementations.
 * Adapters (Deepgram, Whisper, etc.) implement this interface.
 */

export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Language detected or used */
  language: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether this is a final result (vs interim) */
  isFinal: boolean;
  /** Whether speech has ended (utterance complete) */
  speechFinal?: boolean;
}

export interface StreamingCallbacks {
  /** Called when interim transcription is available */
  onInterim: (result: TranscriptionResult) => void;
  /** Called when final transcription is available */
  onFinal: (result: TranscriptionResult) => void;
  /** Called when user stops speaking (utterance end) */
  onUtteranceEnd: () => void;
  /** Called when speech activity is detected (VAD event) */
  onSpeechStarted?: () => void;
  /** Called when connection is ready */
  onReady?: () => void;
  /** Called on error */
  onError: (error: Error) => void;
}

export interface StreamingSTTPort {
  /**
   * Start streaming connection
   * @param callbacks Callbacks for transcription events
   * @param language Language code (e.g., "fr", "en")
   */
  startStreaming(callbacks: StreamingCallbacks, language?: string): Promise<void>;

  /**
   * Send audio chunk to STT service
   * @param chunk Audio data (PCM 16kHz 16-bit mono)
   */
  sendAudio(chunk: ArrayBuffer | Float32Array): void;

  /**
   * Signal end of audio stream
   */
  endAudio(): void;

  /**
   * Close connection and cleanup
   */
  close(): void;

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean;
}
