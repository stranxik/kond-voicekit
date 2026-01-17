/**
 * Port interfaces - Clean Architecture contracts
 */

// HTTP Client Port
export type { HttpClientPort, HttpRequest, HttpResponse } from "./http-client";

// STT Port
export type {
  StreamingSTTPort,
  StreamingCallbacks,
  TranscriptionResult,
} from "./stt";

// TTS Port
export type { TTSProvider } from "./tts";

// TTS Source Port (for fetching audio data)
export type {
  TTSSourcePort,
  TTSFetchOptions,
  TTSAudioResult,
  PrefetchedAudio,
} from "./tts-source";

// VAD Port
export type { VADProvider, VADCallbacks, VADConfig } from "./vad";
export { DEFAULT_VAD_CONFIG } from "./vad";

// Turn Detector Port
export type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnPredictionReason,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "./turn-detector";

export { DEFAULT_TURN_DETECTOR_CONFIG } from "./turn-detector";
