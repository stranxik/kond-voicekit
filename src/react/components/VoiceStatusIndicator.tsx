"use client";

/**
 * VoiceStatusIndicator - Premium animated status indicator for voice conversations
 *
 * Features:
 * - Glow effect for listening state (box-shadow pulsing)
 * - Ripple effect for speaking state
 * - Thinking dots for processing
 * - Pulse effect for recording
 * - Configurable labels and colors via props
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

// =============================================================================
// Types
// =============================================================================

export type DisplayState = "connecting" | "listening" | "recording" | "processing" | "speaking" | "interrupted";

export interface VoiceStatusLabels {
  connecting?: string;
  listening?: string;
  recording?: string;
  processing?: string;
  speaking?: string;
  interrupted?: string;
}

export interface VoiceStatusColors {
  connecting?: string;
  listening?: string;
  recording?: string;
  processing?: string;
  speaking?: string;
  interrupted?: string;
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
  /** Whether a barge-in/interruption just occurred */
  wasInterrupted?: boolean;
  /** Custom labels for each state */
  labels?: VoiceStatusLabels;
  /** Custom colors for each state */
  colors?: VoiceStatusColors;
  /** Additional className */
  className?: string;
  /** Whether to show labels (default: true on desktop) */
  showLabels?: boolean;
  /** Whether to show glow effects (default: true) */
  showGlow?: boolean;
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
  interrupted: "Interrupted",
};

const DEFAULT_COLORS: Required<VoiceStatusColors> = {
  connecting: "#404040",
  listening: "#00ff88",
  recording: "#e5e5e5",
  processing: "#737373",
  speaking: "#00d4ff",
  interrupted: "#ff9500",
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

// CSS fallback keyframes (injected once)
const KEYFRAMES_INJECTED = { current: false };
function injectKeyframes() {
  if (KEYFRAMES_INJECTED.current || typeof document === "undefined") return;
  KEYFRAMES_INJECTED.current = true;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes vk-status-glow {
      0%, 100% {
        opacity: 0.6;
        box-shadow: 0 0 8px currentColor;
      }
      50% {
        opacity: 1;
        box-shadow: 0 0 16px currentColor;
      }
    }
    @keyframes vk-status-pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.7; }
    }
    @keyframes vk-status-record-pulse {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    @keyframes vk-status-dots {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    @keyframes vk-status-ripple {
      0% { transform: scale(1); opacity: 0.4; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes vk-status-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes vk-status-interrupted {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.9); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

// =============================================================================
// Status Dot Component - Premium Animated Version
// =============================================================================

interface StatusDotProps {
  displayState: DisplayState;
  color: string;
  showGlow?: boolean;
}

function StatusDot({ displayState, color, showGlow = true }: StatusDotProps) {
  injectKeyframes();
  const baseSize = 8;
  const sizeStyle = `${baseSize}px`;

  switch (displayState) {
    case "connecting":
      // Spinner for connecting
      return (
        <svg
          style={{
            width: "12px",
            height: "12px",
            animation: "vk-status-spin 1s linear infinite"
          }}
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            style={{ opacity: 0.25 }}
            cx="12"
            cy="12"
            r="10"
            stroke={color}
            strokeWidth="2"
          />
          <path
            style={{ opacity: 0.75 }}
            fill={color}
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      );

    case "listening":
      // Glow effect for listening - ready state
      if (motion) {
        const MotionDiv = motion.div;
        return (
          <MotionDiv
            style={{
              width: sizeStyle,
              height: sizeStyle,
              backgroundColor: color,
              color: color,
            }}
            animate={showGlow ? {
              opacity: [0.6, 1, 0.6],
              boxShadow: [
                `0 0 8px ${color}`,
                `0 0 16px ${color}`,
                `0 0 8px ${color}`,
              ]
            } : {
              opacity: [0.6, 1, 0.6]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        );
      }
      return (
        <div
          style={{
            width: sizeStyle,
            height: sizeStyle,
            backgroundColor: color,
            color: color,
            animation: showGlow ? "vk-status-glow 2s ease-in-out infinite" : "vk-pulse 2s ease-in-out infinite",
          }}
        />
      );

    case "recording":
      // Quick pulse for recording - capturing
      if (motion) {
        const MotionDiv = motion.div;
        return (
          <MotionDiv
            style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut" }}
          />
        );
      }
      return (
        <div
          style={{
            width: sizeStyle,
            height: sizeStyle,
            backgroundColor: color,
            animation: "vk-status-record-pulse 0.4s ease-in-out infinite",
          }}
        />
      );

    case "processing":
      // Thinking dots
      if (motion) {
        const MotionDiv = motion.div;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            {[0, 1, 2].map((i) => (
              <MotionDiv
                key={i}
                style={{ width: "6px", height: "6px", backgroundColor: color }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        );
      }
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: "6px",
                height: "6px",
                backgroundColor: color,
                animation: `vk-status-dots 0.6s ease-in-out infinite`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      );

    case "speaking":
      // Ripple effect for speaking
      const containerSize = baseSize * 2;
      if (motion) {
        const MotionDiv = motion.div;
        return (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: `${containerSize}px`,
              height: `${containerSize}px`,
            }}
          >
            <MotionDiv
              style={{
                position: "absolute",
                inset: 0,
                border: `1px solid ${color}`,
              }}
              animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
            />
            <div style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }} />
          </div>
        );
      }
      return (
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: `${containerSize}px`,
            height: `${containerSize}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: `1px solid ${color}`,
              animation: "vk-status-ripple 1s ease-out infinite",
            }}
          />
          <div style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }} />
        </div>
      );

    case "interrupted":
      // Flash effect for interruption
      if (motion) {
        const MotionDiv = motion.div;
        return (
          <MotionDiv
            style={{
              width: sizeStyle,
              height: sizeStyle,
              backgroundColor: color,
            }}
            animate={{
              opacity: [1, 0.6, 1],
              scale: [1, 0.9, 1]
            }}
            transition={{ duration: 0.3, repeat: 2, ease: "easeInOut" }}
          />
        );
      }
      return (
        <div
          style={{
            width: sizeStyle,
            height: sizeStyle,
            backgroundColor: color,
            animation: "vk-status-interrupted 0.3s ease-in-out 2",
          }}
        />
      );

    default:
      return (
        <div
          style={{
            width: sizeStyle,
            height: sizeStyle,
            backgroundColor: color,
          }}
        />
      );
  }
}

// =============================================================================
// Main Component
// =============================================================================

export const VoiceStatusIndicator = memo(function VoiceStatusIndicator({
  state,
  userSpeaking = false,
  isActive,
  wasInterrupted = false,
  labels: customLabels,
  colors: customColors,
  className = "",
  showLabels = true,
  showGlow = true,
  style,
}: VoiceStatusIndicatorProps) {
  if (!isActive) return null;

  const labels = { ...DEFAULT_LABELS, ...customLabels };
  const colors = { ...DEFAULT_COLORS, ...customColors };

  // Determine display state based on conversation state, user speaking, and interruption
  const getDisplayState = (): DisplayState => {
    // Show interrupted state briefly when barge-in occurs
    if (wasInterrupted && (state === "listening" || state === "vad_cooldown")) {
      return "interrupted";
    }
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
      <StatusDot displayState={displayState} color={color} showGlow={showGlow} />
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
