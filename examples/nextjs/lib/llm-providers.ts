export type LLMProvider = "claude" | "openai" | "ollama" | "echo";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  ollamaUrl?: string;
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  claude: "claude-3-haiku-20240307",
  openai: "gpt-4o-mini",
  ollama: "llama3.2",
  echo: "",
};

/**
 * Call the user's LLM provider
 */
export async function callLLM(
  text: string,
  config: LLMConfig,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const { provider, apiKey, model, ollamaUrl } = config;

  if (provider === "echo") {
    return `You said: "${text}"`;
  }

  if (!apiKey) {
    throw new Error(`API key required for ${provider}`);
  }

  const modelToUse = model || DEFAULT_MODELS[provider];

  switch (provider) {
    case "claude":
      return callClaude(text, apiKey, modelToUse, conversationHistory);
    case "openai":
      return callOpenAI(text, apiKey, modelToUse, conversationHistory);
    case "ollama":
      return callOllama(text, ollamaUrl || "http://localhost:11434", modelToUse, conversationHistory);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function callClaude(
  text: string,
  apiKey: string,
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages = [...history, { role: "user" as const, content: text }];

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
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "I couldn't generate a response.";
}

async function callOpenAI(
  text: string,
  apiKey: string,
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
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
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "I couldn't generate a response.";
}

async function callOllama(
  text: string,
  baseUrl: string,
  model: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages = [
    { role: "system", content: "You are a helpful voice assistant. Keep responses concise and conversational, suitable for speech. Aim for 1-3 sentences." },
    ...history,
    { role: "user", content: text },
  ];

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${error}`);
  }

  const data = await response.json();
  return data.message?.content || "I couldn't generate a response.";
}
