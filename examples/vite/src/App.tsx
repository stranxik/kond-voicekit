import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceKit } from "@kond.studio/voicekit/react";
import type { ConversationState } from "@kond.studio/voicekit";
import { callLLM, type LLMProvider, type LLMConfig } from "@/lib/llm-providers";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const VOICEKIT_DEMO_KEY = "demo_key"; // Replace with real key for production

const STATE_LABELS: Record<ConversationState, string> = {
  idle: "Ready",
  connecting: "Connecting...",
  listening: "Listening...",
  vad_cooldown: "Processing speech...",
  triggered: "Processing...",
  streaming: "Getting response...",
  processing: "Thinking...",
  speaking: "Speaking...",
  cooldown: "Cooldown...",
};

export default function App() {
  // LLM Configuration
  const [provider, setProvider] = useState<LLMProvider>("echo");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");

  // Conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const transcriptAreaRef = useRef<HTMLDivElement>(null);

  // Load saved config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("voicekit-demo-config");
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.provider) setProvider(config.provider);
        if (config.apiKey) setApiKey(config.apiKey);
        if (config.model) setModel(config.model);
        if (config.ollamaUrl) setOllamaUrl(config.ollamaUrl);
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem(
      "voicekit-demo-config",
      JSON.stringify({ provider, apiKey, model, ollamaUrl })
    );
  }, [provider, apiKey, model, ollamaUrl]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (transcriptAreaRef.current) {
      transcriptAreaRef.current.scrollTop = transcriptAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    historyRef.current = [...historyRef.current, { role, content }];
    // Keep history manageable (last 10 exchanges)
    if (historyRef.current.length > 20) {
      historyRef.current = historyRef.current.slice(-20);
    }
  }, []);

  const handleTranscript = useCallback(
    async (text: string) => {
      setError(null);
      addMessage("user", text);

      const config: LLMConfig = {
        provider,
        apiKey,
        model: model || undefined,
        ollamaUrl,
      };

      try {
        const response = await callLLM(text, config, historyRef.current.slice(0, -1));
        addMessage("assistant", response);
        voice.speak(response);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to get response";
        setError(errorMessage);
        console.error("LLM error:", err);
      }
    },
    [provider, apiKey, model, ollamaUrl, addMessage]
  );

  const voice = useVoiceKit({
    apiKey: VOICEKIT_DEMO_KEY,
    locale: "en",
    onTranscript: handleTranscript,
    onError: (err) => {
      setError(err.message);
    },
  });

  const isConfigValid = provider === "echo" || provider === "ollama" || apiKey.length > 0;
  const canStart = isConfigValid && voice.state === "idle";

  const getStatusDotClass = () => {
    if (error) return "status-dot error";
    if (voice.state === "idle") return "status-dot";
    if (voice.state === "listening" || voice.state === "vad_cooldown") {
      return "status-dot listening";
    }
    return "status-dot connected";
  };

  return (
    <div className="container">
      <header className="header">
        <h1>VoiceKit Demo Agent</h1>
        <p>Voice AI example using @kond.studio/voicekit (Vite)</p>
      </header>

      {/* Configuration Panel */}
      <div className="config-panel">
        <div className="config-row">
          <div className="config-input">
            <label className="config-label">LLM Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
            >
              <option value="echo">Echo (No LLM)</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">GPT (OpenAI)</option>
              <option value="ollama">Ollama (Local)</option>
            </select>
          </div>
        </div>

        {provider !== "echo" && (
          <div className="config-row">
            {provider !== "ollama" && (
              <div className="config-input">
                <label className="config-label">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === "claude"
                      ? "sk-ant-..."
                      : "sk-..."
                  }
                />
              </div>
            )}
            {provider === "ollama" && (
              <div className="config-input">
                <label className="config-label">Ollama URL</label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>
            )}
            <div className="config-input" style={{ maxWidth: "180px" }}>
              <label className="config-label">Model (optional)</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  provider === "claude"
                    ? "claude-3-haiku"
                    : provider === "openai"
                    ? "gpt-4o-mini"
                    : "llama3.2"
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && <div className="error-message">{error}</div>}

      {/* Transcript Area */}
      <div className="transcript-area" ref={transcriptAreaRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
            <p>Click "Start Voice" and speak</p>
            <p style={{ fontSize: "0.7rem", marginTop: "0.5rem" }}>
              {provider === "echo"
                ? "Echo mode: your speech will be repeated back"
                : `Using ${provider} for responses`}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="message-role">
                {msg.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="message-text">{msg.content}</div>
            </div>
          ))
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-indicator">
          <div className={getStatusDotClass()} />
          <span>{STATE_LABELS[voice.state]}</span>
        </div>
        <span style={{ color: "var(--text-muted)" }}>
          {provider === "echo" ? "Echo Mode" : provider.toUpperCase()}
        </span>
      </div>

      {/* Voice Button */}
      {voice.state === "idle" ? (
        <button
          className="voice-button start"
          onClick={voice.start}
          disabled={!canStart}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Start Voice
        </button>
      ) : (
        <button className="voice-button stop" onClick={voice.stop}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
      )}

      <p className="info-text">
        Powered by{" "}
        <a
          href="https://github.com/stranxik/kond-voicekit"
          target="_blank"
          rel="noopener noreferrer"
        >
          @kond.studio/voicekit
        </a>
      </p>
    </div>
  );
}
