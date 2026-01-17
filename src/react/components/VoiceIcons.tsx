"use client";

/**
 * VoiceIcons - Animated icons for voice states
 *
 * Adapted from KOND's minimal voice icons with:
 * - Configurable colors via props or CSS variables
 * - Optional framer-motion animations (falls back to CSS)
 *
 * @example
 * ```tsx
 * import { VoiceIcons } from "@kond.studio/voicekit/react";
 *
 * // Use individual icons
 * <VoiceIcons.Listening color="#00ff88" />
 * <VoiceIcons.Speaking color="#00d4ff" />
 * ```
 */

import React from "react";

// =============================================================================
// Types
// =============================================================================

export interface IconProps {
  /** Icon size class or pixel value */
  size?: string | number;
  /** Icon color (CSS color value) */
  color?: string;
  /** Additional className */
  className?: string;
}

// =============================================================================
// Utility: Try to use framer-motion, fallback to CSS animations
// =============================================================================

let motion: typeof import("framer-motion").motion | null = null;
try {
  // Dynamic import for optional framer-motion
  const fm = require("framer-motion");
  motion = fm.motion;
} catch {
  // framer-motion not installed, will use CSS fallback
}

// CSS fallback keyframes (injected once)
const KEYFRAMES_INJECTED = { current: false };
function injectKeyframes() {
  if (KEYFRAMES_INJECTED.current || typeof document === "undefined") return;
  KEYFRAMES_INJECTED.current = true;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes vk-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes vk-pulse-fast {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    @keyframes vk-dots {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    @keyframes vk-ripple {
      0% { transform: scale(1); opacity: 0.4; }
      100% { transform: scale(1.5); opacity: 0; }
    }
    @keyframes vk-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes vk-wave {
      0%, 100% { height: 8px; }
      50% { height: 16px; }
    }
  `;
  document.head.appendChild(style);
}

// =============================================================================
// Icon Components
// =============================================================================

/**
 * Microphone icon (static)
 */
export function MicIcon({ size = "1rem", color = "currentColor", className = "" }: IconProps) {
  const sizeStyle = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={className}
      style={{ width: sizeStyle, height: sizeStyle }}
      viewBox="0 0 24 24"
      fill={color}
    >
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

/**
 * Waveform icon (static) - for idle/voice toggle
 */
export function WaveformIcon({ size = "1rem", color = "currentColor", className = "" }: IconProps) {
  const sizeStyle = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={className}
      style={{ width: sizeStyle, height: sizeStyle }}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <path d="M12 3v18M8 8v8M16 8v8M4 11v2M20 11v2" />
    </svg>
  );
}

/**
 * Idle voice icon - waveform style
 */
export function IdleIcon({ size = "1rem", color = "currentColor", className = "" }: IconProps) {
  return <WaveformIcon size={size} color={color} className={className} />;
}

/**
 * Listening indicator - steady glow dot
 */
export function ListeningIcon({ size = 8, color = "#00ff88", className = "" }: IconProps) {
  injectKeyframes();
  const sizeStyle = typeof size === "number" ? `${size}px` : size;

  if (motion) {
    const MotionDiv = motion.div;
    return (
      <MotionDiv
        className={className}
        style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: sizeStyle,
        height: sizeStyle,
        backgroundColor: color,
        animation: "vk-pulse 2s ease-in-out infinite",
      }}
    />
  );
}

/**
 * Recording indicator - quick pulse white dot
 */
export function RecordingIcon({ size = 8, color = "#e5e5e5", className = "" }: IconProps) {
  injectKeyframes();
  const sizeStyle = typeof size === "number" ? `${size}px` : size;

  if (motion) {
    const MotionDiv = motion.div;
    return (
      <MotionDiv
        className={className}
        style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: sizeStyle,
        height: sizeStyle,
        backgroundColor: color,
        animation: "vk-pulse-fast 0.4s ease-in-out infinite",
      }}
    />
  );
}

/**
 * Processing indicator - thinking dots
 */
export function ProcessingIcon({ size = 6, color = "#737373", className = "" }: IconProps) {
  injectKeyframes();
  const sizeStyle = typeof size === "number" ? `${size}px` : size;

  if (motion) {
    const MotionDiv = motion.div;
    return (
      <div className={className} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        {[0, 1, 2].map((i) => (
          <MotionDiv
            key={i}
            style={{ width: sizeStyle, height: sizeStyle, backgroundColor: color }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: sizeStyle,
            height: sizeStyle,
            backgroundColor: color,
            animation: `vk-dots 0.6s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Speaking icon - soft ripple effect
 */
export function SpeakingIcon({ size = 8, color = "#00d4ff", className = "" }: IconProps) {
  injectKeyframes();
  const containerSize = typeof size === "number" ? size * 2 : size;
  const dotSize = typeof size === "number" ? `${size}px` : size;
  const containerStyle = typeof containerSize === "number" ? `${containerSize}px` : containerSize;

  if (motion) {
    const MotionDiv = motion.div;
    return (
      <div
        className={className}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: containerStyle,
          height: containerStyle,
        }}
      >
        <MotionDiv
          style={{
            position: "absolute",
            inset: 0,
            border: `1px solid ${color}`,
          }}
          animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
        />
        <div style={{ width: dotSize, height: dotSize, backgroundColor: color }} />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: containerStyle,
        height: containerStyle,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `1px solid ${color}`,
          animation: "vk-ripple 1s ease-out infinite",
        }}
      />
      <div style={{ width: dotSize, height: dotSize, backgroundColor: color }} />
    </div>
  );
}

/**
 * Spinner icon - for connecting/transcribing states
 */
export function SpinnerIcon({ size = "1.25rem", color = "currentColor", className = "" }: IconProps) {
  injectKeyframes();
  const sizeStyle = typeof size === "number" ? `${size}px` : size;

  return (
    <svg
      className={className}
      style={{ width: sizeStyle, height: sizeStyle, animation: "vk-spin 1s linear infinite" }}
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
}

/**
 * Recording waveform - animated bars
 */
export function RecordingWaveform({ size = 20, color = "currentColor", className = "" }: IconProps) {
  injectKeyframes();
  const containerSize = typeof size === "number" ? `${size}px` : size;

  if (motion) {
    const MotionDiv = motion.div;
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
          height: containerSize,
          width: containerSize,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <MotionDiv
            key={i}
            style={{ width: "2px", backgroundColor: color, borderRadius: "9999px" }}
            animate={{ height: ["8px", "16px", "8px"] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        height: containerSize,
        width: containerSize,
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: "2px",
            backgroundColor: color,
            borderRadius: "9999px",
            height: "8px",
            animation: "vk-wave 0.5s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Send arrow icon
 */
export function SendIcon({ size = "1rem", color = "currentColor", className = "" }: IconProps) {
  const sizeStyle = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={className}
      style={{ width: sizeStyle, height: sizeStyle }}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

// =============================================================================
// Namespace export for convenience
// =============================================================================

export const VoiceIcons = {
  Mic: MicIcon,
  Waveform: WaveformIcon,
  Idle: IdleIcon,
  Listening: ListeningIcon,
  Recording: RecordingIcon,
  Processing: ProcessingIcon,
  Speaking: SpeakingIcon,
  Spinner: SpinnerIcon,
  RecordingWaveform,
  Send: SendIcon,
};

export default VoiceIcons;
