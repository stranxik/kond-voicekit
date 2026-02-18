import type { ConversationState } from "@kond.studio/voicekit";

interface VoiceStatusProps {
  state: ConversationState;
}

const STATE_LABELS: Record<ConversationState, string> = {
  idle: "",
  connecting: "Connecting...",
  listening: "Listening",
  vad_cooldown: "Processing speech...",
  triggered: "Processing...",
  streaming: "Getting response...",
  processing: "Thinking...",
  speaking: "Speaking",
  cooldown: "",
};

function getStatusClass(state: ConversationState): string {
  switch (state) {
    case "listening":
    case "vad_cooldown":
      return "listening";
    case "speaking":
      return "speaking";
    case "connecting":
    case "processing":
    case "streaming":
    case "triggered":
      return "processing";
    default:
      return "idle";
  }
}

export function VoiceStatus({ state }: VoiceStatusProps) {
  const label = STATE_LABELS[state];
  const statusClass = getStatusClass(state);

  // Don't show anything when idle or cooldown
  if (!label) {
    return <div className="voice-status" />;
  }

  return (
    <div className={`voice-status ${statusClass}`}>
      <div className={`voice-status-dot status-dot ${statusClass}`} />
      <span className="voice-status-label">{label}</span>
    </div>
  );
}
