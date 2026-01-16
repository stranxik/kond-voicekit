/**
 * VoiceKit Vanilla JS Example
 *
 * This example demonstrates how to use @kond/voicekit without any framework.
 *
 * Note: When @kond/voicekit is published to npm, you can import it from CDN:
 * import { VoiceKit } from "https://esm.sh/@kond/voicekit";
 *
 * For development, you need to build the SDK and serve it locally.
 */

// Configuration
const VOICEKIT_DEMO_KEY = "demo_key"; // Replace with real key for production
let voice = null;
let conversationHistory = [];

// DOM Elements
const providerSelect = document.getElementById("provider");
const apiKeyRow = document.getElementById("api-key-row");
const ollamaRow = document.getElementById("ollama-row");
const apiKeyInput = document.getElementById("api-key");
const modelInput = document.getElementById("model");
const ollamaUrlInput = document.getElementById("ollama-url");
const ollamaModelInput = document.getElementById("ollama-model");
const errorDiv = document.getElementById("error");
const transcriptDiv = document.getElementById("transcript");
const emptyState = document.getElementById("empty-state");
const modeInfo = document.getElementById("mode-info");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const providerLabel = document.getElementById("provider-label");
const voiceButton = document.getElementById("voice-button");
const buttonText = document.getElementById("button-text");

// State labels
const STATE_LABELS = {
  idle: "Ready",
  connecting: "Connecting...",
  listening: "Listening...",
  vad_cooldown: "Processing speech...",
  triggered: "Processing...",
  streaming: "Getting response...",
  processing: "Thinking...",
  speaking: "Speaking...",
  cooldown: "Cooldown...",
};

// Load saved config
function loadConfig() {
  try {
    const saved = localStorage.getItem("voicekit-demo-config");
    if (saved) {
      const config = JSON.parse(saved);
      if (config.provider) providerSelect.value = config.provider;
      if (config.apiKey) apiKeyInput.value = config.apiKey;
      if (config.model) modelInput.value = config.model;
      if (config.ollamaUrl) ollamaUrlInput.value = config.ollamaUrl;
      if (config.ollamaModel) ollamaModelInput.value = config.ollamaModel;
      updateProviderUI();
    }
  } catch (e) {
    console.error("Failed to load config:", e);
  }
}

// Save config
function saveConfig() {
  const config = {
    provider: providerSelect.value,
    apiKey: apiKeyInput.value,
    model: modelInput.value,
    ollamaUrl: ollamaUrlInput.value,
    ollamaModel: ollamaModelInput.value,
  };
  localStorage.setItem("voicekit-demo-config", JSON.stringify(config));
}

// Update UI based on provider
function updateProviderUI() {
  const provider = providerSelect.value;

  apiKeyRow.style.display = (provider === "claude" || provider === "openai") ? "flex" : "none";
  ollamaRow.style.display = provider === "ollama" ? "flex" : "none";

  if (provider === "claude") {
    apiKeyInput.placeholder = "sk-ant-...";
    modelInput.placeholder = "claude-3-haiku";
  } else if (provider === "openai") {
    apiKeyInput.placeholder = "sk-...";
    modelInput.placeholder = "gpt-4o-mini";
  }

  providerLabel.textContent = provider === "echo" ? "Echo Mode" : provider.toUpperCase();
  modeInfo.textContent = provider === "echo"
    ? "Echo mode: your speech will be repeated back"
    : `Using ${provider} for responses`;

  saveConfig();
}

// Show error
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  statusDot.className = "status-dot error";
}

// Hide error
function hideError() {
  errorDiv.style.display = "none";
}

// Add message to transcript
function addMessage(role, content) {
  // Hide empty state
  emptyState.style.display = "none";

  // Create message element
  const messageDiv = document.createElement("div");
  messageDiv.className = `message message-${role}`;

  const roleDiv = document.createElement("div");
  roleDiv.className = "message-role";
  roleDiv.textContent = role === "user" ? "You" : "Assistant";

  const textDiv = document.createElement("div");
  textDiv.className = "message-text";
  textDiv.textContent = content;

  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(textDiv);
  transcriptDiv.appendChild(messageDiv);

  // Scroll to bottom
  transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

  // Update history
  conversationHistory.push({ role, content });
  if (conversationHistory.length > 20) {
    conversationHistory = conversationHistory.slice(-20);
  }
}

// Update status
function updateStatus(state) {
  statusText.textContent = STATE_LABELS[state] || state;

  if (state === "idle") {
    statusDot.className = "status-dot";
    voiceButton.className = "voice-button start";
    buttonText.textContent = "Start Voice";
  } else if (state === "listening" || state === "vad_cooldown") {
    statusDot.className = "status-dot listening";
    voiceButton.className = "voice-button stop";
    buttonText.textContent = "Stop";
  } else {
    statusDot.className = "status-dot connected";
    voiceButton.className = "voice-button stop";
    buttonText.textContent = "Stop";
  }
}

// LLM Providers
async function callLLM(text, provider, apiKey, model, ollamaUrl) {
  if (provider === "echo") {
    return `You said: "${text}"`;
  }

  const history = conversationHistory.slice(0, -1); // Exclude current message

  switch (provider) {
    case "claude":
      return callClaude(text, apiKey, model || "claude-3-haiku-20240307", history);
    case "openai":
      return callOpenAI(text, apiKey, model || "gpt-4o-mini", history);
    case "ollama":
      return callOllama(text, ollamaUrl || "http://localhost:11434", model || "llama3.2", history);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function callClaude(text, apiKey, model, history) {
  const messages = [...history, { role: "user", content: text }];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: "You are a helpful voice assistant. Keep responses concise and conversational, suitable for speech. Aim for 1-3 sentences.",
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "I couldn't generate a response.";
}

async function callOpenAI(text, apiKey, model, history) {
  const messages = [
    { role: "system", content: "You are a helpful voice assistant. Keep responses concise and conversational, suitable for speech. Aim for 1-3 sentences." },
    ...history,
    { role: "user", content: text },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: 300, messages }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "I couldn't generate a response.";
}

async function callOllama(text, baseUrl, model, history) {
  const messages = [
    { role: "system", content: "You are a helpful voice assistant. Keep responses concise and conversational, suitable for speech. Aim for 1-3 sentences." },
    ...history,
    { role: "user", content: text },
  ];

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.message?.content || "I couldn't generate a response.";
}

// Handle transcript
async function handleTranscript(text) {
  hideError();
  addMessage("user", text);

  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value;
  const model = provider === "ollama" ? ollamaModelInput.value : modelInput.value;
  const ollamaUrl = ollamaUrlInput.value;

  try {
    const response = await callLLM(text, provider, apiKey, model, ollamaUrl);
    addMessage("assistant", response);
    if (voice) {
      voice.speak(response);
    }
  } catch (err) {
    showError(err.message);
    console.error("LLM error:", err);
  }
}

// Initialize VoiceKit
async function initVoiceKit() {
  try {
    // Try to import VoiceKit
    // When published to npm, use: const { VoiceKit } = await import("https://esm.sh/@kond/voicekit");
    // For local development, the SDK needs to be bundled and served

    // For now, show a message that the SDK needs to be set up
    console.log("VoiceKit initialization would happen here");
    console.log("To use this example:");
    console.log("1. Build the SDK: cd ../../ && pnpm build");
    console.log("2. Serve the dist folder or use a bundler");

    // Mock VoiceKit for demonstration
    voice = {
      state: "idle",
      start: () => {
        console.log("VoiceKit.start() - SDK not loaded");
        showError("VoiceKit SDK not loaded. See console for instructions.");
      },
      stop: () => {
        console.log("VoiceKit.stop()");
        updateStatus("idle");
      },
      speak: (text) => {
        console.log("VoiceKit.speak():", text);
      },
    };

    updateStatus("idle");

  } catch (err) {
    showError(`Failed to initialize VoiceKit: ${err.message}`);
    console.error("VoiceKit init error:", err);
  }
}

// Toggle voice
function toggleVoice() {
  if (!voice) {
    showError("VoiceKit not initialized");
    return;
  }

  if (voice.state === "idle") {
    // Validate config
    const provider = providerSelect.value;
    if (provider !== "echo" && provider !== "ollama" && !apiKeyInput.value) {
      showError("API key required for " + provider);
      return;
    }

    hideError();
    voice.start();
  } else {
    voice.stop();
  }
}

// Event listeners
providerSelect.addEventListener("change", updateProviderUI);
apiKeyInput.addEventListener("input", saveConfig);
modelInput.addEventListener("input", saveConfig);
ollamaUrlInput.addEventListener("input", saveConfig);
ollamaModelInput.addEventListener("input", saveConfig);
voiceButton.addEventListener("click", toggleVoice);

// Initialize
loadConfig();
updateProviderUI();
initVoiceKit();

// Export for debugging
window.voiceKitDemo = {
  voice,
  handleTranscript,
  addMessage,
};
