"use client";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Message({ role, content, timestamp }: MessageProps) {
  return (
    <div className="message">
      <div className="message-header">
        <span className={`message-role ${role}`}>
          {role === "user" ? "You" : "Assistant"}
        </span>
        {timestamp && (
          <span className="message-time">{formatTime(timestamp)}</span>
        )}
      </div>
      <div className={`message-content ${role}`}>{content}</div>
    </div>
  );
}
