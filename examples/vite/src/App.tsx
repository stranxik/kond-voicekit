import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceKit } from "@kond.studio/voicekit/react";
import { callLLM, type LLMConfig } from "./lib/llm-providers";
import { getConfig } from "./lib/config";
import { Sidebar } from "./components/Sidebar";
import { ChatArea, type ChatMessage } from "./components/ChatArea";
import { ChatInput } from "./components/ChatInput";

const config = getConfig();

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    historyRef.current = [...historyRef.current, { role, content }];
    if (historyRef.current.length > 20) {
      historyRef.current = historyRef.current.slice(-20);
    }
  }, []);

  const processUserInput = useCallback(
    async (text: string, speakResponse: boolean = true) => {
      setError(null);
      addMessage("user", text);
      setIsStreaming(true);
      setStreamingText("");

      const llmConfig: LLMConfig = {
        provider: config.llm.provider,
        apiKey: config.llm.apiKey,
        ollamaUrl: config.llm.ollamaUrl,
        model: config.llm.model,
      };

      try {
        const response = await callLLM(text, llmConfig, historyRef.current.slice(0, -1));

        // Simulate streaming effect for non-streaming providers
        const words = response.split(" ");
        let accumulated = "";

        for (let i = 0; i < words.length; i++) {
          accumulated += (i === 0 ? "" : " ") + words[i];
          setStreamingText(accumulated);
          // Small delay between words for typing effect
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

        setIsStreaming(false);
        setStreamingText("");
        addMessage("assistant", response);

        if (speakResponse) {
          voice.speak(response);
        }
      } catch (err) {
        setIsStreaming(false);
        setStreamingText("");
        const errorMessage = err instanceof Error ? err.message : "Failed to get response";
        setError(errorMessage);
        console.error("LLM error:", err);
      }
    },
    [addMessage]
  );

  const handleTranscript = useCallback(
    async (text: string) => {
      await processUserInput(text, true);
    },
    [processUserInput]
  );

  const handleSendText = useCallback(
    async (text: string) => {
      await processUserInput(text, false); // Text input → no TTS
    },
    [processUserInput]
  );

  const voice = useVoiceKit({
    apiKey: config.voicekit.apiKey,
    locale: config.voicekit.locale,
    voice: config.voicekit.voiceId || undefined,
    // Turn detection: "auto" (default), "local" (ONNX), "cloud", or "heuristic"
    turnDetection: { type: config.voicekit.turnDetectorType },
    onTranscript: handleTranscript,
  });

  // Handle VoiceKit errors
  useEffect(() => {
    if (voice.error) {
      setError(voice.error.message);
    }
  }, [voice.error]);

  const canStart = config.voicekit.isConfigured && config.llm.isConfigured;

  return (
    <div className="app-layout">
      <Sidebar
        provider={config.llm.provider}
        providerConfigured={config.llm.isConfigured}
        voicekitConfigured={config.voicekit.isConfigured}
        voiceState={voice.state}
      />

      <main className="main-content">
        {error && (
          <div className="error-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="error-dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <ChatArea
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />

        <ChatInput
          voiceState={voice.state}
          onStart={voice.start}
          onStop={voice.stop}
          onSendText={handleSendText}
          disabled={!canStart || isStreaming}
        />
      </main>
    </div>
  );
}
