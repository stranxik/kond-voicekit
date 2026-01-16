/**
 * VoiceKit Core - Internal signal processing and conversation logic
 */

// Turn Manager - Signal fusion for turn-taking decisions
export { createTurnManager } from "./turn-manager";
export type { TurnManager, TurnManagerConfig } from "./turn-manager";

// End-of-Utterance Detection
export { detectEndOfUtterance, isUtteranceComplete, explainEOUResult } from "./eou-detector";
export type { EOUResult, EOUReason, EOUContext } from "./eou-detector";

// Trigger Detection (early LLM triggering, backchannels)
export {
  shouldTriggerEarly,
  isBackchannel,
  isLikelyIncomplete,
  isLikelyComplete,
  analyzeTrigger,
  analyzeLinguisticSignals,
} from "./trigger-detector";
export type { TriggerState, LinguisticSignals } from "./trigger-detector";

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
} from "./tts-streaming";
export type { TTSStreamingConfig, PreloadedAudio } from "./tts-streaming";

// TTS Queue (progressive playback)
export { createTTSQueue, extractSentences, createSentenceAccumulator } from "./tts-queue";

// TTS Model Router
export { selectTtsModel, selectTtsModelWithReason, isShortAcknowledgment } from "./tts-model-router";
export type { TtsModel, TtsContext, TtsModelSelection } from "./tts-model-router";

// Text Sanitization
export { sanitizeForTTS, hasVisualBlocks } from "./sanitize-for-tts";

// Sentence Chunker
export { extractSentences as chunkSentences } from "./sentence-chunker";

// Device Capability Detection
export { isDeviceCapableForLocalML, getDeviceCapabilitySummary } from "./utils/device-capability";

// Browser Utilities
export {
  isIOS,
  isSafari,
  getIOSVersion,
  isVADSupported,
  isVoiceConversationSupported,
  ensureAudioContextResumed,
  sleep,
} from "./utils/browser";

// Worklet Loader (smart loading with fallbacks)
export {
  loadAudioWorklet,
  getCDNWorkletUrl,
  getLatestCDNWorkletUrl,
} from "./worklet-loader";
export type { WorkletLoaderOptions } from "./worklet-loader";

// Worklet Source (embedded code)
export { AUDIO_PROCESSOR_WORKLET_SOURCE, WORKLET_VERSION } from "./worklet-source";
