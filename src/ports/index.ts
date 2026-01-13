/**
 * Port interfaces - Clean Architecture contracts
 */

// STT Port
export type {
  StreamingSTTPort,
  StreamingCallbacks,
  TranscriptionResult,
} from "./stt";

// TTS Port
export type { TTSProvider } from "./tts";

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
