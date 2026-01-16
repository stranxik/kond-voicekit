# VoiceKit Vite Example

A voice AI agent demo using [@kond/voicekit](https://github.com/stranxik/kond/tree/main/packages/voicekit) with Vite + React.

## Features

- Voice input/output with VoiceKit SDK
- Multiple LLM providers (Claude, OpenAI, Ollama)
- Real-time transcript display
- Lightweight build (~80kb)
- Settings persistence (localStorage)

## Quick Start

```bash
# From the monorepo root
pnpm install

# Run the example
cd packages/voicekit/examples/vite
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build for Production

```bash
pnpm build
pnpm preview
```

## Configuration

See the [Next.js example README](../nextjs/README.md) for configuration details. The same LLM providers are supported:

- **Echo Mode** - No API key needed
- **Claude** - Anthropic API key
- **OpenAI** - OpenAI API key
- **Ollama** - Local LLM (no key needed)

## License

MIT
