/**
 * TTS (Text-to-Speech) Adapters
 */

// Legacy adapter (to be removed in future version)
export {
  FetchTTSAdapter,
  createFetchTTSAdapter,
  configureFetchTTS,
  getFetchTTSConfig,
} from "./fetch-tts";
export type { FetchTTSConfig, FetchTTSAdapterOptions } from "./fetch-tts";

// New clean architecture adapter
export { HttpTTSSource, createHttpTTSSource } from "./http-tts-source";
export type { HttpTTSSourceConfig } from "./http-tts-source";
