# VoiceKit Next.js Example

A voice AI agent demo using [@kond/voicekit](https://github.com/stranxik/kond/tree/main/packages/voicekit) with Next.js 14 (App Router).

## Features

- Voice input/output with VoiceKit SDK
- Multiple LLM providers (Claude, OpenAI, Ollama)
- Real-time transcript display
- Conversation history
- Settings persistence (localStorage)

## Quick Start

```bash
# From the monorepo root
pnpm install

# Run the example
cd packages/voicekit/examples/nextjs
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

### Echo Mode (default)

No API key needed. Your speech is echoed back as text-to-speech.

### Claude (Anthropic)

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Enter it in the demo UI
3. Optional: specify model (default: `claude-3-haiku-20240307`)

### OpenAI

1. Get an API key from [OpenAI Platform](https://platform.openai.com/)
2. Enter it in the demo UI
3. Optional: specify model (default: `gpt-4o-mini`)

### Ollama (Local)

1. Install [Ollama](https://ollama.ai/)
2. Run a model: `ollama run llama3.2`
3. In the demo, select Ollama provider
4. Ensure URL is `http://localhost:11434`

## How It Works

```tsx
import { useVoiceKit } from "@kond/voicekit/react";

function App() {
  const voice = useVoiceKit({
    apiKey: "your_voicekit_key",
    locale: "en",
    onTranscript: async (text) => {
      // Call your LLM
      const response = await myLLM.chat(text);
      // Speak the response
      voice.speak(response);
    },
  });

  return (
    <button onClick={voice.state === "idle" ? voice.start : voice.stop}>
      {voice.state === "idle" ? "Start" : "Stop"}
    </button>
  );
}
```

## VoiceKit States

| State | Description |
|-------|-------------|
| `idle` | Ready to start |
| `connecting` | Setting up audio |
| `listening` | Recording speech |
| `vad_cooldown` | Processing speech end |
| `triggered` | User finished speaking |
| `streaming` | Waiting for LLM |
| `processing` | LLM generating |
| `speaking` | TTS playing |
| `cooldown` | Brief pause before next turn |

## License

MIT
