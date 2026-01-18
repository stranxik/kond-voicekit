"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import type { ConversationState } from "@kond.studio/voicekit";
import { VoiceStatusIndicator } from "@kond.studio/voicekit/react";

interface ChatInputProps {
  voiceState: ConversationState;
  onStart: () => void;
  onStop: () => void;
  onSendText: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({
  voiceState,
  onStart,
  onStop,
  onSendText,
  disabled = false,
}: ChatInputProps) {
  const [inputText, setInputText] = useState("");
  const isActive = voiceState !== "idle";

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (trimmed && !disabled) {
      onSendText(trimmed);
      setInputText("");
    }
  }, [inputText, disabled, onSendText]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="input-area">
      <div className="input-container">
        <VoiceStatusIndicator state={voiceState} isActive={isActive} />

        <div className="input-box">
          <span className="input-prompt">&gt;</span>
          <textarea
            className="input-textarea"
            placeholder={isActive ? "Listening..." : "Type a message or click the mic..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isActive}
            rows={1}
          />
          <div className="input-actions">
            {/* Send button */}
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={disabled || !inputText.trim() || isActive}
              title="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>

            {/* Voice button */}
            {isActive ? (
              <button
                className="voice-btn active"
                onClick={onStop}
                title="Stop recording"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                className="voice-btn"
                onClick={onStart}
                disabled={disabled}
                title={disabled ? "Configure API keys first" : "Start recording"}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
