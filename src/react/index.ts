/**
 * @kond.studio/voicekit/react
 *
 * React bindings for VoiceKit
 *
 * @example Simple usage with useVoiceKit
 * ```tsx
 * import { useVoiceKit } from "@kond.studio/voicekit/react";
 *
 * function App() {
 *   const voice = useVoiceKit({
 *     locale: "fr",
 *     onTranscript: async (text) => {
 *       const response = await myLLM.generate(text);
 *       voice.speak(response);
 *     },
 *   });
 *
 *   return <button onClick={voice.start}>Parler</button>;
 * }
 * ```
 *
 * @example Full-featured usage with useVoiceConversation
 * ```tsx
 * import { useVoiceConversation } from "@kond.studio/voicekit/react";
 *
 * function App() {
 *   const voice = useVoiceConversation({
 *     locale: "fr",
 *     sendMessage: myLLM.generate,
 *     onUserMessage: (text) => addToChat(text),
 *     cancelTTS: () => stopTTS(),
 *     idleTimeoutMs: 60000,
 *   });
 *
 *   // 9 states: idle | connecting | listening | vad_cooldown | triggered | streaming | processing | speaking | cooldown
 *   return <p>State: {voice.state}</p>;
 * }
 * ```
 */

// =============================================================================
// Orchestrators (Entry Points)
// =============================================================================

// Simple API
export { useVoiceKit, default as useVoiceKitDefault } from "./use-voice-kit";
export type { UseVoiceKitOptions, UseVoiceKitReturn } from "./use-voice-kit";

// Full-featured (KOND-level quality)
export { useVoiceConversation } from "./use-voice-conversation";
export type {
  UseVoiceConversationOptions,
  UseVoiceConversationReturn,
} from "./types";

// =============================================================================
// Composable Hooks (Building Blocks)
// =============================================================================

export * from "./hooks";

// =============================================================================
// Components
// =============================================================================

export { VoiceButton, default as VoiceButtonDefault } from "./VoiceButton";
export type { VoiceButtonProps } from "./VoiceButton";

// UI Components (KOND-inspired)
export {
  VoiceStatusIndicator,
  VoiceWaveform,
  VoiceIcons,
  // Individual icon exports
  MicIcon,
  WaveformIcon,
  IdleIcon,
  ListeningIcon,
  RecordingIcon,
  ProcessingIcon,
  SpeakingIcon,
  SpinnerIcon,
  RecordingWaveform,
  SendIcon,
  // Premium icons
  BargeInIcon,
  VADMeterIcon,
  AnimatedVADMeter,
} from "./components";
export type {
  VoiceStatusIndicatorProps,
  VoiceStatusLabels,
  VoiceStatusColors,
  DisplayState,
  VoiceWaveformProps,
  WaveformSize,
  IconProps,
  VADMeterIconProps,
  AnimatedVADMeterProps,
} from "./components";

// =============================================================================
// Types
// =============================================================================

// Re-export types for convenience
export type {
  Locale,
  ConversationState,
  TraceEvent,
  VoiceKitError,
  VoiceKitConfig,
} from "./types";
export { DEFAULT_CONFIG } from "./types";

// Voice conversation specific types
export type {
  AutoStopReason,
  InterruptionContext,
  TranscriptionResult,
  DeepgramCallbacks,
  AudioSetupResult,
  UseVoiceTimeoutsOptions,
  UseVoiceTimeoutsReturn,
  UseTurnCoordinationOptions,
  UseTurnCoordinationReturn,
  UseLLMIntegrationOptions,
  UseLLMIntegrationReturn,
} from "./types";

// Timeout constants
export {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_SESSION_MS,
  DEFAULT_SPEECH_FINAL_DELAY_MS,
  TRIGGERED_TIMEOUT_MS,
  SILENCE_FALLBACK_MS,
  SPEECH_HYSTERESIS_MS,
  STREAMING_SAFETY_TIMEOUT_MS,
  VAD_COOLDOWN_MS,
  MAX_UTTERANCE_MS,
} from "./types";
