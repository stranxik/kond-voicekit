/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VOICEKIT_API_KEY: string;
  readonly VITE_LLM_PROVIDER: string;
  readonly VITE_LLM_MODEL: string;
  readonly VITE_ANTHROPIC_API_KEY: string;
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OLLAMA_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
