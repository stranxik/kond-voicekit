# VoiceKit SDK - Architecture Plan

> Objectif: Les utilisateurs du SDK doivent avoir la MEME qualite que KOND

---

## 1. Analyse du Gap

### KOND (Rich) vs SDK Actuel (Simplified)

| Feature | KOND | SDK Actuel |
|---------|------|------------|
| **States** | 9 (idle, connecting, listening, vad_cooldown, triggered, streaming, processing, speaking, cooldown) | 6 (manque vad_cooldown, triggered, streaming) |
| **Timeouts** | 8 types | Basique |
| **Barge-in Context** | Oui (interruptionContext pour LLM) | Non |
| **Backchannel Detection** | Oui (skip LLM pour "ouais") | Non integre |
| **VAD Cooldown** | Oui (800ms) | Non |
| **Early LLM Trigger** | Oui (pendant triggered state) | Non |
| **Incomplete Detection** | Oui | Non |
| **Hooks Composables** | 7 hooks | 1 hook simplifie |

### Hooks KOND a porter

```
src/hooks/voice/
├── use-audio-setup.ts         # MediaStream, AudioContext, AudioWorklet
├── use-deepgram-connection.ts # STT WebSocket + reconnection
├── use-voice-timeouts.ts      # 8 types de timeouts
├── use-turn-coordination.ts   # TurnManager wrapper
├── use-llm-integration.ts     # Early trigger + buffering
├── use-silero-vad.ts          # ML VAD wrapper
├── use-turn-detector.ts       # Auto-select heuristic/cloud/onnx
└── types.ts                   # 9 states, constants
```

---

## 2. Architecture Hexagonale SDK

```
┌──────────────────────────────────────────────────────────────────┐
│                        REACT LAYER                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              ORCHESTRATORS (Entry Points)                  │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │   useVoiceKit       │  │  useVoiceConversation       │ │  │
│  │  │   (Simple API)      │  │  (Full-featured, like KOND) │ │  │
│  │  └─────────────────────┘  └─────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              COMPOSABLE HOOKS (Building Blocks)            │  │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐│  │
│  │  │useAudioSetup  │ │useSTTConnection│ │useVoiceTimeouts  ││  │
│  │  └───────────────┘ └───────────────┘ └───────────────────┘│  │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐│  │
│  │  │useTurnCoord   │ │useLLMIntegration│ │useSileroVAD     ││  │
│  │  └───────────────┘ └───────────────┘ └───────────────────┘│  │
│  │  ┌───────────────────────────────────────────────────────┐│  │
│  │  │                  useTurnDetector                      ││  │
│  │  └───────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         CORE LAYER                                │
│  (Pure TypeScript, no React, no framework dependencies)          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐ │
│  │TurnManager │ │TTSQueue    │ │TTSStreaming│ │SentenceChunker │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────────────┐│
│  │EOUDetector │ │TriggerDet  │ │        Sanitizer               ││
│  └────────────┘ └────────────┘ └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         PORTS LAYER                               │
│  (Interfaces - Contracts)                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │StreamingSTT  │ │TTSProvider   │ │VADProvider   │              │
│  │    Port      │ │    Port      │ │    Port      │              │
│  └──────────────┘ └──────────────┘ └──────────────┘              │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    TurnDetectorProvider                      ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       ADAPTERS LAYER                              │
│  (Implementations - Pluggable)                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ STT: DeepgramAdapter, WhisperAdapter (future)              │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ TTS: FetchTTSAdapter (ElevenLabs, etc.)                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ VAD: SileroVADAdapter, RMSVADAdapter (fallback)            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ TurnDetector: Heuristic, ONNX, Cloud, Mock                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Structure Fichiers Cible

```
packages/voicekit/src/
├── index.ts                     # Main exports
├── voicekit.ts                  # VoiceKit class (simplifie)
│
├── core/                        # EXISTE DEJA
│   ├── turn-manager.ts
│   ├── tts-queue.ts
│   ├── tts-streaming.ts
│   ├── eou-detector.ts
│   ├── trigger-detector.ts
│   ├── sentence-chunker.ts
│   ├── tts-model-router.ts
│   └── sanitize-for-tts.ts
│
├── ports/                       # EXISTE DEJA
│   ├── stt.ts
│   ├── tts.ts
│   ├── vad.ts
│   └── turn-detector.ts
│
├── adapters/                    # EXISTE DEJA
│   ├── stt/deepgram.ts
│   ├── tts/fetch-tts.ts
│   ├── vad/silero-vad.ts
│   └── turn-detector/*.ts
│
├── types/                       # EXISTE DEJA
│   └── config.ts
│
└── react/                       # A ENRICHIR
    ├── index.ts                 # Barrel exports
    ├── types.ts                 # React-specific types (9 states, constants)
    │
    ├── hooks/                   # NOUVEAU - Composable building blocks
    │   ├── index.ts
    │   ├── use-audio-setup.ts       # Port depuis KOND
    │   ├── use-stt-connection.ts    # Port depuis KOND (generique)
    │   ├── use-voice-timeouts.ts    # Port depuis KOND
    │   ├── use-turn-coordination.ts # Port depuis KOND
    │   ├── use-llm-integration.ts   # Port depuis KOND
    │   ├── use-silero-vad.ts        # Port depuis KOND
    │   └── use-turn-detector.ts     # Port depuis KOND
    │
    ├── use-voice-kit.ts         # EXISTANT - Simple API (wrapper VoiceKit class)
    ├── use-voice-conversation.ts # NOUVEAU - Full-featured (comme KOND)
    │
    └── VoiceButton.tsx          # EXISTANT - Simple component
```

---

## 4. Deux Entry Points React

### useVoiceKit (Simple)
Pour les utilisateurs qui veulent une integration rapide:

```tsx
import { useVoiceKit } from "@kond/voicekit/react";

function App() {
  const voice = useVoiceKit({
    locale: "fr",
    onTranscript: async (text) => {
      const response = await myLLM.generate(text);
      voice.speak(response);
    },
  });

  return <button onClick={voice.start}>Parler</button>;
}
```

### useVoiceConversation (Full-Featured)
Pour les utilisateurs qui veulent la qualite KOND:

```tsx
import { useVoiceConversation } from "@kond/voicekit/react";

function App() {
  const voice = useVoiceConversation({
    locale: "fr",
    sendMessage: myLLM.generate,  // LLM callback
    onUserMessage: (text) => {
      // Afficher dans le chat
    },
    cancelTTS: () => stopMyTTS(),
    onAutoStop: (reason) => {
      console.log("Auto-stop:", reason);
    },
    // Advanced options
    idleTimeoutMs: 60000,
    maxSessionMs: 300000,
    speechFinalDelayMs: 800,
    cooldownMs: 150,
    debug: true,
  });

  // 9 states disponibles
  // voice.state: "idle" | "connecting" | "listening" | "vad_cooldown" | "triggered" | "streaming" | "processing" | "speaking" | "cooldown"

  // Interruption context pour LLM
  const ctx = voice.getInterruptionContext();
  if (ctx) {
    // User a interrompu, peut informer le LLM
  }

  return (
    <div>
      <p>State: {voice.state}</p>
      <p>Transcript: {voice.transcript}</p>
      <p>User speaking: {voice.userSpeaking ? "Yes" : "No"}</p>
      <button onClick={voice.start}>Start</button>
      <button onClick={voice.stop}>Stop</button>
    </div>
  );
}
```

### Composable Hooks (Advanced)
Pour les utilisateurs qui veulent construire leur propre orchestration:

```tsx
import {
  useAudioSetup,
  useSTTConnection,
  useVoiceTimeouts,
  useTurnCoordination,
  useLLMIntegration,
  useSileroVAD,
  useTurnDetector,
} from "@kond/voicekit/react/hooks";

function CustomVoiceApp() {
  const audio = useAudioSetup({ debug: true });
  const stt = useSTTConnection({ userId: "user-123" });
  const vad = useSileroVAD({ threshold: 0.5 });
  const turn = useTurnCoordination({ speechFinalDelayMs: 800 });
  const timeouts = useVoiceTimeouts({ idleTimeoutMs: 60000 });
  const llm = useLLMIntegration({ sendMessage: myLLM.generate });

  // Custom orchestration...
}
```

---

## 5. Plan d'Execution

### Phase 6b: Enrichir React Hooks

#### Etape 1: Types React (30min)
Porter `src/hooks/voice/types.ts` vers `src/react/types.ts`:
- 9 conversation states
- 8 timeout constants
- Interfaces (ConversationState, AutoStopReason, etc.)

#### Etape 2: Hooks Composables (4h)
Creer `src/react/hooks/`:

| Hook | Source KOND | Modifications |
|------|-------------|---------------|
| use-audio-setup.ts | Direct copy | Aucune |
| use-stt-connection.ts | use-deepgram-connection.ts | Renommer, abstraire |
| use-voice-timeouts.ts | Direct copy | Aucune |
| use-turn-coordination.ts | Direct copy | Update imports |
| use-llm-integration.ts | Direct copy | Aucune |
| use-silero-vad.ts | Direct copy | Update imports |
| use-turn-detector.ts | Direct copy | Update imports |

#### Etape 3: useVoiceConversation (2h)
Porter le hook orchestrateur complet depuis KOND:
- 700 lignes
- Compose les 7 sub-hooks
- 9 states FSM
- Tous les callbacks

#### Etape 4: Barrel Exports (30min)
Mettre a jour `src/react/index.ts`:
```typescript
// Orchestrators
export { useVoiceKit } from "./use-voice-kit";
export { useVoiceConversation } from "./use-voice-conversation";

// Composable hooks
export * from "./hooks";

// Types
export * from "./types";

// Components
export { VoiceButton } from "./VoiceButton";
```

#### Etape 5: Build & Test (1h)
- `pnpm build`
- Fix type errors
- Verify exports

---

## 6. Migration KOND (Phase 7)

Apres Phase 6b, KOND devient un simple consumer:

```typescript
// src/hooks/use-voice-conversation.ts
import { useVoiceConversation } from "@kond/voicekit/react";

// Re-export directement ou wrapper mince pour KOND-specific
export { useVoiceConversation };

// OU avec observability KOND
export function useKondVoiceConversation(options) {
  const voice = useVoiceConversation({
    ...options,
    onTrace: (event) => {
      // KOND observability
      queueTrace(event);
    },
  });
  return voice;
}
```

Suppression dans KOND:
```
src/hooks/voice/           # SUPPRIMER (remplace par SDK)
src/lib/voice/             # SUPPRIMER (remplace par SDK)
```

---

## 7. Checklist Finale

- [ ] `src/react/types.ts` - 9 states, constants
- [ ] `src/react/hooks/use-audio-setup.ts`
- [ ] `src/react/hooks/use-stt-connection.ts`
- [ ] `src/react/hooks/use-voice-timeouts.ts`
- [ ] `src/react/hooks/use-turn-coordination.ts`
- [ ] `src/react/hooks/use-llm-integration.ts`
- [ ] `src/react/hooks/use-silero-vad.ts`
- [ ] `src/react/hooks/use-turn-detector.ts`
- [ ] `src/react/hooks/index.ts`
- [ ] `src/react/use-voice-conversation.ts`
- [ ] `src/react/index.ts` - Updated exports
- [ ] `pnpm build` passes
- [ ] KOND migre vers SDK

---

## 8. Estimation

| Tache | Temps |
|-------|-------|
| Types React | 30min |
| 7 Composable Hooks | 4h |
| useVoiceConversation | 2h |
| Barrel Exports | 30min |
| Build & Test | 1h |
| **Total Phase 6b** | **~8h** |
| Migration KOND (Phase 7) | 3h |
| **Total** | **~11h** |
