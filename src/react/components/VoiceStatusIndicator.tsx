"use client";

/**
 * VoiceStatusIndicator - Minimal animated status indicator for voice conversations
 *
 * Adapted from KOND's understated aesthetic with:
 * - Configurable labels via props
 * - Configurable colors via props or CSS variables
 * - Optional framer-motion animations (falls back to CSS)
 *
 * @example
 * ```tsx
 * import { VoiceStatusIndicator } from "@kond.studio/voicekit/react";
 *
 * <VoiceStatusIndicator
 *   state={voice.state}
 *   userSpeaking={voice.userSpeaking}
 *   isActive={voice.isActive}
 * />
 * ```
 */

import React, { memo } from "react";
import type { ConversationState } from "../types";
import {
  ListeningIcon,
  RecordingIcon,
  ProcessingIcon,
  SpeakingIcon,
  SpinnerIcon,
} from "./VoiceIcons";

// =============================================================================
// Types
// =============================================================================

export type DisplayState = "connecting" | "listening" | "recording" | "processing" | "speaking";

export interface VoiceStatusLabels {
  connecting?: string;
  listening?: string;
  recording?: string;
  processing?: string;
  speaking?: string;
}

export interface VoiceStatusColors {
  connecting?: string;
  listening?: string;
  recording?: string;
  processing?: string;
  speaking?: string;
}

export interface VoiceStatusIndicatorProps {
  /** Current voice conversation state */
  state: ConversationState;
  /** Whether the user is currently speaking (VAD detected) */
  userSpeaking?: boolean;
  /** Whether voice conversation is active */
  isActive: boolean;
  /** Current transcript (optional, for display) */
  transcript?: string;
  /** Custom labels for each state */
  labels?: VoiceStatusLabels;
  /** Custom colors for each state */
  colors?: VoiceStatusColors;
  /** Additional className */
  className?: string;
  /** Whether to show labels (default: true on desktop) */
  showLabels?: boolean;
  /** Custom styles */
  style?: React.CSSProperties;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_LABELS: Required<VoiceStatusLabels> = {
  connecting: "Connecting",
  listening: "Listening",
  recording: "Recording",
  processing: "Processing",
  speaking: "Speaking",
};

const DEFAULT_COLORS: Required<VoiceStatusColors> = {
  connecting: "#404040",
  listening: "#00ff88",
  recording: "#e5e5e5",
  processing: "#737373",
  speaking: "#00d4ff",
};

// =============================================================================
// Utility: Try to use framer-motion for AnimatePresence
// =============================================================================

let AnimatePresence: React.ComponentType<{ children: React.ReactNode; mode?: "wait" | "sync" | "popLayout" }> | null = null;
let motion: typeof import("framer-motion").motion | null = null;

try {
  const fm = require("framer-motion");
  AnimatePresence = fm.AnimatePresence;
  motion = fm.motion;
} catch {
  // framer-motion not installed
}

// =============================================================================
// Status Dot Component
// =============================================================================

interface StatusDotProps {
  displayState: DisplayState;
  color: string;
}

function StatusDot({ displayState, color }: StatusDotProps) {
  switch (displayState) {
    case "connecting":
      return <SpinnerIcon size={12} color={color} />;
    case "listening":
      return <ListeningIcon size={8} color={color} />;
    case "recording":
      return <RecordingIcon size={8} color={color} />;
    case "processing":
      return <ProcessingIcon size={6} color={color} />;
    case "speaking":
      return <SpeakingIcon size={8} color={color} />;
    default:
      return <ListeningIcon size={8} color={color} />;
  }
}

// =============================================================================
// Main Component
// =============================================================================

export const VoiceStatusIndicator = memo(function VoiceStatusIndicator({
  state,
  userSpeaking = false,
  isActive,
  labels: customLabels,
  colors: customColors,
  className = "",
  showLabels = true,
  style,
}: VoiceStatusIndicatorProps) {
  if (!isActive) return null;

  const labels = { ...DEFAULT_LABELS, ...customLabels };
  const colors = { ...DEFAULT_COLORS, ...customColors };

  // Determine display state based on conversation state and user speaking
  const getDisplayState = (): DisplayState => {
    if (state === "connecting") return "connecting";
    if (state === "speaking") return "speaking";
    if (state === "triggered" || state === "streaming" || state === "processing") return "processing";
    if (userSpeaking) return "recording";
    return "listening";
  };

  const displayState = getDisplayState();
  const label = labels[displayState];
  const color = colors[displayState];

  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        ...style,
      }}
      className={className}
    >
      <StatusDot displayState={displayState} color={color} />
      {showLabels && (
        <span
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontFamily: "monospace",
            color,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );

  // Use AnimatePresence if available for smooth transitions
  if (AnimatePresence && motion) {
    const MotionDiv = motion.div;
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
        <AnimatePresence mode="wait">
          <MotionDiv
            key={displayState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </MotionDiv>
        </AnimatePresence>
      </div>
    );
  }

  // Fallback without animations
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      {content}
    </div>
  );
});

export default VoiceStatusIndicator;
