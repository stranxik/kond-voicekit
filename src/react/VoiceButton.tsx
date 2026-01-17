"use client";

/**
 * VoiceButton - Voice conversation button with KOND-inspired styling
 *
 * A ready-to-use button that handles voice conversation state.
 * Includes built-in KOND brutalist styling with animated icons.
 *
 * @example Basic usage with default styling
 * ```tsx
 * import { VoiceButton } from "@kond.studio/voicekit/react";
 *
 * function App() {
 *   return (
 *     <VoiceButton
 *       onTranscript={async (text) => {
 *         const response = await myLLM.chat(text);
 *         return response; // Will be spoken by TTS
 *       }}
 *     />
 *   );
 * }
 * ```
 *
 * @example Minimal variant (text only, no built-in styles)
 * ```tsx
 * <VoiceButton variant="minimal" className="my-custom-styles" />
 * ```
 *
 * @example Custom render with children
 * ```tsx
 * <VoiceButton>
 *   {({ state, isActive, start, stop }) => (
 *     <MyCustomButton onClick={isActive ? stop : start}>
 *       {state}
 *     </MyCustomButton>
 *   )}
 * </VoiceButton>
 * ```
 */

import React from "react";
import { useVoiceKit, type UseVoiceKitOptions } from "./use-voice-kit";
import type { ConversationState } from "../types/config";
import {
  MicIcon,
  WaveformIcon,
  ListeningIcon,
  RecordingIcon,
  ProcessingIcon,
  SpeakingIcon,
  SpinnerIcon,
} from "./components/VoiceIcons";

// =============================================================================
// Types
// =============================================================================

export interface VoiceButtonProps extends UseVoiceKitOptions {
  /** Button variant: "styled" (KOND design) or "minimal" (text only, BYO styles) */
  variant?: "styled" | "minimal";
  /** Custom className for styling */
  className?: string;
  /** Custom text labels for each state (used in minimal variant or as aria-label) */
  labels?: Partial<Record<ConversationState, string>>;
  /** Render custom content instead of default button */
  children?: (props: {
    state: ConversationState;
    isActive: boolean;
    isSpeaking: boolean;
    start: () => Promise<void>;
    stop: () => void;
  }) => React.ReactNode;
  /** Button disabled state */
  disabled?: boolean;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** Size of the button (styled variant only) */
  size?: "sm" | "md" | "lg";
  /** Show label text alongside icon (styled variant only) */
  showLabel?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LABELS: Record<ConversationState, string> = {
  idle: "Start Voice",
  connecting: "Connecting...",
  listening: "Listening...",
  vad_cooldown: "Processing...",
  triggered: "Thinking...",
  streaming: "Responding...",
  processing: "Processing...",
  speaking: "Speaking...",
  cooldown: "Finishing...",
};

// KOND Design System Colors
const COLORS = {
  bg: "#0a0a0a",
  text: "#e5e5e5",
  accent: "#00ff88",
  border: "#262626",
  muted: "#404040",
  speaking: "#00d4ff",
  recording: "#e5e5e5",
};

// Size configurations
const SIZES = {
  sm: { button: 32, icon: 14, fontSize: 10 },
  md: { button: 40, icon: 16, fontSize: 11 },
  lg: { button: 48, icon: 20, fontSize: 12 },
};

// =============================================================================
// Helper: Get icon for state
// =============================================================================

function getStateIcon(
  state: ConversationState,
  userSpeaking: boolean,
  iconSize: number
): React.ReactNode {
  switch (state) {
    case "idle":
      return <WaveformIcon size={iconSize} color={COLORS.muted} />;
    case "connecting":
      return <SpinnerIcon size={iconSize} color={COLORS.muted} />;
    case "listening":
    case "vad_cooldown":
    case "cooldown":
      return userSpeaking ? (
        <RecordingIcon size={iconSize - 2} color={COLORS.recording} />
      ) : (
        <ListeningIcon size={iconSize - 2} color={COLORS.accent} />
      );
    case "triggered":
    case "streaming":
    case "processing":
      return <ProcessingIcon size={iconSize - 4} color={COLORS.muted} />;
    case "speaking":
      return <SpeakingIcon size={iconSize - 2} color={COLORS.speaking} />;
    default:
      return <MicIcon size={iconSize} color={COLORS.muted} />;
  }
}

// =============================================================================
// Helper: Get border color for state
// =============================================================================

function getStateBorderColor(state: ConversationState, userSpeaking: boolean): string {
  switch (state) {
    case "listening":
    case "vad_cooldown":
    case "cooldown":
      return userSpeaking ? COLORS.recording : COLORS.accent;
    case "speaking":
      return COLORS.speaking;
    case "triggered":
    case "streaming":
    case "processing":
      return COLORS.muted;
    default:
      return COLORS.border;
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * VoiceButton component for voice conversations
 */
export function VoiceButton({
  variant = "styled",
  className,
  labels,
  children,
  disabled,
  style,
  size = "md",
  showLabel = false,
  ...voiceOptions
}: VoiceButtonProps) {
  const voice = useVoiceKit(voiceOptions);
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };
  const sizeConfig = SIZES[size];

  // Detect if user is actively speaking based on state
  const isUserSpeaking = voice.state === "vad_cooldown" || voice.state === "triggered";

  // Allow custom render
  if (children) {
    return (
      <>
        {children({
          state: voice.state,
          isActive: voice.isActive,
          isSpeaking: voice.isSpeaking,
          start: voice.start,
          stop: voice.stop,
        })}
      </>
    );
  }

  const handleClick = () => {
    if (voice.isActive) {
      voice.stop();
    } else {
      voice.start();
    }
  };

  const isDisabled = disabled || voice.state === "connecting";
  const label = mergedLabels[voice.state];

  // Minimal variant - just text, user provides styles
  if (variant === "minimal") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={className}
        style={style}
        aria-label={voice.isActive ? "Stop voice conversation" : "Start voice conversation"}
      >
        {label}
      </button>
    );
  }

  // Styled variant - KOND brutalist design
  const borderColor = getStateBorderColor(voice.state, isUserSpeaking);
  const icon = getStateIcon(voice.state, isUserSpeaking, sizeConfig.icon);

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: showLabel ? "8px" : 0,
    width: showLabel ? "auto" : sizeConfig.button,
    height: sizeConfig.button,
    padding: showLabel ? "0 12px" : 0,
    backgroundColor: "transparent",
    border: `1px solid ${borderColor}`,
    borderRadius: 0, // Brutalist
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.5 : 1,
    transition: "border-color 0.15s ease, opacity 0.15s ease",
    ...style,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: sizeConfig.fontSize,
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: COLORS.text,
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={className}
      style={buttonStyle}
      aria-label={voice.isActive ? "Stop voice conversation" : "Start voice conversation"}
      title={label}
    >
      {icon}
      {showLabel && <span style={labelStyle}>{label}</span>}
    </button>
  );
}

export default VoiceButton;
