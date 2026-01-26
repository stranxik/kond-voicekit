/**
 * VAD Provider Port - Abstract contract for Voice Activity Detection
 *
 * This port defines the interface for any VAD implementation,
 * allowing the core voice module to remain decoupled from
 * specific VAD engines (Silero, WebRTC VAD, etc.)
 */

export interface VADProvider {
  /**
   * Initialize the VAD model (load ONNX, setup audio context)
   * Must be called before start()
   */
  init(): Promise<void>;

  /**
   * Start processing audio from the given stream
   * @param stream - MediaStream from getUserMedia
   * @param callbacks - Event callbacks for speech detection
   */
  start(stream: MediaStream, callbacks: VADCallbacks): void;

  /**
   * Stop processing and release resources
   */
  stop(): void;

  /**
   * Check if VAD is currently running
   */
  isRunning(): boolean;

  /**
   * Get current speech probability (0-1)
   */
  getSpeechProbability(): number;
}

export interface VADCallbacks {
  /** Called every frame with probability 0-1 */
  onSpeechProbability?: (probability: number) => void;
  /** Called when speech starts (crosses threshold) */
  onSpeechStart?: () => void;
  /** Called when speech ends (below threshold + hysteresis) */
  onSpeechEnd?: () => void;
  /** Called on VAD errors */
  onError?: (error: Error) => void;
}

export interface VADConfig {
  /** Probability threshold for speech detection (default: 0.5) */
  threshold?: number;
  /** Minimum speech duration before triggering onSpeechStart (default: 250ms) */
  minSpeechDuration?: number;
  /** Silence duration before triggering onSpeechEnd (default: 700ms) */
  silenceDuration?: number;
  /** Number of consecutive non-speech frames for hysteresis (default: 3) */
  hysteresisFrames?: number;
}

/**
 * Default VAD configuration
 */
export const DEFAULT_VAD_CONFIG: Required<VADConfig> = {
  threshold: 0.5,
  minSpeechDuration: 250,
  silenceDuration: 700,
  hysteresisFrames: 3,
};
