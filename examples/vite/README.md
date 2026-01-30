# VoiceKit Vite Example

A voice AI agent demo using [@kond.studio/voicekit](https://www.npmjs.com/package/@kond.studio/voicekit) with Vite + React.

## Features

- Voice input/output with VoiceKit SDK
- Multiple LLM providers (Claude, OpenAI, Ollama)
- Real-time transcript display
- Lightweight build (~80kb)

## Quick Start

```bash
# Install dependencies (bun recommended)
bun install

# Start development server
bun dev
```

Open [http://localhost:5173](http://localhost:5173).

### Alternative package managers

```bash
# npm
npm install && npm run dev

# yarn
yarn && yarn dev

# pnpm
pnpm install && pnpm dev
```

## Build for Production

```bash
bun run build
bun run preview
```

## Configuration

See the [Next.js example README](../nextjs/README.md) for configuration details. The same LLM providers are supported:

- **Echo Mode** - No API key needed
- **Claude** - Anthropic API key
- **OpenAI** - OpenAI API key
- **Ollama** - Local LLM (no key needed)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

## License

MIT
