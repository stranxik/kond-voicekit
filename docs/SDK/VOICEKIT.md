# kond - voicekit SDK

> **"Donnez de la voix à votre agent IA"**
> `@kond.studio/voicekit` - SDK vocal pour agents IA

---

## ⚠️ Statut du SDK

| Mode | Statut | Description |
|------|--------|-------------|
| **Self-hosted** | ✅ Disponible | Bring your own endpoints (STT, TTS, Turn Detection) |
| **Managed Service** | 🗓️ Roadmap | Une clé API `vk_xxx`, tout inclus |

**Aujourd'hui** : Le SDK fonctionne en mode **self-hosted**. Vous fournissez vos propres endpoints (Deepgram, ElevenLabs, etc.) via la configuration.

**Demain** : Mode managed avec une seule clé API KOND qui gère tout (STT + TTS + ML).

---

## La Vraie Valeur de VoiceKit

Ce n'est pas le code. C'est **l'orchestration**.

N'importe qui peut connecter Deepgram + ElevenLabs.
Personne n'a envie de gérer :

- **9 états de conversation** (FSM complète avec edge cases)
- **VAD cooldown** (éviter faux positifs sur silences courts)
- **Barge-in** (interruption naturelle de l'IA)
- **Early trigger** (réponse avant fin de phrase complète)
- **Backchannels** ("mh", "ouais" → skip LLM, pas de réponse)
- **TTS queue avec prefetch** (audio sans gaps entre phrases)
- **Turn Detection ML** (LiveKit ONNX inclus, client-side)
- **Sentence accumulator** (chunking streaming pour TTS progressive)

**VoiceKit = des mois de R&D condensés en un import.**

```
Développeur sans VoiceKit          Développeur avec VoiceKit
─────────────────────────          ─────────────────────────
2-3 mois de dev                    1 jour d'intégration
Bugs VAD/timing subtils            Testé sur 1000+ conversations
Latence 3-5s                       Latence < 1.5s
Gapless audio à implémenter        Gapless audio natif
Turn detection à implémenter       ML turn detection inclus
```

---

## Exemple Backend Minimal (Self-Hosted)

> Ce que vous devez fournir pour utiliser VoiceKit en mode self-hosted.

### Endpoints requis

| Endpoint | Type | Description |
|----------|------|-------------|
| `/api/voice/stt` | WebSocket | Proxy vers Deepgram STT |
| `/api/voice/tts` | HTTP Stream | Proxy vers ElevenLabs TTS |
| `/api/voice/token` | HTTP GET | Token d'authentification (optionnel) |

### Pseudo-code (référence, non production)

```typescript
// /api/voice/stt (WebSocket proxy vers Deepgram)
export function handleSTT(ws: WebSocket) {
  const deepgram = new WebSocket(
    `wss://api.deepgram.com/v1/listen?model=nova-2&language=fr`,
    { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } }
  );

  ws.on('message', (audio) => deepgram.send(audio));
  deepgram.on('message', (transcript) => ws.send(transcript));
  ws.on('close', () => deepgram.close());
}

// /api/voice/tts (HTTP streaming proxy vers ElevenLabs)
export async function handleTTS(req: Request, res: Response) {
  const { text, voice_id = 'default' } = req.body;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
    }
  );

  // Stream audio back to client
  response.body.pipeTo(res);
}

// /api/voice/token (optionnel, pour auth WebSocket)
export function handleToken(req: Request, res: Response) {
  const token = signJWT({ userId: req.user.id, exp: Date.now() + 3600000 });
  res.json({ token });
}
```

### Mapping SDK Config ↔ Backend

| VoiceKit Config | Votre Backend |
|-----------------|---------------|
| `endpoints.sttWebSocket` | `/api/voice/stt` |
| `endpoints.ttsStream` | `/api/voice/tts` |
| `getAuthToken()` | `/api/voice/token` (optionnel) |

### Frameworks supportés

VoiceKit est **framework-agnostic** côté backend. Exemples compatibles :
- **Next.js** (API Routes ou App Router)
- **Hono** (comme KOND)
- **Express** / **Fastify**
- **Cloudflare Workers**
- **Deno** / **Bun**

---

## API Actuelle (Self-Hosted)

```typescript
import { VoiceKit } from '@kond.studio/voicekit';

const voice = new VoiceKit({
  // Auth (vous fournissez votre système d'auth)
  getAuthToken: () => fetchMyToken(),

  // Vos endpoints
  endpoints: {
    sttWebSocket: '/api/voice/stt',      // Votre proxy Deepgram
    ttsStream: '/api/voice/tts',          // Votre proxy ElevenLabs
    turnDetector: '/api/voice/turn',      // Turn detection API
    voiceToken: '/api/voice/token',       // Token pour auth
  },

  // Config voix
  voice: 'marie-fr',
  locale: 'fr',

  // Callback principal
  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },
});

await voice.start();
```

### React Hook (Self-Hosted)

```tsx
import { useVoiceKit } from '@kond.studio/voicekit/react';

const MyVoiceComponent = () => {
  const voice = useVoiceKit({
    getAuthToken: () => fetchMyToken(),
    locale: 'fr',
    onTranscript: async (text) => {
      const reply = await myLLM.chat(text);
      voice.speak(reply);
    },
  });

  return (
    <button onClick={voice.isListening ? voice.stop : voice.start}>
      {voice.isListening ? '🎤 Listening...' : '🔇 Click to speak'}
    </button>
  );
};
```

### Hooks Composables (pour orchestration custom)

```typescript
import {
  useAudioSetup,
  useSTTConnection,
  useTurnCoordination,
  useLLMIntegration,
  useSileroVAD,
  useTurnDetector,
} from '@kond.studio/voicekit/react';

// Build your own voice pipeline
const audio = useAudioSetup({ debug: true });
const stt = useSTTConnection({ userId: 'user-123', locale: 'fr' });
const vad = useSileroVAD({ threshold: 0.5 });
const turnDetector = useTurnDetector({ type: 'auto' });
// ... custom orchestration
```

---

## Vision Future (Managed Service) 🗓️

> **Roadmap** - Ce qui suit décrit la vision du service managé, pas encore disponible.

### Le problème aujourd'hui (que le managed service résoudra)

Ajouter la voix à un agent IA est **complexe et coûteux** :

```
Développeur veut faire parler son agent
        ↓
❌ Intégrer Deepgram/Whisper pour STT
❌ Gérer WebSocket + buffers audio
❌ Détecter quand l'user a fini de parler (VAD, end-of-turn)
❌ Éviter les faux positifs ("euh", "hm", silences courts)
❌ Intégrer ElevenLabs/OpenAI pour TTS
❌ Gérer les pauses entre phrases (gapless audio)
❌ Supporter le barge-in (user interrompt)
❌ Optimiser la latence (prefetching, early trigger)
        ↓
= 2-3 mois de dev, expertise audio, bugs subtils
```

### La solution @kond.studio/voicekit (Managed - Roadmap)

> ⚠️ Cette API avec `apiKey` n'est pas encore disponible. Voir "API Actuelle" ci-dessus.

```typescript
// ROADMAP - API managed service (pas encore disponible)
import { VoiceKit } from '@kond.studio/voicekit';

const voice = new VoiceKit({
  apiKey: process.env.KOND_API_KEY,  // Une seule clé (roadmap)
  voice: 'marie-fr',                  // Voix pré-configurée
  onTranscript: (text) => {
    // Mon agent répond (LLM au choix du dev)
    const reply = myAgent.chat(text);
    voice.speak(reply);
  },
});

voice.start(); // ← Mon agent parle en 5 lignes
```

**Avec le managed service** : STT, TTS (ElevenLabs), Turn Detection ML - tout inclus.
Le dev n'aura qu'à brancher son LLM.

### Ce que les users gagneront (avec managed service)

| Sans VoiceKit | Avec VoiceKit Managed (roadmap) |
|---------------------|---------------------|
| 2-3 mois de dev | 1 jour d'intégration |
| Expertise audio requise | Zero knowledge audio |
| Bugs VAD/timing subtils | Testé sur 1000s de conversations |
| Latence 3-5s | Latence < 1.5s (optimisé) |
| Barge-in à implémenter | Barge-in natif |
| TTS avec gaps | Gapless audio |
| Faux positifs fréquents | ML turn detection inclus (LiveKit ONNX) |

### Cas d'usage

1. **Chatbots vocaux** - Support client, assistants
2. **Apps éducatives** - Tuteurs IA, language learning
3. **Accessibilité** - Interfaces vocales pour malvoyants
4. **Gaming** - NPCs qui parlent avec le joueur
5. **Prototypage** - Tester une idée voice-first rapidement
6. **Agents autonomes** - Agents qui appellent des APIs et parlent

### Exemple concret : Tutor IA (Managed - Roadmap)

> ⚠️ Cet exemple utilise l'API managed service (pas encore disponible).

```typescript
// ROADMAP - API managed service
import { VoiceKit } from '@kond.studio/voicekit';
import { ChatAnthropic } from '@langchain/anthropic';

const tutor = new ChatAnthropic({ modelName: 'claude-sonnet-4-20250514' });
const history = [];

const voice = new VoiceKit({
  apiKey: process.env.KOND_API_KEY,  // Roadmap
  voice: 'sophie-fr',  // Voix chaleureuse pour un tuteur
  language: 'fr',

  onTranscript: async (studentQuestion) => {
    history.push({ role: 'user', content: studentQuestion });

    const response = await tutor.invoke(history);
    history.push({ role: 'assistant', content: response });

    voice.speak(response);
  },

  onStateChange: (state) => {
    if (state === 'listening') {
      updateUI('🎤 Pose ta question...');
    } else if (state === 'speaking') {
      updateUI('🗣️ Le tuteur répond...');
    }
  },
});

// UI: un seul bouton
<VoiceButton voice={voice} />
```

---

## Vision (Managed Service - Roadmap)

> 🗓️ Cette section décrit la vision du service managed.

Transformer le pipeline vocal KOND en SDK plug-and-play que d'autres développeurs peuvent intégrer dans leurs agents IA.

```
┌─────────────────────────────────────────────────────────────────┐
│  Développeur avec son Agent IA (Claude, GPT, etc.)              │
│                                                                  │
│  import { VoiceKit } from '@kond.studio/voicekit'                      │
│                                                                  │
│  const voice = new VoiceKit({                                   │
│    onTranscript: (text) => agent.chat(text),  // Son LLM        │
│    onResponse: (text) => voice.speak(text),   // Notre TTS      │
│  })                                                              │
│                                                                  │
│  voice.start() // Boom, son agent parle                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Analyse de Portabilité

### Ce qui est PORTABLE (~90%)

| Composant | Fichier | Complexité extraction |
|-----------|---------|----------------------|
| **TurnManager** | `lib/voice/turn-manager.ts` | ✅ Faible |
| **TTS Queue** | `lib/voice/tts-queue.ts` | ✅ Faible |
| **TTS Streaming** | `lib/voice/tts-streaming.ts` | ✅ Faible |
| **EOU Detector** | `lib/voice/eou-detector.ts` | ✅ Faible |
| **Trigger Detector** | `lib/voice/trigger-detector.ts` | ✅ Faible |
| **Silero VAD** | `hooks/voice/use-silero-vad.ts` | ✅ Faible |
| **State Machine** | `hooks/use-voice-conversation.ts` | ⚠️ Moyen |
| **Audio Setup** | `hooks/voice/use-audio-setup.ts` | ⚠️ Moyen |
| **Adapters (Cloud/ONNX)** | `lib/voice/adapters/*` | ✅ Faible |
| **Ports (Turn Detector)** | `lib/voice/ports/*` | ✅ Faible |

### Ce qui est COUPLÉ à KOND

| Composant | Couplage | Solution SDK |
|-----------|----------|--------------|
| **Auth (Stack Auth)** | JWT token generation | Callback `getToken()` |
| **Observability (Axiom)** | Logs & métriques | Callback `onMetrics()` |
| **Claude Integration** | Streaming via `/api/chat` | Callback `onTranscript()` + `speak()` |
| **Deepgram Proxy** | Railway `voice-ws` | Option: hosted ou self-host |
| **ElevenLabs TTS** | API via `/api/voice/tts` | Option: bring your own TTS |

---

## Architecture SDK Proposée

### Structure de package

```
@kond.studio/voicekit/
├── core/
│   ├── turn-manager.ts        # Signal fusion engine
│   ├── tts-queue.ts           # Sentence queue + prefetch
│   ├── tts-streaming.ts       # Web Audio playback
│   └── state-machine.ts       # 9-state conversation FSM
│
├── stt/
│   ├── deepgram-adapter.ts    # Deepgram STT
│   └── whisper-adapter.ts     # Local Whisper (future)
│
├── tts/
│   ├── elevenlabs-adapter.ts  # ElevenLabs TTS
│   ├── openai-adapter.ts      # OpenAI TTS
│   └── piper-adapter.ts       # Local Piper (future)
│
├── vad/
│   ├── silero-vad.ts          # Silero WASM
│   └── rms-vad.ts             # Simple RMS fallback
│
├── ml/
│   ├── cloud-detector.ts      # Remote ML
│   ├── onnx-detector.ts       # Local ONNX
│   └── heuristic-detector.ts  # Rule-based fallback
│
├── react/                      # React bindings
│   ├── use-voice-kit.ts
│   └── VoiceButton.tsx
│
└── index.ts                    # VoiceKit class
```

### API Surface

#### API Actuelle (Self-Hosted) ✅

```typescript
// @kond.studio/voicekit - DISPONIBLE MAINTENANT

interface VoiceKitConfig {
  // Auth (vous fournissez)
  getAuthToken?: () => Promise<string>;

  // Vos endpoints
  endpoints?: {
    sttWebSocket?: string;    // Votre proxy STT
    ttsStream?: string;       // Votre proxy TTS
    turnDetector?: string;    // Votre turn detector
    voiceToken?: string;      // Votre endpoint token
  };

  // Voix
  voice?: string;
  locale?: 'fr' | 'en';

  // Callback principal (required)
  onTranscript: (transcript: string) => void | Promise<void>;

  // Callbacks optionnels
  onStateChange?: (state: ConversationState) => void;
  onError?: (error: Error) => void;
}
```

#### API Managed (Roadmap) 🗓️

```typescript
// @kond.studio/voicekit - ROADMAP (pas encore disponible)

interface VoiceKitConfig {
  // Authentification (une seule clé)
  apiKey: string;              // Clé API KOND 'vk_xxx'

  // Voix (catalog ElevenLabs)
  voice: string;               // 'marie-fr', 'thomas-fr', 'emma-en', etc.
  language?: 'fr' | 'en';      // Langue par défaut

  // Callback principal (required)
  onTranscript: (transcript: string) => void | Promise<void>;

  // Callbacks optionnels
  onStateChange?: (state: ConversationState) => void;
  onError?: (error: VoiceError) => void;

  // Options avancées (pour power users)
  advanced?: {
    tts?: {
      speed?: number;           // 0.5-1.5 (défaut: optimisé par voix)
      stability?: number;       // 0-1 (ElevenLabs)
      similarityBoost?: number; // 0-1 (ElevenLabs)
    };
    turnDetection?: {
      confidenceThreshold?: number;  // 0-1 (défaut: 0.7)
      silenceTimeoutMs?: number;     // ms (défaut: 1200)
      detectBackchannels?: boolean;  // "mh", "ouais" (défaut: true)
    };
    timing?: {
      cooldownMs?: number;           // Pause après TTS (défaut: 150)
      bargeInSensitivity?: number;   // 0-1 (défaut: 0.8)
    };
  };
}

class VoiceKit {
  constructor(config: VoiceKitConfig);

  // Lifecycle
  start(): Promise<void>;
  stop(): void;

  // TTS control
  speak(text: string): Promise<void>;
  cancelSpeech(): void;

  // State
  readonly state: ConversationState;
  readonly isListening: boolean;
  readonly isSpeaking: boolean;
}
```

### Deux niveaux d'utilisation

#### Aujourd'hui (Self-Hosted) ✅

```typescript
// SIMPLE - Vous fournissez vos endpoints
const voice = new VoiceKit({
  getAuthToken: () => fetchToken(),
  locale: 'fr',
  onTranscript: (text) => { ... },
});

// AVANCÉ - Custom endpoints + callbacks
const voice = new VoiceKit({
  getAuthToken: () => fetchToken(),
  endpoints: {
    sttWebSocket: '/api/voice/stt',
    ttsStream: '/api/voice/tts',
  },
  locale: 'fr',
  onTranscript: (text) => { ... },
  onStateChange: (state) => console.log(state),
});
```

#### Demain (Managed - Roadmap) 🗓️

```typescript
// SIMPLE (90% des devs) - Nos presets optimisés
const voice = new VoiceKit({
  apiKey: 'vk_...',                     // Roadmap
  voice: 'marie-fr',
  onTranscript: (text) => { ... },
});

// AVANCÉ (10% des devs) - Override les settings
const voice = new VoiceKit({
  apiKey: 'vk_...',                     // Roadmap
  voice: 'marie-fr',
  onTranscript: (text) => { ... },
  advanced: {
    tts: { speed: 0.85 },
    turnDetection: { silenceTimeoutMs: 1500 },
  },
});
```

### Presets par voix (internes)

Chaque voix a des settings optimisés par notre équipe :

```typescript
// En interne - le dev n'a pas besoin de savoir
const VOICE_PRESETS = {
  'marie-fr': { speed: 0.92, stability: 0.75, silenceTimeoutMs: 1400 },
  'thomas-fr': { speed: 0.95, stability: 0.8, silenceTimeoutMs: 1300 },
  'emma-en': { speed: 1.0, stability: 0.8, silenceTimeoutMs: 1000 },
  // ...
};
```

### Exemple d'utilisation (Self-Hosted - Disponible) ✅

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const voice = new VoiceKit({
  getAuthToken: () => fetchMyVoiceToken(),
  endpoints: {
    sttWebSocket: '/api/voice/stt',
    ttsStream: '/api/voice/tts',
  },
  locale: 'fr',

  // User finished speaking → call your LLM
  onTranscript: async (text) => {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: text }],
    });

    const reply = response.content[0].text;
    voice.speak(reply);
  },

  onStateChange: (state) => {
    console.log('Voice state:', state);
  },
});

// Start listening
await voice.start();
```

### Exemple Managed (Roadmap) 🗓️

> ⚠️ API avec `apiKey` pas encore disponible.

```typescript
// ROADMAP - API managed service
const voice = new VoiceKit({
  apiKey: process.env.KOND_API_KEY,  // Roadmap
  voice: 'thomas-fr',
  language: 'fr',

  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },

  // Tweaks pour un cas spécifique
  advanced: {
    tts: {
      speed: 0.85,        // Voix plus lente (personnes âgées, accessibilité)
    },
    turnDetection: {
      silenceTimeoutMs: 2000,     // Plus de temps pour réfléchir
      detectBackchannels: false,  // Ignorer les "mh", "ok" (quiz mode)
    },
    timing: {
      cooldownMs: 300,            // Pause plus longue entre échanges
    },
  },
});
```

---

## Modèle Économique (Managed Service - Roadmap) 🗓️

> Cette section décrit le modèle économique pour le service managed (pas encore disponible).

### Options possibles

| Modèle | Description | Pros | Cons |
|--------|-------------|------|------|
| **Open Source + Platform** | SDK gratuit complet, Platform managed payante | Adoption max, revenus clairs | Deux produits à maintenir |
| **Enterprise License** | SDK payant pour entreprises | Revenus stables | Marché limité |

### Recommandation : SDK Tout-Inclus (modèle Vapi/Twilio)

```
SDK PAYANT - TOUT INCLUS
────────────────────────
✅ Une seule API key KOND
✅ STT intégré (Deepgram caché)
✅ TTS intégré (ElevenLabs - voix au choix)
✅ Turn Detection ML inclus
✅ Pas de compte Deepgram/ElevenLabs à créer

PRICING
───────
🆓 Free tier: 10 min/mois (pour tester)
💰 Puis: $0.05/min

ÉCONOMIE
────────
Notre coût: ~$0.008/min (Deepgram + ElevenLabs + infra)
Notre prix: $0.05/min
Marge: ~$0.04/min (80%)
```

**Pourquoi ce modèle** :
- UX magique : une clé, ça marche
- User ne gère pas 3 comptes/factures
- On cache la plomberie (STT), on montre la qualité (voix ElevenLabs)
- Free tier généreux pour tester, puis usage-based
- Modèle éprouvé (Vapi, Retell, Twilio)

---

## Backend Architecture (API Keys + Billing) 🗓️

> Cette section décrit l'architecture backend pour le service managed (pas encore implémenté).

### Stack technique

```
┌─────────────────────────────────────────────────────────────────┐
│  ISOLATION LOGIQUE : KOND ≠ VoiceKit                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  KOND Companion (B2C)              VoiceKit SDK (B2B)           │
│  ─────────────────────             ─────────────────            │
│  kond.studio/app                   kond.studio/voicekit         │
│  End users                         Developers                    │
│  Subscription mensuelle            Usage-based $0.05/min        │
│  metadata: { product: "kond" }     metadata: { product: "vk" }  │
│                                                                  │
│  → User KOND ne voit PAS VoiceKit et inversement                │
│  → Deux signup flows séparés, deux dashboards                   │
│  → Infra partagée (Stack Auth, Neon, Stripe) = moins de coût   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  STACK AUTH (partagé, isolation via metadata)                    │
│  ────────────────────────────────────────────                    │
│  ✅ Auth users (signup, login)                                   │
│  ✅ Stripe customer_id (metadata)                                │
│  ✅ Subscriptions (prod_kond_* ou prod_voicekit_*)              │
│  ✅ Metadata user: { product: "kond" | "voicekit" }             │
│                                                                  │
│  → Pas besoin de table users/stripe dans notre DB               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ user_id (Stack Auth ID)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEON (tables vk_*)                                              │
│  ─────────────────────                                           │
│  vk_api_keys    → Clés API par user                             │
│  vk_usage       → Minutes consommées par mois                   │
│  vk_sessions    → Analytics (optionnel)                         │
└─────────────────────────────────────────────────────────────────┘
```

### Environnements Dev/Staging/Prod

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENVIRONNEMENTS KOND                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SERVICE       DEV/STAGING                 PRODUCTION            │
│  ─────────     ───────────                 ──────────            │
│  Neon          br-hidden-hat-ag95n6vi      br-wandering-fire-*   │
│  Convex        prestigious-sheep-410       giant-ram-224         │
│  Axiom         voicekit-logs               voicekit-logs-prod    │
│  Vercel        staging.kond.studio         kond.studio           │
│                                                                  │
│  → Workflow: dev → staging → test → prod                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Schema Neon (nouvelles tables)

Les tables suivantes doivent être créées sur **les deux branches Neon** (dev et prod) :

```sql
-- API Keys
CREATE TABLE vk_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,              -- Stack Auth user ID
  key_prefix VARCHAR(20) NOT NULL,    -- 'vk_live_' | 'vk_test_'
  key_hash VARCHAR(64) NOT NULL,      -- SHA256
  name VARCHAR(100),                  -- "Production", "Dev"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,             -- NULL = active
  UNIQUE(key_hash)
);

-- Usage par mois
CREATE TABLE vk_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  month DATE NOT NULL,                -- Premier du mois (2025-01-01)
  minutes_used DECIMAL(10,2) DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  UNIQUE(user_id, month)
);

-- Index
CREATE INDEX idx_vk_api_keys_hash ON vk_api_keys(key_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_vk_usage_user ON vk_usage(user_id, month);
```

**Workflow migration** :
1. Créer sur `br-hidden-hat-ag95n6vi` (dev)
2. Tester sur staging.kond.studio
3. Créer sur `br-wandering-fire-agxc9lv6` (prod)

### Flow Billing

```
1. SIGNUP
   └── User crée compte kond.studio/voicekit (Stack Auth)
   └── Génère API key → vk_api_keys
   └── Free tier: 10 min/mois

2. VALIDATION (chaque requête SDK)
   └── Hash API key → lookup vk_api_keys
   └── Check vk_usage.minutes_used < 10 (ou user paid)
   └── Si exceeded: return 402

3. USAGE TRACKING (fin de session)
   └── UPDATE vk_usage SET minutes_used = minutes_used + X

4. UPGRADE (quand free tier exceeded)
   └── Stack Auth billing portal
   └── Crée subscription Stripe metered

5. BILLING (cron daily)
   └── Pour chaque paid user: report usage to Stripe
   └── Stripe facture automatiquement fin de mois
```

### Pas besoin de Unkey

Pour le MVP, on gère les API keys nous-mêmes :
- Génération : `vk_live_` + random bytes + base64
- Stockage : SHA256 hash dans `vk_api_keys`
- Validation : hash key → lookup → check usage

Unkey = optionnel plus tard si besoin de rate limiting avancé ou edge validation.

---

## Modèle LLM-Agnostic

VoiceKit est **indépendant du LLM**. L'utilisateur apporte son propre LLM :

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODÈLE VOICEKIT                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FOURNI PAR KOND                  FOURNI PAR L'UTILISATEUR      │
│  ───────────────                  ────────────────────────      │
│  ✅ STT (Deepgram)                ✅ Son LLM (Claude/GPT/etc)   │
│  ✅ TTS (ElevenLabs)              ✅ Sa clé API LLM             │
│  ✅ Turn Detection ML             ✅ Sa logique métier          │
│  ✅ State Machine 9 états                                       │
│  ✅ Clé API unique (vk_...)                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Fourni par KOND | Fourni par l'utilisateur |
|-----------------|-------------------------|
| STT (Deepgram) | LLM (Claude, GPT, Gemini, Llama...) |
| TTS (ElevenLabs) | Clé API LLM |
| Turn Detection ML | Logique métier |
| Clé API VoiceKit (`vk_...`) | |

**Pourquoi ce modèle ?**
- L'utilisateur garde le **contrôle total** de son LLM
- **Pas de vendor lock-in** : changez de LLM sans toucher à VoiceKit
- **Coûts LLM** = responsabilité de l'utilisateur (transparence)
- **VoiceKit = plomberie vocale** uniquement

**VoiceKit ne sait pas quel LLM est utilisé** - et c'est voulu. Le callback `onTranscript` est une boîte noire pour nous.

---

## Continuité SDK → Platform 🗓️

> Cette section décrit la migration future du self-hosted vers le managed service.

Le code sera **100% identique** entre le SDK self-hosted et la Platform managed :

```typescript
// AUJOURD'HUI (Self-Hosted)
const voice = new VoiceKit({
  getAuthToken: () => fetchToken(),
  locale: 'fr',
  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },
});

// DEMAIN (Managed - Roadmap)
const voice = new VoiceKit({
  apiKey: 'vk_...',           // Migration = juste ajouter la clé
  voice: 'marie-fr',
  onTranscript: async (text) => {
    const reply = await myLLM.chat(text);
    voice.speak(reply);
  },
});
```

| Aspect | SDK Standalone | Platform Managed |
|--------|---------------|------------------|
| **Code d'intégration** | Identique | Identique |
| **Génération clé API** | CLI / API | Dashboard UI |
| **Analytics** | Logs locaux | Dashboard visuel |
| **Voice cloning** | Non | Oui (UI) |
| **Billing** | API usage reporting | Portal Stripe |

**Migration SDK → Platform** : Changez juste votre clé API. Zero code change.

---

## Services Hébergés

### Existants (Railway)

| Service | Dev URL | Prod URL | Coût |
|---------|---------|----------|------|
| **voice-ws** (Deepgram proxy) | voice-ws-development.up.railway.app | voice-ws-production.up.railway.app | ~$10/mo |
| **turn-detector** (ML) | turn-detector-development.up.railway.app | turn-detector-production.up.railway.app | ~$20/mo |

### Pour SDK public

Ces services pourraient être ouverts aux utilisateurs du SDK :
- `api.kond.studio/voicekit/ws` → Deepgram proxy multi-tenant
- `api.kond.studio/voicekit/turn-detector` → Turn detector multi-tenant

Authentification via API key (pas JWT KOND).

---

## Effort d'Extraction

### Phase 1: Packaging minimal (1-2 semaines)

| Tâche | Effort |
|-------|--------|
| Créer monorepo `packages/voicekit` | 2h |
| Extraire `lib/voice/*` (core) | 4h |
| Abstraire callbacks (onTranscript, speak) | 8h |
| Supprimer imports KOND (Convex, Stack Auth) | 4h |
| Tests unitaires | 8h |
| Documentation API | 4h |

**Total Phase 1**: ~30h

### Phase 2: React bindings (1 semaine)

| Tâche | Effort |
|-------|--------|
| Hook `useVoiceKit` | 8h |
| Composant `<VoiceButton />` | 4h |
| Composant `<VoiceOrb />` | 4h |
| Storybook | 4h |

**Total Phase 2**: ~20h

### Phase 3: Multi-provider (2+ semaines)

| Tâche | Effort |
|-------|--------|
| Adapter pattern pour STT (Deepgram, Whisper) | 16h |
| Adapter pattern pour TTS (ElevenLabs, OpenAI, Piper) | 16h |
| Documentation providers | 8h |

**Total Phase 3**: ~40h

---

## Différenciateurs vs Concurrence

### Marché actuel

| Solution | Type | Force | Faiblesse |
|----------|------|-------|-----------|
| **LiveKit Agents** | SDK Python | Turn detection ML | Pas de React, pas de TTS queue |
| **Vapi.ai** | SaaS | Clé en main | Fermé, cher, pas de contrôle |
| **Retell.ai** | SaaS | UX polish | Fermé, couplé à leur LLM |
| **OpenAI Realtime** | API | Low latency | Limité à GPT-4, cher |
| **Hume.ai** | SaaS | Emotion | Très cher, API complexe |

### Notre différenciation

```
@kond.studio/voicekit

✅ UNE clé API → tout fonctionne (pas 3 comptes à créer)
✅ Free tier 10 min/mois → payant ensuite ($0.05/min)
✅ Turn Detection ML inclus (LiveKit ONNX, client-side)
✅ Heuristics FR/EN pour backchannels ("mh", "ouais", "ok")
✅ TTS Queue + Prefetching (gapless audio)
✅ Barge-in support natif
✅ State Machine 9 états (notre orchestration)
✅ Voix ElevenLabs au choix (qualité visible, plomberie cachée)
✅ React-first
✅ Options avancées pour power users
```

**Notre vraie valeur = l'orchestration + la commodité**, pas le modèle ML (qui est open source).
LiveKit fournit le modèle, nous fournissons l'intégration production-ready.
Le dev n'a pas à gérer 3 API keys et 3 factures.

---

## Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Distraction du produit KOND | Haut | Phase 1 après MVP stable |
| Support communauté chronophage | Moyen | Docs exhaustives, Discord |
| Copie par gros players | Moyen | Avancer vite, communauté |
| Maintenance double | Moyen | Monorepo, KOND consomme SDK |

---

## Questions Ouvertes

1. **Timing**: On lance maintenant ou après MVP KOND ?
2. **Scope minimal**: Juste core ou aussi React components ?
3. **Platform**: On lance la Platform managed en même temps que le SDK ou après ?

---

## Prochaines Étapes

Si on décide de lancer :

1. **Valider le scope** (questions ci-dessus)
2. **Créer `packages/voicekit`** dans le monorepo KOND
3. **Extraire le core** (phase 1)
4. **Publier beta** sur npm
5. **Landing page** kond.studio/voicekit
6. **Feedback early adopters**

---

## Résumé

### Statut Actuel ✅

**Le SDK VoiceKit est DISPONIBLE en mode self-hosted.**

- Architecture hexagonale (ports & adapters)
- Core agnostique (zero dépendances React)
- Build ESM/CJS + TypeScript types
- KOND l'utilise en production
- 109 tests passent

**Mode Self-Hosted (aujourd'hui)** :
- Vous fournissez vos propres endpoints (Deepgram, ElevenLabs, etc.)
- Hooks React composables pour orchestration custom
- VoiceKit class pour usage hors React

### Roadmap 🗓️

**Service Managed** (une seule clé API, tout inclus) :
- Free tier : 10 min/mois
- Puis : $0.05/min
- Voix ElevenLabs au choix
- Turn Detection ML inclus

**Recommandation**: Utiliser le SDK self-hosted maintenant, migrer vers managed quand disponible.
