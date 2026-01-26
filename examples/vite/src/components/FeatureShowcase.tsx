/**
 * FeatureShowcase - Collapsible panel showing VoiceKit SDK features
 *
 * Displays:
 * - Turn detection mode selector (auto/local/cloud/heuristic)
 * - VAD meter (speech probability visualization)
 * - Barge-in indicator
 * - FSM state visualizer
 */

import { useState } from "react";
import type { ConversationState } from "@kond.studio/voicekit";

// =============================================================================
// Types
// =============================================================================

export type TurnDetectionType = "auto" | "local" | "cloud" | "heuristic";

interface FeatureShowcaseProps {
  /** Current conversation state */
  state: ConversationState;
  /** Whether voice is active */
  isActive: boolean;
  /** Whether user is currently speaking */
  userSpeaking?: boolean;
  /** Current turn detection mode */
  turnDetectionType: TurnDetectionType;
  /** Callback to change turn detection mode */
  onTurnDetectionChange?: (type: TurnDetectionType) => void;
  /** Audio level from 0 to 1 */
  audioLevel?: number;
  /** Whether barge-in is enabled */
  bargeInEnabled?: boolean;
  /** Whether an interruption just occurred */
  wasInterrupted?: boolean;
}

// =============================================================================
// Turn Detection Options
// =============================================================================

const TURN_DETECTION_OPTIONS: { value: TurnDetectionType; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Automatically selects the best mode",
  },
  {
    value: "local",
    label: "Local (ONNX)",
    description: "Uses local ONNX model for fast turn detection",
  },
  {
    value: "cloud",
    label: "Cloud",
    description: "Uses cloud API for accurate turn detection (~100-200ms)",
  },
  {
    value: "heuristic",
    label: "Heuristic",
    description: "Simple silence-based detection (~500ms)",
  },
];

// =============================================================================
// FSM State Definitions
// =============================================================================

const FSM_STATES: { state: ConversationState; label: string; color: string }[] = [
  { state: "idle", label: "Idle", color: "#404040" },
  { state: "connecting", label: "Connecting", color: "#737373" },
  { state: "listening", label: "Listening", color: "#00ff88" },
  { state: "vad_cooldown", label: "VAD Cooldown", color: "#00cc6a" },
  { state: "triggered", label: "Triggered", color: "#ffcc00" },
  { state: "streaming", label: "Streaming", color: "#ff9500" },
  { state: "processing", label: "Processing", color: "#737373" },
  { state: "speaking", label: "Speaking", color: "#00d4ff" },
  { state: "cooldown", label: "Cooldown", color: "#404040" },
];

// =============================================================================
// Sub-components
// =============================================================================

function VADMeter({ level = 0, isActive }: { level: number; isActive: boolean }) {
  const barCount = 10;
  const activeBarCount = Math.round(level * barCount);

  return (
    <div className="feature-item">
      <div className="feature-label">
        <span>VAD Level</span>
        <span className="feature-value">{Math.round(level * 100)}%</span>
      </div>
      <div className="vad-meter">
        {Array.from({ length: barCount }).map((_, i) => {
          const isActiveBar = isActive && i < activeBarCount;
          return (
            <div
              key={i}
              className={`vad-bar ${isActiveBar ? "active" : ""}`}
              style={{
                backgroundColor: isActiveBar
                  ? level > 0.7
                    ? "#ff4444"
                    : level > 0.4
                    ? "#ffcc00"
                    : "#00ff88"
                  : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function FSMVisualizer({ currentState }: { currentState: ConversationState }) {
  return (
    <div className="feature-item">
      <div className="feature-label">FSM State</div>
      <div className="fsm-states">
        {FSM_STATES.map(({ state, label, color }) => {
          const isCurrent = currentState === state;
          return (
            <div
              key={state}
              className={`fsm-state ${isCurrent ? "current" : ""}`}
              style={{
                borderColor: isCurrent ? color : undefined,
                color: isCurrent ? color : undefined,
              }}
            >
              <div
                className="fsm-state-dot"
                style={{ backgroundColor: isCurrent ? color : undefined }}
              />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BargeInIndicator({
  enabled,
  wasInterrupted,
}: {
  enabled: boolean;
  wasInterrupted: boolean;
}) {
  return (
    <div className="feature-item">
      <div className="feature-label">
        <span>Barge-in</span>
        <span
          className={`feature-badge ${enabled ? "enabled" : "disabled"}`}
          style={{
            backgroundColor: wasInterrupted ? "#ff9500" : enabled ? "#00ff88" : undefined,
          }}
        >
          {wasInterrupted ? "INTERRUPTED" : enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>
      <p className="feature-description">
        {enabled
          ? "User can interrupt while AI is speaking"
          : "User must wait for AI to finish speaking"}
      </p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function FeatureShowcase({
  state,
  isActive,
  userSpeaking = false,
  turnDetectionType,
  onTurnDetectionChange,
  audioLevel = 0,
  bargeInEnabled = true,
  wasInterrupted = false,
}: FeatureShowcaseProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={`feature-showcase ${isExpanded ? "expanded" : "collapsed"}`}>
      <button
        className="feature-showcase-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="feature-showcase-title">SDK Features</span>
        <svg
          className={`feature-showcase-chevron ${isExpanded ? "expanded" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isExpanded && (
        <div className="feature-showcase-content">
          {/* Turn Detection Selector */}
          <div className="feature-item">
            <div className="feature-label">Turn Detection</div>
            <div className="turn-detection-options">
              {TURN_DETECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`turn-detection-option ${
                    turnDetectionType === option.value ? "selected" : ""
                  }`}
                  onClick={() => onTurnDetectionChange?.(option.value)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="feature-description">
              {TURN_DETECTION_OPTIONS.find((o) => o.value === turnDetectionType)?.description}
            </p>
          </div>

          {/* VAD Meter */}
          <VADMeter level={audioLevel} isActive={isActive && userSpeaking} />

          {/* Barge-in Indicator */}
          <BargeInIndicator enabled={bargeInEnabled} wasInterrupted={wasInterrupted} />

          {/* FSM State Visualizer */}
          <FSMVisualizer currentState={state} />
        </div>
      )}
    </div>
  );
}

export default FeatureShowcase;
