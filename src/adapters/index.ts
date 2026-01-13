/**
 * VoiceKit Adapters
 *
 * Concrete implementations of the ports interfaces.
 * Configure URLs before using adapters in your application.
 */

// =============================================================================
// STT (Speech-to-Text)
// =============================================================================

export {
  DeepgramStreamingAdapter,
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  configureDeepgram,
  getDeepgramConfig,
} from "./stt";
export type { DeepgramConfig } from "./stt";

// =============================================================================
// TTS (Text-to-Speech)
// =============================================================================

export {
  FetchTTSAdapter,
  createFetchTTSAdapter,
  configureFetchTTS,
  getFetchTTSConfig,
} from "./tts";
export type { FetchTTSConfig, FetchTTSAdapterOptions } from "./tts";

// =============================================================================
// VAD (Voice Activity Detection)
// =============================================================================

export { SileroVADAdapter, createSileroVAD } from "./vad";
export type { SileroVADConfig } from "./vad";

// =============================================================================
// Turn Detector
// =============================================================================

// Heuristic (always available fallback)
export {
  HeuristicTurnDetector,
  createHeuristicTurnDetector,
  isBackchannel,
  isLikelyIncomplete,
  isSemanticComplete,
  hasTerminalPunctuation,
} from "./turn-detector";
export type { HeuristicTurnDetectorOptions } from "./turn-detector";

// ONNX (local ML - stub)
export { OnnxTurnDetector, createOnnxTurnDetector } from "./turn-detector";
export type { OnnxTurnDetectorOptions } from "./turn-detector";

// Cloud (remote ML API)
export {
  CloudTurnDetector,
  createCloudTurnDetector,
  createCloudTurnDetectorWithAuth,
  configureCloudTurnDetector,
  getCloudTurnDetectorConfig,
} from "./turn-detector";
export type { CloudTurnDetectorOptions, CloudTurnDetectorConfig } from "./turn-detector";

// Mock (testing)
export { MockTurnDetector, createMockTurnDetector } from "./turn-detector";
export type { MockTurnDetectorOptions } from "./turn-detector";
