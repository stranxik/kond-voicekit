"use client";

/**
 * VoiceButton - Simple voice conversation button component
 *
 * A ready-to-use button that handles voice conversation state.
 * Style it with className or wrap it in your own component.
 *
 * @example
 * ```tsx
 * import { VoiceButton } from "@kond/voicekit/react";
 *
 * function App() {
 *   return (
 *     <VoiceButton
 *       onTranscript={async (text) => {
 *         const response = await myLLM.chat(text);
 *         return response; // Will be spoken by TTS
 *       }}
 *       className="my-voice-button"
 *     />
 *   );
 * }
 * ```
 */

import React from "react";
import { useVoiceKit, type UseVoiceKitOptions } from "./use-voice-kit";
import type { ConversationState } from "../types/config";

export interface VoiceButtonProps extends UseVoiceKitOptions {
  /** Custom className for styling */
  className?: string;
  /** Custom text for each state */
  labels?: Partial<Record<ConversationState, string>>;
  /** Render custom content instead of default button */
  children?: (props: {
    state: ConversationState;
    isActive: boolean;
    start: () => Promise<void>;
    stop: () => void;
  }) => React.ReactNode;
  /** Button disabled state */
  disabled?: boolean;
}

const DEFAULT_LABELS: Record<ConversationState, string> = {
  idle: "🎤 Start Voice",
  connecting: "Connecting...",
  listening: "🎤 Listening...",
  vad_cooldown: "🎤 Processing...",
  triggered: "💭 Thinking...",
  streaming: "💭 Responding...",
  processing: "💭 Processing...",
  speaking: "🔊 Speaking...",
  cooldown: "🔊 Finishing...",
};

/**
 * VoiceButton component for voice conversations
 */
export function VoiceButton({
  className,
  labels,
  children,
  disabled,
  ...voiceOptions
}: VoiceButtonProps) {
  const voice = useVoiceKit(voiceOptions);

  const mergedLabels = { ...DEFAULT_LABELS, ...labels };

  // Allow custom render
  if (children) {
    return (
      <>
        {children({
          state: voice.state,
          isActive: voice.isActive,
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || voice.state === "connecting"}
      className={className}
      aria-label={voice.isActive ? "Stop voice conversation" : "Start voice conversation"}
    >
      {mergedLabels[voice.state]}
    </button>
  );
}

export default VoiceButton;
