```
██╗   ██╗ ██████╗ ██╗ ██████╗███████╗██╗  ██╗██╗████████╗
██║   ██║██╔═══██╗██║██╔════╝██╔════╝██║ ██╔╝██║╚══██╔══╝
██║   ██║██║   ██║██║██║     █████╗  █████╔╝ ██║   ██║
╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝  ██╔═██╗ ██║   ██║
 ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗██║  ██╗██║   ██║
  ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝
```

# @kond/voicekit

> "Give your AI agent a voice"
> Voice SDK for AI agents — STT, TTS, Turn Detection ML
> **Languages:** English, French

```
┌──────────────────────────────────────────────────────────────────────────┐
│  STATUS                                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│  Self-hosted    │ ✓ Available      │ Bring your own endpoints            │
│  Managed        │ ○ Roadmap        │ One API key, everything included    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## THE PROBLEM

Adding voice to an AI agent is **complex and expensive**:

```
Developer wants to make their agent speak
        ↓
❌ Integrate Deepgram/Whisper for STT
❌ Manage WebSocket + audio buffers
❌ Detect when user finished speaking (VAD, end-of-turn)
❌ Avoid false positives ("uh", "hmm", short silences)
❌ Integrate ElevenLabs/OpenAI for TTS
❌ Handle gaps between sentences (gapless audio)
❌ Support barge-in (user interrupts)
❌ Optimize latency (prefetching, early trigger)
        ↓
= 2-3 months dev, audio expertise, subtle bugs
```

---

## THE SOLUTION

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    WITHOUT VOICEKIT vs WITH VOICEKIT                      │
├──────────────────────────────────────────────────────────────────────────┤
│  Without VoiceKit           │  With VoiceKit                             │
│  ───────────────────────────┼─────────────────────────────────────────── │
│  2-3 months dev             │  1 day integration                         │
│  Subtle VAD/timing bugs     │  Tested on 1000+ conversations             │
│  3-5s latency               │  < 1.5s latency                            │
│  Gapless audio to build     │  Gapless audio native                      │
│  Turn detection to build    │  ML turn detection included                │
│  Audio expertise required   │  Zero audio knowledge needed               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## WHAT'S INSIDE

This is not just code. It's **orchestration**.

Anyone can connect Deepgram + ElevenLabs.
Nobody wants to handle:

```
FEATURES INCLUDED
─────────────────
├─ 9-state conversation FSM (complete with edge cases)
├─ VAD cooldown (avoid false positives on short silences)
├─ Barge-in (natural AI interruption)
├─ Early trigger (respond before complete sentence)
├─ Backchannels ("mh", "yeah" → skip LLM, no response)
├─ TTS queue with prefetch (audio without gaps)
├─ ML Turn Detection (LiveKit ONNX, client-side)
└─ Sentence accumulator (streaming chunking for progressive TTS)
```

**VoiceKit = months of R&D condensed into one import.**

---

## INSTALLATION

```bash
npm install @kond/voicekit
# or
pnpm add @kond/voicekit
```

---

## QUICK START

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

### Vanilla JS

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

## SELF-HOSTED MODE (Current)

You provide your own STT/TTS endpoints:

```typescript
const voice = new VoiceKit({
  getAuthToken: () => fetchMyToken(),
  endpoints: {
    sttWebSocket: '/api/voice/stt',     // Your Deepgram proxy
    ttsStream: '/api/voice/tts',         // Your ElevenLabs proxy
    turnDetector: '/api/voice/turn',     // Turn detection API
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
│  ENDPOINT                │ TYPE          │ DESCRIPTION                   │
├──────────────────────────┼───────────────┼───────────────────────────────┤
│  /api/voice/stt          │ WebSocket     │ Deepgram STT proxy            │
│  /api/voice/tts          │ HTTP Stream   │ ElevenLabs TTS proxy          │
│  /api/voice/token        │ HTTP GET      │ Auth token (optional)         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## COMPOSABLE HOOKS

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

## ARCHITECTURE

```
@kond/voicekit/
├─ core/
│   ├─ turn-manager.ts        # Signal fusion engine
│   ├─ tts-queue.ts           # Sentence queue + prefetch
│   ├─ tts-streaming.ts       # Web Audio playback
│   └─ state-machine.ts       # 9-state conversation FSM
│
├─ stt/
│   ├─ deepgram-adapter.ts    # Deepgram STT
│   └─ whisper-adapter.ts     # Local Whisper (future)
│
├─ tts/
│   ├─ elevenlabs-adapter.ts  # ElevenLabs TTS
│   ├─ openai-adapter.ts      # OpenAI TTS
│   └─ piper-adapter.ts       # Local Piper (future)
│
├─ vad/
│   ├─ silero-vad.ts          # Silero WASM
│   └─ rms-vad.ts             # Simple RMS fallback
│
├─ ml/
│   ├─ cloud-detector.ts      # Remote ML
│   ├─ onnx-detector.ts       # Local ONNX
│   └─ heuristic-detector.ts  # Rule-based fallback
│
├─ react/                      # React bindings
│   ├─ use-voice-kit.ts
│   └─ VoiceButton.tsx
│
└─ index.ts                    # VoiceKit class
```

---

## VS COMPETITION

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOLUTION        │ TYPE       │ STRENGTH          │ WEAKNESS             │
├──────────────────┼────────────┼───────────────────┼──────────────────────┤
│  LiveKit Agents  │ SDK Python │ Turn detection ML │ No React, no TTS Q   │
│  Vapi.ai         │ SaaS       │ Turnkey           │ Closed, expensive    │
│  Retell.ai       │ SaaS       │ UX polish         │ Closed, LLM lock-in  │
│  OpenAI Realtime │ API        │ Low latency       │ GPT-4 only, expensive│
│  Hume.ai         │ SaaS       │ Emotion           │ Very expensive       │
├──────────────────┴────────────┴───────────────────┴──────────────────────┤
│                                                                          │
│  @kond/voicekit                                                          │
│  ───────────────                                                         │
│  ✓ ONE API → everything works                                            │
│  ✓ ML Turn Detection included (LiveKit ONNX, client-side)               │
│  ✓ FR/EN heuristics for backchannels ("mh", "ouais", "ok")              │
│  ✓ TTS Queue + Prefetching (gapless audio)                              │
│  ✓ Native barge-in support                                               │
│  ✓ 9-state FSM (our orchestration)                                       │
│  ✓ Framework-agnostic (React bindings included)                          │
│  ✓ Open source                                                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## USE CASES

```
APPLICATIONS
────────────
├─ Voice chatbots      — Customer support, assistants
├─ Educational apps    — AI tutors, language learning
├─ Accessibility       — Voice interfaces for visually impaired
├─ Gaming              — NPCs that talk with players
├─ Prototyping         — Test voice-first ideas quickly
└─ Autonomous agents   — Agents that call APIs and speak
```

---

## LLM-AGNOSTIC

VoiceKit is **independent of LLM**. You bring your own:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PROVIDED BY KOND              │  PROVIDED BY YOU                        │
├────────────────────────────────┼─────────────────────────────────────────┤
│  ✓ STT (Deepgram)              │  ✓ Your LLM (Claude/GPT/Gemini/Llama)  │
│  ✓ TTS (ElevenLabs)            │  ✓ Your LLM API key                    │
│  ✓ Turn Detection ML           │  ✓ Your business logic                 │
│  ✓ State Machine 9 states      │                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

**VoiceKit doesn't know which LLM you use** — and that's intentional.
The `onTranscript` callback is a black box for us.

---

## ROADMAP

```
MANAGED SERVICE (Coming)
────────────────────────
├─ One API key → STT + TTS + ML included
├─ Free tier: 100 min/month
├─ Then: $0.05/min
├─ ElevenLabs voices of your choice
└─ Zero config, zero accounts to create
```

---

## DOCUMENTATION

Full documentation: [docs/SDK/VOICEKIT.md](https://github.com/stranxik/kond-voicekit/blob/main/docs/SDK/VOICEKIT.md)

---

## LICENSE

MIT — [KOND](https://kond.studio)

---

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                        [ ^_^ ]                                           │
│                                                                          │
│              @kond/voicekit — built with care                            │
│                                                                          │
│      Voice SDK for AI agents. Framework-agnostic. Open source.          │
│                                                                          │
│                           2025                                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
