/**
 * VoiceKit Adapters
 *
 * Concrete implementations of the ports interfaces.
 */

// =============================================================================
// HTTP Client
// =============================================================================

export { FetchHttpClient, createFetchHttpClient } from "./http";
export type { FetchHttpClientConfig } from "./http";

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

// Legacy adapter (to be removed)
export {
  FetchTTSAdapter,
  createFetchTTSAdapter,
  configureFetchTTS,
  getFetchTTSConfig,
} from "./tts";
export type { FetchTTSConfig, FetchTTSAdapterOptions } from "./tts";

// New clean architecture adapter
export { HttpTTSSource, createHttpTTSSource } from "./tts";
export type { HttpTTSSourceConfig } from "./tts";

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

// ONNX (local ML inference)
export { OnnxTurnDetector, createOnnxTurnDetector } from "./turn-detector";
export type { OnnxTurnDetectorOptions } from "./turn-detector";

// Cloud (remote ML API via KOND)
export { CloudTurnDetector, createCloudTurnDetector } from "./turn-detector";
export type { CloudTurnDetectorOptions } from "./turn-detector";

// Mock (testing)
export { MockTurnDetector, createMockTurnDetector } from "./turn-detector";
export type { MockTurnDetectorOptions } from "./turn-detector";

// Turn detector support utilities (for advanced use)
export { BPETokenizer, ModelCache, getModelCache } from "./turn-detector";
export type { TokenizerConfig, ModelMetadata } from "./turn-detector";

// =============================================================================
// Utilities
// =============================================================================

export {
  detectDeviceCapabilities,
  canRunLocalOnnxInference,
  getOnnxCapabilityReason,
} from "./utils";
export type { DeviceCapabilities } from "./utils";
