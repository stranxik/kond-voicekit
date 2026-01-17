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

# @kond.studio/voicekit

> **Voice I/O for AI agents — You bring your own LLM**
>
> VoiceKit handles STT, TTS, and turn detection. Your AI handles intelligence.
>
> **Zero LLM lock-in. Zero markup on your AI calls.**

---

## Installation

```bash
npm install @kond.studio/voicekit
# or
pnpm add @kond.studio/voicekit
# or
yarn add @kond.studio/voicekit
```

---

## Why VoiceKit?

Most voice AI platforms (Vapi, Retell, Hume) want to own your entire stack — including your LLM. They proxy your AI calls and charge markup on every token.

**VoiceKit is different:**

```
┌─────────────────────────────────────────────────────────────────┐
│  OTHER PLATFORMS                                                 │
│                                                                  │
│  Your App ──► Platform ──► LLM (their proxy) ──► Platform ──► App│
│                    └── 15-30% markup on tokens ──┘               │
│                                                                  │
│  Lock-in: Limited LLM choices, migration required to switch     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VOICEKIT                                                        │
│                                                                  │
│  Your App ──► VoiceKit ──► Your App ──► YOUR LLM (direct)       │
│                  │                           │                   │
│               Voice I/O                   Your choice            │
│          (STT, TTS, Turn)           (Claude/GPT/Gemini/...)     │
│                                                                  │
│  Freedom: Any LLM, switch anytime, pay your provider directly   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Early Access

VoiceKit is currently in **early access**.

Get your free API key at [kond.studio/developers/voicekit/keys](https://kond.studio/developers/voicekit/keys).

Free tier includes **100 minutes/month**.

---

## Quick Start

### With Claude (Anthropic)

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const voice = new VoiceKit({
  apiKey: 'vk_xxxxxxxxxxxx',
  locale: 'en',
  onTranscript: async (text) => {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: text }],
    });
    voice.speak(response.content[0].text);
  },
});

await voice.start();
```

### With GPT (OpenAI)

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import OpenAI from 'openai';

const openai = new OpenAI();

const voice = new VoiceKit({
  apiKey: 'vk_xxxxxxxxxxxx',
  locale: 'en',
  onTranscript: async (text) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: text }],
    });
    voice.speak(response.choices[0].message.content);
  },
});

await voice.start();
```

### With Gemini (Google)

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

const voice = new VoiceKit({
  apiKey: 'vk_xxxxxxxxxxxx',
  locale: 'en',
  onTranscript: async (text) => {
    const result = await model.generateContent(text);
    voice.speak(result.response.text());
  },
});

await voice.start();
```

### With Mistral

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import { Mistral } from '@mistralai/mistralai';

const mistral = new Mistral();

const voice = new VoiceKit({
  apiKey: 'vk_xxxxxxxxxxxx',
  locale: 'en',
  onTranscript: async (text) => {
    const response = await mistral.chat.complete({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: text }],
    });
    voice.speak(response.choices[0].message.content);
  },
});

await voice.start();
```

### With Ollama (Local LLM)

```typescript
import { VoiceKit } from '@kond.studio/voicekit';
import { Ollama } from 'ollama';

const ollama = new Ollama();

const voice = new VoiceKit({
  apiKey: 'vk_xxxxxxxxxxxx',
  locale: 'en',
  onTranscript: async (text) => {
    const response = await ollama.chat({
      model: 'llama3',
      messages: [{ role: 'user', content: text }],
    });
    voice.speak(response.message.content);
  },
});

await voice.start();
```

---

## Two API Keys

VoiceKit uses a simple two-key model:

| Key | Purpose | Who provides it |
|-----|---------|-----------------|
| `vk_xxx` | Voice I/O (STT, TTS, turn detection) | VoiceKit |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / etc. | Your LLM | You (direct from provider) |

**VoiceKit never sees your LLM calls.** The `onTranscript` callback is invisible to me — I only handle voice.

---

## Security Considerations

### API Key Storage

**DO:**
- Store `VOICEKIT_API_KEY` in environment variables (`.env.local`)
- Store LLM API keys server-side when possible
- Use short-lived tokens for client-side if needed

**DON'T:**
- Never hardcode API keys in source code
- Never store API keys in localStorage or cookies
- Never log API keys or transcripts in production

### HTTPS

VoiceKit enforces HTTPS in production. HTTP is only allowed for localhost development.

```typescript
// This will throw in production:
new VoiceKit({ baseUrl: 'http://insecure.example.com' }); // Error!

// OK in development:
new VoiceKit({ baseUrl: 'http://localhost:3000' }); // Works
```

### Data Privacy

- Transcripts are processed in real-time and not stored by VoiceKit
- Audio is streamed to STT provider (Deepgram) and not retained
- LLM calls go directly to your provider — VoiceKit never sees them

---

## React

```tsx
import { useVoiceKit } from '@kond.studio/voicekit/react';

function VoiceChat() {
  const voice = useVoiceKit({
    apiKey: process.env.NEXT_PUBLIC_VOICEKIT_API_KEY,
    locale: 'en',
    onTranscript: async (text) => {
      const reply = await myLLM.chat(text);  // Your LLM, your choice
      voice.speak(reply);
    },
  });

  return (
    <button onClick={voice.isActive ? voice.stop : voice.start}>
      {voice.isActive ? 'Listening...' : 'Start Voice'}
    </button>
  );
}
```

---

## What's Included

VoiceKit handles the hard parts of voice:

| Feature | Description |
|---------|-------------|
| **Speech-to-Text** | Optimized STT with streaming transcription |
| **Text-to-Speech** | Natural voices with gapless audio queue |
| **Turn Detection** | ML-powered end-of-utterance detection |
| **VAD** | Local voice activity detection |
| **Barge-in** | Natural user interruption support |
| **Backchannels** | Filters "mh", "yeah", "ok" (no LLM call) |
| **9-state FSM** | Battle-tested conversation orchestration |

---

## Languages

```
SUPPORTED LOCALES
─────────────────
├─ "en"     English
├─ "fr"     French
└─ "multi"  Multilingual (auto-detects EN/FR/ES/DE/IT/PT/JA/NL/RU/HI)
```

---

## Pricing

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PLAN              │ MINUTES/MONTH      │ PRICE        │ OVERAGE         │
├────────────────────┼────────────────────┼──────────────┼─────────────────┤
│  Free              │ 100                │ $0/mo        │ Blocked         │
│  Starter           │ 500                │ $19/mo       │ $0.05/min       │
│  Pro               │ 3000               │ $99/mo       │ $0.03/min       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Note:** This is just VoiceKit pricing. Your LLM costs are separate and go directly to your provider.

---

## vs Competition

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LLM COMPARISON                                 │
├──────────────┬───────────────┬───────────────┬───────────────┬──────────┤
│              │ VoiceKit      │ Vapi.ai       │ Retell.ai     │ Hume.ai  │
├──────────────┼───────────────┼───────────────┼───────────────┼──────────┤
│ LLM choice   │ ANY           │ Limited       │ Limited       │ EVI only │
│              │               │ (their proxy) │ (their proxy) │          │
├──────────────┼───────────────┼───────────────┼───────────────┼──────────┤
│ LLM markup   │ 0%            │ ~15-30%       │ ~10-25%       │ Included │
│              │ (pay direct)  │ on tokens     │ on tokens     │          │
├──────────────┼───────────────┼───────────────┼───────────────┼──────────┤
│ Local LLM    │ Yes           │ No            │ No            │ No       │
│ (Ollama)     │               │               │               │          │
├──────────────┼───────────────┼───────────────┼───────────────┼──────────┤
│ Switch LLM   │ 1 line change │ Migration     │ Migration     │ N/A      │
├──────────────┼───────────────┼───────────────┼───────────────┼──────────┤
│ See prompts? │ Never         │ Yes (proxy)   │ Yes (proxy)   │ Yes      │
└──────────────┴───────────────┴───────────────┴───────────────┴──────────┘
```

---

## Turn Detection

VoiceKit offers ML-powered turn detection:

| Mode | Accuracy | Latency | Cost |
|------|----------|---------|------|
| **cloud** (default) | Best | ~100ms | Metered |
| **heuristic** | Basic | ~0ms | Free |

```typescript
// Use heuristic fallback (free)
const voice = new VoiceKit({
  apiKey: 'vk_xxx',
  turnDetection: { type: 'heuristic' },
});
```

---

## Use Cases

- **Voice chatbots** — Customer support, virtual assistants
- **Educational apps** — AI tutors, language learning
- **Accessibility** — Voice interfaces for visually impaired
- **Gaming** — NPCs that talk with players
- **Autonomous agents** — Agents that report back vocally

---

## Documentation

Full documentation: [kond.studio/developers/voicekit/docs](https://kond.studio/developers/voicekit/docs)

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
│             @kond.studio/voicekit — built with care                          │
│                                                                          │
│          Voice I/O for AI agents. You bring your own LLM.               │
│                                                                          │
│                            2025                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
