```
 ██╗  ██╗ ██████╗ ███╗   ██╗██████╗
 ██║ ██╔╝██╔═══██╗████╗  ██║██╔══██╗
 █████╔╝ ██║   ██║██╔██╗ ██║██║  ██║
 ██╔═██╗ ██║   ██║██║╚██╗██║██║  ██║
 ██║  ██╗╚██████╔╝██║ ╚████║██████╔╝
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝

 ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗██╗  ██╗██╗████████╗
 ██║   ██║██╔═══██╗██║██╔════╝██╔════╝██║ ██╔╝██║╚══██╔══╝
 ██║   ██║██║   ██║██║██║     █████╗  █████╔╝ ██║   ██║
 ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝  ██╔═██╗ ██║   ██║
  ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗██║  ██╗██║   ██║
   ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝
```

# @kond/voicekit

> **"Give your AI agent a voice"**
>
> Voice SDK for AI agents — STT, TTS, Turn Detection ML
>
> **Languages:** English, French

---

## What is VoiceKit?

VoiceKit is not just code. It's **orchestration**.

Anyone can connect Deepgram + ElevenLabs. Nobody wants to spend months handling the edge cases: VAD cooldowns, barge-in detection, gapless audio queuing, backchannel filtering ("mh", "yeah"), turn-taking ML...

**VoiceKit = months of R&D condensed into one import.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Developer wants voice for their AI agent                                │
│                                                                          │
│  WITHOUT VOICEKIT                    WITH VOICEKIT                       │
│  ─────────────────                   ─────────────                       │
│  ❌ Integrate Deepgram/Whisper       ✓ One import                        │
│  ❌ WebSocket + audio buffers        ✓ Handled                           │
│  ❌ End-of-turn detection            ✓ ML-based (39% better)             │
│  ❌ False positives ("uh", "hmm")    ✓ Backchannel filtering             │
│  ❌ ElevenLabs/OpenAI TTS            ✓ Abstracted                        │
│  ❌ Gaps between sentences           ✓ Gapless queue + prefetch          │
│  ❌ Barge-in support                 ✓ Native                            │
│  ❌ Latency optimization             ✓ < 1.5s end-to-end                 │
│  ─────────────────────────────────────────────────────────────────────── │
│  = 2-3 months dev                    = 1 day integration                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Status

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MODE            │ STATUS           │ DESCRIPTION                        │
├──────────────────┼──────────────────┼────────────────────────────────────┤
│  Self-hosted     │ ✓ Available      │ Bring your own endpoints           │
│  Managed Service │ ○ Roadmap        │ One API key, everything included   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Today:** Self-hosted mode. You provide your own STT/TTS endpoints (Deepgram, ElevenLabs, etc.).

**Tomorrow:** Managed service with a single KOND API key — STT + TTS + ML included, zero config.

---

## Features

```
WHAT'S INCLUDED
───────────────
├─ 9-state conversation FSM (complete with edge cases)
├─ VAD cooldown (avoid false positives on short silences)
├─ Barge-in (natural user interruption of AI)
├─ Early trigger (respond before utterance complete)
├─ Backchannels ("mh", "yeah", "ouais" → skip LLM, no response)
├─ TTS queue with prefetch (audio without gaps between sentences)
├─ ML Turn Detection (LiveKit ONNX model, runs client-side)
├─ Sentence accumulator (streaming chunking for progressive TTS)
├─ Framework-agnostic core (vanilla JS)
└─ React bindings included (hooks + components)
```

---

## Installation

```bash
npm install @kond/voicekit
# or
pnpm add @kond/voicekit
```

---

## Quick Start

### React

```tsx
import { useVoiceKit } from '@kond/voicekit/react';

function VoiceChat() {
  const voice = useVoiceKit({
    locale: 'fr',
    onTranscript: async (text) => {
      const reply = await myLLM.chat(text);
      voice.speak(reply);
    },
  });

  return (
    <button onClick={voice.isListening ? voice.stop : voice.start}>
      {voice.isListening ? '🎤 Listening...' : '🔇 Start'}
    </button>
  );
}
```

### Vanilla JavaScript

```typescript
import { VoiceKit } from '@kond/voicekit';

const voice = new VoiceKit({
  locale: 'fr',
  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },
});

await voice.start();
```

---

## Self-Hosted Mode

You provide your own STT/TTS endpoints:

```typescript
const voice = new VoiceKit({
  getAuthToken: () => fetchMyToken(),
  endpoints: {
    sttWebSocket: '/api/voice/stt',     // Your Deepgram proxy
    ttsStream: '/api/voice/tts',         // Your ElevenLabs proxy
    turnDetector: '/api/voice/turn',     // Turn detection API (optional)
  },
  locale: 'fr',
  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },
});
```

### Backend Requirements

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ENDPOINT              │ TYPE          │ DESCRIPTION                     │
├────────────────────────┼───────────────┼─────────────────────────────────┤
│  /api/voice/stt        │ WebSocket     │ Proxy to Deepgram STT           │
│  /api/voice/tts        │ HTTP Stream   │ Proxy to ElevenLabs TTS         │
│  /api/voice/token      │ HTTP GET      │ Auth token (optional)           │
└──────────────────────────────────────────────────────────────────────────┘
```

VoiceKit is **backend-agnostic**. Works with Next.js, Hono, Express, Fastify, Cloudflare Workers, Deno, Bun...

---

## Composable Hooks

For custom orchestration, use granular hooks:

```typescript
import {
  useAudioSetup,
  useSTTConnection,
  useTurnCoordination,
  useLlmIntegration,
  useSileroVAD,
  useTurnDetector,
} from '@kond/voicekit/react';

// Build your own voice pipeline
const audio = useAudioSetup({ debug: true });
const stt = useSTTConnection({ userId: 'user-123', locale: 'fr' });
const vad = useSileroVAD({ threshold: 0.5 });
const turnDetector = useTurnDetector({ type: 'auto' });
```

---

## Architecture

```
@kond/voicekit/
├─ core/                       # Framework-agnostic engine
│   ├─ turn-manager.ts         # Signal fusion (VAD + transcript + ML)
│   ├─ tts-queue.ts            # Sentence queue + prefetch
│   ├─ tts-streaming.ts        # Web Audio playback
│   ├─ eou-detector.ts         # End-of-utterance detection
│   └─ sentence-chunker.ts     # Streaming text → sentences
│
├─ adapters/
│   ├─ stt/deepgram.ts         # Deepgram STT adapter
│   ├─ tts/fetch-tts.ts        # Generic fetch-based TTS
│   ├─ vad/silero-vad.ts       # Silero WASM VAD
│   └─ turn-detector/
│       ├─ cloud.ts            # Remote ML API
│       ├─ onnx.ts             # Local ONNX (LiveKit model)
│       └─ heuristic.ts        # Rule-based fallback
│
├─ ports/                      # Interfaces (dependency inversion)
│   ├─ stt.ts
│   ├─ tts.ts
│   ├─ vad.ts
│   └─ turn-detector.ts
│
├─ react/                      # React bindings
│   ├─ use-voice-kit.ts        # Main hook
│   ├─ use-voice-conversation.ts
│   ├─ hooks/                  # Granular hooks
│   └─ VoiceButton.tsx         # Ready-to-use component
│
├─ voicekit.ts                 # VoiceKit class (vanilla JS)
└─ index.ts                    # Exports
```

---

## LLM-Agnostic

VoiceKit is **independent of your LLM**. You bring your own:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PROVIDED BY VOICEKIT          │  PROVIDED BY YOU                        │
├────────────────────────────────┼─────────────────────────────────────────┤
│  ✓ STT (Deepgram adapter)      │  ✓ Your LLM (Claude, GPT, Gemini...)   │
│  ✓ TTS (ElevenLabs adapter)    │  ✓ Your LLM API key                    │
│  ✓ Turn Detection ML           │  ✓ Your business logic                 │
│  ✓ 9-state conversation FSM    │  ✓ Your backend endpoints              │
│  ✓ Audio orchestration         │                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

**VoiceKit doesn't know which LLM you use** — and that's intentional.
The `onTranscript` callback is a black box for us.

---

## vs Competition

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOLUTION        │ TYPE       │ STRENGTH            │ WEAKNESS           │
├──────────────────┼────────────┼─────────────────────┼────────────────────┤
│  LiveKit Agents  │ SDK Python │ Turn detection ML   │ No JS, no TTS Q    │
│  Vapi.ai         │ SaaS       │ Turnkey             │ Closed, expensive  │
│  Retell.ai       │ SaaS       │ UX polish           │ Closed, LLM lock-in│
│  OpenAI Realtime │ API        │ Low latency         │ GPT-4 only, $$$    │
│  Hume.ai         │ SaaS       │ Emotion detection   │ Very expensive     │
├──────────────────┴────────────┴─────────────────────┴────────────────────┤
│                                                                          │
│  @kond/voicekit                                                          │
│  ───────────────                                                         │
│  ✓ ML Turn Detection (LiveKit ONNX, client-side)                        │
│  ✓ FR/EN backchannels ("mh", "ouais", "ok")                             │
│  ✓ TTS Queue + Prefetching (gapless audio)                              │
│  ✓ Native barge-in support                                               │
│  ✓ 9-state FSM (battle-tested orchestration)                            │
│  ✓ Framework-agnostic (React bindings included)                          │
│  ✓ Open source (MIT license)                                             │
│  ✓ LLM-agnostic (use any model)                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Use Cases

```
APPLICATIONS
────────────
├─ Voice chatbots       — Customer support, virtual assistants
├─ Educational apps     — AI tutors, language learning
├─ Accessibility        — Voice interfaces for visually impaired
├─ Gaming               — NPCs that talk with players
├─ Prototyping          — Test voice-first ideas in a day
└─ Autonomous agents    — Agents that call APIs and report back vocally
```

---

## Roadmap: Managed Service

```
COMING SOON
───────────
├─ One API key → STT + TTS + ML included
├─ Free tier: 100 min/month
├─ Then: $0.05/min
├─ ElevenLabs voices catalog
├─ Zero config, zero external accounts
└─ Same SDK API — just add your key
```

---

## Documentation

Full documentation: [kond.studio/docs/voicekit](https://kond.studio/docs/voicekit) *(coming soon)*

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Contributing

VoiceKit is extracted from [KOND](https://kond.studio), a personal AI companion.

Issues and PRs welcome on [GitHub](https://github.com/stranxik/kond-voicekit).

---

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                           [ ^_^ ]                                        │
│                                                                          │
│                @kond/voicekit — built with care                          │
│                                                                          │
│       Voice SDK for AI agents. Framework-agnostic. Open source.         │
│                                                                          │
│                            2025                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
