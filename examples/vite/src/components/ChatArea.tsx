import { useRef, useEffect } from "react";
import { Message } from "./Message";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatAreaProps {
  messages: ChatMessage[];
  streamingText?: string;
  isStreaming?: boolean;
}

export function ChatArea({ messages, streamingText, isStreaming }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const showStreamingMessage = isStreaming && streamingText;

  return (
    <div className="chat-area" ref={scrollRef}>
      {messages.length === 0 && !showStreamingMessage ? (
        <div className="empty-state">
          <svg
            className="empty-state-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <div className="empty-state-title">Voice Chat</div>
          <p className="empty-state-description">
            Click the microphone button to start a voice conversation,
            or type a message below.
          </p>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((msg) => (
            <Message
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}
          {/* Streaming message indicator */}
          {showStreamingMessage && (
            <Message
              role="assistant"
              content={streamingText}
              timestamp={new Date()}
              isStreaming
            />
          )}
        </div>
      )}
    </div>
  );
}
