/**
 * VoiceKit UI Components
 *
 * Pre-styled components for voice conversations, inspired by KOND's brutalist design.
 * All components support:
 * - Configurable colors via props
 * - Optional framer-motion animations (falls back to CSS)
 * - Full TypeScript support
 *
 * Premium Features:
 * - Glow effects for listening state
 * - Ripple effects for speaking state
 * - Barge-in/interruption indicators
 * - Real-time VAD visualization
 * - Audio level waveforms
 *
 * @example
 * ```tsx
 * import { VoiceStatusIndicator, VoiceWaveform, VoiceIcons } from "@kond.studio/voicekit/react";
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
 *         showGlow={true}
 *       />
 *       <VoiceWaveform
 *         isActive={voice.isActive && voice.userSpeaking}
 *         audioLevel={voice.audioLevel}
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
  VoiceWaveform,
  default as VoiceWaveformDefault,
} from "./VoiceWaveform";
export type {
  VoiceWaveformProps,
  WaveformSize,
} from "./VoiceWaveform";

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
  // New premium icons
  BargeInIcon,
  VADMeterIcon,
  AnimatedVADMeter,
} from "./VoiceIcons";
export type { IconProps, VADMeterIconProps, AnimatedVADMeterProps } from "./VoiceIcons";
