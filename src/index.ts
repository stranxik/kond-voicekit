/**
 * @kond/voicekit
 *
 * Voice conversation SDK for real-time speech-to-text, turn detection, and text-to-speech.
 *
 * @example Basic usage with VoiceKit class (coming soon)
 * ```typescript
 * import { VoiceKit } from "@kond/voicekit";
 *
 * const voice = new VoiceKit({
 *   locale: "fr",
 *   onTranscript: async (text) => {
 *     const response = await yourLLM.generate(text);
 *     voice.speak(response);
 *   },
 * });
 *
 * await voice.start();
 * ```
 *
 * @example Low-level usage with adapters
 * ```typescript
 * import { configureDeepgram, createDeepgramAdapter } from "@kond/voicekit/adapters";
 * import { createSileroVAD } from "@kond/voicekit/adapters";
 * import { createTurnManager } from "@kond/voicekit/core";
 *
 * // Configure backend URLs
 * configureDeepgram({ wsUrl: "wss://your-stt-proxy.com" });
 *
 * // Create adapters
 * const stt = createDeepgramAdapter();
 * const vad = createSileroVAD();
 * const turnManager = createTurnManager({ locale: "fr" });
 * ```
 */

// =============================================================================
// VoiceKit (Main Class)
// =============================================================================

export { VoiceKit, createVoiceKit } from "./voicekit";

// =============================================================================
// Types
// =============================================================================

export type {
  Locale,
  ConversationState,
  TraceEvent,
  VoiceKitError,
  VoiceKitConfig,
} from "./types/config";
export { DEFAULT_CONFIG } from "./types/config";

// =============================================================================
// Ports (Interfaces)
// =============================================================================

// STT Port
export type {
  StreamingSTTPort,
  StreamingCallbacks,
  TranscriptionResult,
} from "./ports/stt";

// TTS Port
export type { TTSProvider } from "./ports/tts";

// VAD Port
export type { VADProvider, VADCallbacks, VADConfig } from "./ports/vad";
export { DEFAULT_VAD_CONFIG } from "./ports/vad";

// Turn Detector Port
export type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "./ports/turn-detector";
export { DEFAULT_TURN_DETECTOR_CONFIG } from "./ports/turn-detector";

// =============================================================================
// Core (Signal Processing & Conversation Logic)
// =============================================================================

// Turn Manager
export { createTurnManager } from "./core/turn-manager";
export type { TurnManager, TurnManagerConfig } from "./core/turn-manager";

// End-of-Utterance Detection
export { detectEndOfUtterance, isUtteranceComplete, explainEOUResult } from "./core/eou-detector";
export type { EOUResult, EOUReason, EOUContext } from "./core/eou-detector";

// Trigger Detection
export {
  shouldTriggerEarly,
  isBackchannel as isTriggerBackchannel,
  isLikelyIncomplete as isTriggerIncomplete,
  isLikelyComplete,
  analyzeTrigger,
  analyzeLinguisticSignals,
} from "./core/trigger-detector";
export type { TriggerState, LinguisticSignals } from "./core/trigger-detector";

// TTS Streaming
export {
  configureTTSStreaming,
  getTTSStreamingConfig,
  speakTextStreaming,
  speakTextStreamingWithCallback,
  stopStreamingTTS,
  isStreamingTTSPlaying,
  prefetchAudio,
  playPreloadedAudio,
  cancelPrefetch,
  isPreloadedReady,
  testAudioContextBeep,
} from "./core/tts-streaming";
export type { TTSStreamingConfig, PreloadedAudio } from "./core/tts-streaming";

// TTS Queue
export { createTTSQueue, extractSentences, createSentenceAccumulator } from "./core/tts-queue";

// TTS Model Router
export { selectTtsModel, selectTtsModelWithReason, isShortAcknowledgment } from "./core/tts-model-router";
export type { TtsModel, TtsContext, TtsModelSelection } from "./core/tts-model-router";

// Text Sanitization
export { sanitizeForTTS, hasVisualBlocks } from "./core/sanitize-for-tts";

// Sentence Chunker
export { extractSentences as chunkSentences } from "./core/sentence-chunker";

// Device Capability Detection
export { isDeviceCapableForLocalML, getDeviceCapabilitySummary } from "./core/utils/device-capability";

// Browser Utilities
export {
  isIOS,
  isSafari,
  getIOSVersion,
  isVADSupported,
  isVoiceConversationSupported,
  ensureAudioContextResumed,
  sleep,
} from "./core/utils/browser";

// =============================================================================
// Adapters (Concrete Implementations)
// =============================================================================

// STT Adapters
export {
  DeepgramStreamingAdapter,
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  configureDeepgram,
  getDeepgramConfig,
} from "./adapters/stt";
export type { DeepgramConfig } from "./adapters/stt";

// TTS Adapters
export {
  FetchTTSAdapter,
  createFetchTTSAdapter,
  configureFetchTTS,
  getFetchTTSConfig,
} from "./adapters/tts";
export type { FetchTTSConfig, FetchTTSAdapterOptions } from "./adapters/tts";

// VAD Adapters
export { SileroVADAdapter, createSileroVAD } from "./adapters/vad";
export type { SileroVADConfig } from "./adapters/vad";

// Turn Detector Adapters
export {
  // Heuristic
  HeuristicTurnDetector,
  createHeuristicTurnDetector,
  isBackchannel,
  isLikelyIncomplete,
  isSemanticComplete,
  hasTerminalPunctuation,
  // ONNX
  OnnxTurnDetector,
  createOnnxTurnDetector,
  // Cloud
  CloudTurnDetector,
  createCloudTurnDetector,
  createCloudTurnDetectorWithAuth,
  configureCloudTurnDetector,
  getCloudTurnDetectorConfig,
  // Mock
  MockTurnDetector,
  createMockTurnDetector,
} from "./adapters/turn-detector";
export type {
  HeuristicTurnDetectorOptions,
  OnnxTurnDetectorOptions,
  CloudTurnDetectorOptions,
  CloudTurnDetectorConfig,
  MockTurnDetectorOptions,
} from "./adapters/turn-detector";
