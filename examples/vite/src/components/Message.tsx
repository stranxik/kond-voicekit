interface MessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isStreaming?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Message({ role, content, timestamp, isStreaming }: MessageProps) {
  return (
    <div className={`message ${isStreaming ? "streaming" : ""}`}>
      <div className="message-header">
        <span className={`message-role ${role}`}>
          {role === "user" ? "You" : "Assistant"}
        </span>
        {timestamp && !isStreaming && (
          <span className="message-time">{formatTime(timestamp)}</span>
        )}
        {isStreaming && (
          <span className="message-streaming-indicator">
            <span className="streaming-dot"></span>
            <span className="streaming-dot"></span>
            <span className="streaming-dot"></span>
          </span>
        )}
      </div>
      <div className={`message-content ${role}`}>
        {content}
        {isStreaming && <span className="cursor">|</span>}
      </div>
    </div>
  );
}
