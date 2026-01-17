/**
 * VoiceKit UI Components
 *
 * Pre-styled components for voice conversations, inspired by KOND's brutalist design.
 * All components support:
 * - Configurable colors via props
 * - Optional framer-motion animations (falls back to CSS)
 * - Full TypeScript support
 *
 * @example
 * ```tsx
 * import { VoiceStatusIndicator, VoiceIcons } from "@kond.studio/voicekit/react";
 *
 * function VoiceUI() {
 *   const voice = useVoiceKit({ ... });
 *
 *   return (
 *     <div>
 *       <VoiceStatusIndicator
 *         state={voice.state}
 *         isActive={voice.isActive}
 *         userSpeaking={voice.userSpeaking}
 *       />
 *       <button onClick={voice.isActive ? voice.stop : voice.start}>
 *         {voice.isActive ? <VoiceIcons.Recording /> : <VoiceIcons.Mic />}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

// =============================================================================
// Components
// =============================================================================

export {
  VoiceStatusIndicator,
  default as VoiceStatusIndicatorDefault,
} from "./VoiceStatusIndicator";
export type {
  VoiceStatusIndicatorProps,
  VoiceStatusLabels,
  VoiceStatusColors,
  DisplayState,
} from "./VoiceStatusIndicator";

export {
  VoiceIcons,
  default as VoiceIconsDefault,
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
} from "./VoiceIcons";
export type { IconProps } from "./VoiceIcons";
