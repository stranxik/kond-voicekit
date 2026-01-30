/**
 * InterruptionBadge - Shows when user interrupts AI (barge-in)
 *
 * Displays a badge that slides in when the user speaks while
 * the AI is still talking, showing what was interrupted.
 */

import { useState, useEffect } from "react";

interface InterruptionBadgeProps {
  /** Whether an interruption just occurred */
  isInterrupted: boolean;
  /** The text that was being spoken when interrupted */
  interruptedText?: string;
  /** How long to show the badge (ms) */
  displayDuration?: number;
  /** Callback when badge is dismissed */
  onDismiss?: () => void;
}

export function InterruptionBadge({
  isInterrupted,
  interruptedText,
  displayDuration = 3000,
  onDismiss,
}: InterruptionBadgeProps) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState<string | undefined>();

  useEffect(() => {
    if (isInterrupted && interruptedText) {
      setText(interruptedText);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, displayDuration);

      return () => clearTimeout(timer);
    }
  }, [isInterrupted, interruptedText, displayDuration, onDismiss]);

  if (!visible || !text) return null;

  // Truncate text if too long
  const displayText = text.length > 50 ? text.slice(0, 50) + "..." : text;

  return (
    <div className="interruption-badge">
      <div className="interruption-badge-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
          <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
          <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </div>
      <div className="interruption-badge-content">
        <span className="interruption-badge-label">Interrupted</span>
        <span className="interruption-badge-text">"{displayText}"</span>
      </div>
      <button
        className="interruption-badge-dismiss"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default InterruptionBadge;
