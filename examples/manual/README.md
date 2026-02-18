# VoiceKit Manual (Vanilla JS) Example

A voice AI agent demo using [@kond.studio/voicekit](https://github.com/stranxik/kond/tree/main/packages/voicekit) with vanilla JavaScript - no build step required.

## Features

- Voice input/output with VoiceKit SDK
- Multiple LLM providers (Claude, OpenAI, Ollama)
- Real-time transcript display
- Zero dependencies (just HTML, CSS, JS)
- Settings persistence (localStorage)

## Quick Start

### Option 1: With Local Server

```bash
# From the examples/manual folder
npx serve .
# or
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) (or the serve URL).

### Option 2: Open Directly

Just open `index.html` in your browser. Note: Some browsers may block module imports from `file://` URLs.

## SDK Setup

When `@kond.studio/voicekit` is published to npm, you can import it from a CDN:

```html
<script type="module">
  import { VoiceKit } from "https://esm.sh/@kond.studio/voicekit";

  const voice = new VoiceKit({
    apiKey: "your_key",
    locale: "en",
    onTranscript: async (text) => {
      const response = await myLLM(text);
      voice.speak(response);
    },
  });
</script>
```

For development, build the SDK first:

```bash
cd ../../  # packages/voicekit
pnpm build
```

## How It Works

```javascript
// Create VoiceKit instance
const voice = new VoiceKit({
  apiKey: "your_voicekit_key",
  locale: "en",
  onTranscript: async (text) => {
    // Call your LLM
    const response = await callLLM(text);
    // Speak the response
    voice.speak(response);
  },
  onStateChange: (state) => {
    updateUI(state);
  },
  onError: (error) => {
    showError(error.message);
  },
});

// Start listening
document.getElementById("start").onclick = () => voice.start();

// Stop
document.getElementById("stop").onclick = () => voice.stop();
```

## Files

- `index.html` - Main HTML structure
- `style.css` - Styling (dark theme)
- `script.js` - All logic (LLM calls, UI updates)

## License

MIT
