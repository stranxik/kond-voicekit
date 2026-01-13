/**
 * VoiceKit React Composable Hooks
 *
 * Building blocks for voice conversation applications.
 * Use these hooks directly if you need fine-grained control,
 * or use useVoiceConversation for a full-featured orchestration.
 *
 * @example Basic usage with composable hooks
 * ```tsx
 * import {
 *   useAudioSetup,
 *   useSTTConnection,
 *   useVoiceTimeouts,
 *   useTurnCoordination,
 * } from "@kond/voicekit/react/hooks";
 *
 * function CustomVoice() {
 *   const audio = useAudioSetup({ debug: true });
 *   const stt = useSTTConnection({ userId: "user-123" });
 *   const turn = useTurnCoordination({
 *     speechFinalDelayMs: 800,
 *     onTurnComplete: (text) => console.log("User said:", text),
 *     onBargeIn: () => console.log("User interrupted"),
 *     onSpeechActivity: (speaking) => console.log("Speaking:", speaking),
 *   });
 *
 *   // Custom orchestration...
 * }
 * ```
 */

// Audio Setup - MediaStream, AudioContext, AudioWorklet lifecycle
export { useAudioSetup } from "./use-audio-setup";
export type { UseAudioSetupReturn } from "./use-audio-setup";

// STT Connection - WebSocket connection with exponential backoff
export { useSTTConnection } from "./use-stt-connection";
export type { UseSTTConnectionReturn, STTCallbacks } from "./use-stt-connection";

// Voice Timeouts - 8 timeout types for robust conversation handling
export { useVoiceTimeouts } from "./use-voice-timeouts";
export type { UseVoiceTimeoutsReturn } from "./use-voice-timeouts";

// Turn Coordination - TurnManager wrapper for intelligent turn-taking
export { useTurnCoordination } from "./use-turn-coordination";
export type { UseTurnCoordinationReturn } from "./use-turn-coordination";

// LLM Integration - Early LLM triggering and response buffering
export { useLlmIntegration } from "./use-llm-integration";
export type { UseLlmIntegrationReturn } from "./use-llm-integration";

// Silero VAD - ML-based voice activity detection
export { useSileroVAD } from "./use-silero-vad";
export type { UseSileroVADReturn } from "./use-silero-vad";

// Turn Detector - Auto-selects heuristic/cloud/onnx based on device capability
export { useTurnDetector, createTurnDetector } from "./use-turn-detector";
export type {
  UseTurnDetectorReturn,
  UseTurnDetectorOptions,
  TurnDetectorType,
} from "./use-turn-detector";
