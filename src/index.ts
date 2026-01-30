/**
 * @kond.studio/voicekit
 *
 * Voice conversation SDK for real-time speech-to-text, turn detection, and text-to-speech.
 *
 * @example Basic usage with VoiceKit class (coming soon)
 * ```typescript
 * import { VoiceKit } from "@kond.studio/voicekit";
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
 * import { configureDeepgram, createDeepgramAdapter } from "@kond.studio/voicekit/adapters";
 * import { createSileroVAD } from "@kond.studio/voicekit/adapters";
 * import { createTurnManager } from "@kond.studio/voicekit/core";
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
export type { VoiceKitDeps } from "./voicekit";

// =============================================================================
// Types
// =============================================================================

export type {
  Locale,
  ConversationState,
  TraceEvent,
  VoiceKitError as VoiceKitErrorInfo, // Renamed to avoid collision with VoiceKitError class
  VoiceKitConfig,
} from "./types/config";
export { DEFAULT_CONFIG } from "./types/config";

// =============================================================================
// Ports (Interfaces)
// =============================================================================

// HTTP Client Port
export type { HttpClientPort, HttpRequest, HttpResponse } from "./ports/http-client";

// STT Port
export type {
  StreamingSTTPort,
  StreamingCallbacks,
  TranscriptionResult,
} from "./ports/stt";

// TTS Port
export type { TTSProvider } from "./ports/tts";

// TTS Source Port
export type {
  TTSSourcePort,
  TTSFetchOptions,
  TTSAudioResult,
  PrefetchedAudio as TTSPrefetchedAudio,
} from "./ports/tts-source";

// VAD Port
export type { VADProvider, VADCallbacks, VADConfig } from "./ports/vad";
export { DEFAULT_VAD_CONFIG } from "./ports/vad";

// Turn Detector Port
export type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnPredictionReason,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "./ports/turn-detector";
export { DEFAULT_TURN_DETECTOR_CONFIG } from "./ports/turn-detector";

// Recording Port
export type {
  RecordingProvider,
  RecordingConfig,
  RecordingCallbacks,
  RecordingResult,
  RecordingState,
  RecordingTrack,
  RecordingFormat,
  TranscriptEntry,
  ConversationTranscript,
} from "./ports/recording";
export { DEFAULT_RECORDING_CONFIG } from "./ports/recording";

// =============================================================================
// Errors
// =============================================================================

export {
  VoiceKitError,
  NetworkError,
  AuthError,
  ConfigurationError,
  TranscriptionError,
  TTSError,
  VADError,
  TurnDetectionError,
  RecordingError,
  RateLimitError,
  TimeoutError,
  CancelledError,
  isVoiceKitError,
  isRetryableError,
  wrapError,
} from "./errors";
export type { VoiceKitErrorCode } from "./errors";

// =============================================================================
// Config
// =============================================================================

export {
  ENVIRONMENTS,
  ENDPOINTS,
  VOICE_PRESETS,
  DEFAULTS,
  getEnvironmentConfig,
  buildEndpointUrl,
  resolveVoiceId,
} from "./config";
export type { EnvironmentConfig } from "./config";

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

// TTS Player (Clean Architecture)
export {
  TTSPlayer,
  createTTSPlayer,
  pcm16ToFloat32,
  createAudioBuffer,
  alignPCMChunk,
} from "./core/tts-player";
export type { TTSPlayerConfig, TTSPlayerCallbacks } from "./core/tts-player";

// WAV Encoder (for recording)
export {
  encodeWAV,
  encodeWAVStereo,
  estimateWAVSize,
  calculateDuration,
} from "./core/wav-encoder";
export type { WAVEncoderOptions } from "./core/wav-encoder";

/**
 * @deprecated TTS Streaming is legacy. Use TTSPlayer for new code.
 *
 * These exports are maintained for backwards compatibility but will be removed in v1.0.
 * Migrate to: `import { TTSPlayer, createTTSPlayer } from "@kond.studio/voicekit"`
 */
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
/** @deprecated Use TTSPlayerConfig instead */
export type { TTSStreamingConfig, PreloadedAudio } from "./core/tts-streaming";

// TTS Queue
export { createTTSQueue, extractSentences, createSentenceAccumulator } from "./core/tts-queue";
export type { SentenceAccumulator } from "./core/tts-queue";

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

// Worklet Utilities (for custom audio pipeline)
export {
  loadAudioWorklet,
  getCDNWorkletUrl,
  getLatestCDNWorkletUrl,
} from "./core/worklet-loader";
export type { WorkletLoaderOptions } from "./core/worklet-loader";

// =============================================================================
// Adapters (Concrete Implementations)
// =============================================================================

// HTTP Client Adapters
export { FetchHttpClient, createFetchHttpClient } from "./adapters/http";
export type { FetchHttpClientConfig } from "./adapters/http";

// STT Adapters
export {
  DeepgramStreamingAdapter,
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  configureDeepgram,
  getDeepgramConfig,
} from "./adapters/stt";
export type { DeepgramConfig, TokenResponse } from "./adapters/stt";

// TTS Source Adapters (Clean Architecture)
export { HttpTTSSource, createHttpTTSSource } from "./adapters/tts";
export type { HttpTTSSourceConfig } from "./adapters/tts";

/**
 * @deprecated FetchTTSAdapter is legacy. Use HttpTTSSource for new code.
 *
 * These exports are maintained for backwards compatibility but will be removed in v1.0.
 * Migrate to: `import { HttpTTSSource, createHttpTTSSource } from "@kond.studio/voicekit"`
 */
export {
  FetchTTSAdapter,
  createFetchTTSAdapter,
  configureFetchTTS,
  getFetchTTSConfig,
} from "./adapters/tts";
/** @deprecated Use HttpTTSSourceConfig instead */
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
  // Mock
  MockTurnDetector,
  createMockTurnDetector,
} from "./adapters/turn-detector";
export type {
  HeuristicTurnDetectorOptions,
  OnnxTurnDetectorOptions,
  CloudTurnDetectorOptions,
  MockTurnDetectorOptions,
} from "./adapters/turn-detector";

// Advanced utilities for power users (Turn Detection ML)
export { BPETokenizer, ModelCache, getModelCache } from "./adapters/turn-detector";
export type { TokenizerConfig, ModelMetadata } from "./adapters/turn-detector";

// Recording Adapters
export {
  MediaRecorderAdapter,
  createMediaRecorderAdapter,
  AudioWorkletRecordingAdapter,
  createAudioWorkletRecorder,
  MockRecordingAdapter,
  createMockRecordingAdapter,
} from "./adapters/recording";
export type {
  MediaRecorderAdapterConfig,
  AudioWorkletRecorderConfig,
  MockRecordingAdapterConfig,
} from "./adapters/recording";

// =============================================================================
// Storage (BYOS - Bring Your Own Storage)
// =============================================================================

/**
 * Storage helpers for uploading recordings to popular providers.
 *
 * VoiceKit does NOT store your recordings - you choose where:
 * - AWS S3 / S3-compatible (R2, MinIO)
 * - Your own backend (custom uploader)
 *
 * @example S3 Upload
 * ```typescript
 * import { createS3Uploader } from "@kond.studio/voicekit";
 *
 * const storage = createS3Uploader({
 *   bucket: "my-recordings",
 *   region: "us-east-1",
 *   credentials: { accessKeyId: "...", secretAccessKey: "..." },
 * });
 *
 * // After recording stops:
 * const result = await storage.upload(recording);
 * ```
 */
export {
  // S3 Uploader
  S3Uploader,
  createS3Uploader,
  // Custom Uploader
  CustomUploader,
  createCustomUploader,
  buildFormDataUpload,
  // Utilities
  StorageError,
  getContentType,
  generateStoragePath,
} from "./storage";
export type {
  // Core interface
  StorageUploader,
  StorageUploadResult,
  StorageUploadOptions,
  PlaybackUrlOptions,
  StorageListOptions,
  // S3 types
  S3UploaderConfig,
  S3Credentials,
  // Custom types
  CustomUploaderConfig,
  CustomUploadFn,
  CustomGetUrlFn,
  CustomDeleteFn,
  FormDataUploadOptions,
  // Error types
  StorageErrorCode,
} from "./storage";
