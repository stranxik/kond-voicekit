"use client";

/**
 * VoiceWaveform - Real-time audio level visualization
 *
 * Displays animated bars that respond to audio input levels.
 * Supports both framer-motion and CSS fallback animations.
 *
 * @example
 * ```tsx
 * import { VoiceWaveform } from "@kond.studio/voicekit/react";
 *
 * // Basic usage with manual audio level
 * <VoiceWaveform isActive={isRecording} audioLevel={0.7} />
 *
 * // With custom styling
 * <VoiceWaveform
 *   isActive={isRecording}
 *   audioLevel={micLevel}
 *   color="#00ff88"
 *   barCount={7}
 *   size="lg"
 * />
 * ```
 */

import React, { memo, useEffect, useState, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

export type WaveformSize = "sm" | "md" | "lg" | number;

export interface VoiceWaveformProps {
  /** Whether the waveform is active/visible */
  isActive: boolean;
  /** Audio level from 0 to 1 (optional - will animate randomly if not provided) */
  audioLevel?: number;
  /** Primary color for the bars */
  color?: string;
  /** Number of bars (default: 5) */
  barCount?: number;
  /** Size preset or pixel value */
  size?: WaveformSize;
  /** Gap between bars in pixels */
  gap?: number;
  /** Minimum bar height as percentage */
  minHeight?: number;
  /** Maximum bar height as percentage */
  maxHeight?: number;
  /** Additional className */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Whether to show subtle glow effect */
  showGlow?: boolean;
}

// =============================================================================
// Utility: Size mapping
// =============================================================================

function getSizeValue(size: WaveformSize): number {
  if (typeof size === "number") return size;
  switch (size) {
    case "sm":
      return 20;
    case "md":
      return 32;
    case "lg":
      return 48;
    default:
      return 32;
  }
}

// =============================================================================
// Utility: Try to use framer-motion
// =============================================================================

let motion: typeof import("framer-motion").motion | null = null;
let AnimatePresence: React.ComponentType<{ children: React.ReactNode }> | null = null;

try {
  const fm = require("framer-motion");
  motion = fm.motion;
  AnimatePresence = fm.AnimatePresence;
} catch {
  // framer-motion not installed
}

// CSS fallback keyframes
const KEYFRAMES_INJECTED = { current: false };
function injectKeyframes() {
  if (KEYFRAMES_INJECTED.current || typeof document === "undefined") return;
  KEYFRAMES_INJECTED.current = true;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes vk-waveform-bar-0 {
      0%, 100% { height: 30%; }
      50% { height: 70%; }
    }
    @keyframes vk-waveform-bar-1 {
      0%, 100% { height: 50%; }
      50% { height: 90%; }
    }
    @keyframes vk-waveform-bar-2 {
      0%, 100% { height: 40%; }
      50% { height: 100%; }
    }
    @keyframes vk-waveform-bar-3 {
      0%, 100% { height: 55%; }
      50% { height: 85%; }
    }
    @keyframes vk-waveform-bar-4 {
      0%, 100% { height: 35%; }
      50% { height: 75%; }
    }
    @keyframes vk-waveform-idle {
      0%, 100% { height: 20%; }
      50% { height: 40%; }
    }
  `;
  document.head.appendChild(style);
}

// =============================================================================
// Main Component
// =============================================================================

export const VoiceWaveform = memo(function VoiceWaveform({
  isActive,
  audioLevel,
  color = "#00ff88",
  barCount = 5,
  size = "md",
  gap = 2,
  minHeight = 20,
  maxHeight = 100,
  className = "",
  style,
  showGlow = false,
}: VoiceWaveformProps) {
  injectKeyframes();

  const containerSize = getSizeValue(size);
  const barWidth = Math.max(2, (containerSize - gap * (barCount - 1)) / barCount / 1.5);

  // Generate pseudo-random heights for each bar based on audio level
  const getBarHeight = (index: number, level: number): number => {
    if (level === 0) return minHeight;

    // Create varied heights based on bar position and audio level
    const variation = Math.sin(index * 1.3) * 0.3 + 0.7;
    const baseHeight = minHeight + (maxHeight - minHeight) * level * variation;

    // Add some randomness for natural look
    const randomFactor = 0.9 + Math.random() * 0.2;
    return Math.min(maxHeight, Math.max(minHeight, baseHeight * randomFactor));
  };

  // For idle animation when no audioLevel is provided
  const [idleHeights, setIdleHeights] = useState<number[]>(
    Array(barCount).fill(minHeight)
  );

  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isActive || audioLevel !== undefined) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    // Animate idle state when no audio level is provided
    let frame = 0;
    const animate = () => {
      frame++;
      const newHeights = Array(barCount)
        .fill(0)
        .map((_, i) => {
          const phase = (frame * 0.05 + i * 0.7) % (Math.PI * 2);
          const height = minHeight + (maxHeight - minHeight) * 0.6 * (0.5 + 0.5 * Math.sin(phase));
          return height;
        });
      setIdleHeights(newHeights);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, audioLevel, barCount, minHeight, maxHeight]);

  if (!isActive) return null;

  const heights =
    audioLevel !== undefined
      ? Array(barCount)
          .fill(0)
          .map((_, i) => getBarHeight(i, audioLevel))
      : idleHeights;

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: `${gap}px`,
    width: `${containerSize}px`,
    height: `${containerSize}px`,
    ...style,
  };

  if (showGlow) {
    containerStyle.filter = `drop-shadow(0 0 4px ${color})`;
  }

  // Use framer-motion if available
  if (motion && AnimatePresence) {
    const MotionDiv = motion.div;
    return (
      <MotionDiv
        className={className}
        style={containerStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {heights.map((height, i) => (
          <MotionDiv
            key={i}
            style={{
              width: `${barWidth}px`,
              backgroundColor: color,
              borderRadius: `${barWidth / 2}px`,
            }}
            animate={{ height: `${height}%` }}
            transition={{
              duration: 0.1,
              ease: "easeOut",
            }}
          />
        ))}
      </MotionDiv>
    );
  }

  // CSS fallback
  return (
    <div className={className} style={containerStyle}>
      {heights.map((height, i) => (
        <div
          key={i}
          style={{
            width: `${barWidth}px`,
            height: audioLevel !== undefined ? `${height}%` : undefined,
            backgroundColor: color,
            borderRadius: `${barWidth / 2}px`,
            animation:
              audioLevel === undefined
                ? `vk-waveform-bar-${i % 5} ${0.5 + (i % 3) * 0.1}s ease-in-out infinite`
                : undefined,
            animationDelay: audioLevel === undefined ? `${i * 0.1}s` : undefined,
            transition: audioLevel !== undefined ? "height 0.1s ease-out" : undefined,
          }}
        />
      ))}
    </div>
  );
});

export default VoiceWaveform;
