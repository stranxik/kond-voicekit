/**
 * HTTP TTS Source Adapter
 *
 * Fetches TTS audio from an HTTP streaming endpoint.
 * Uses HttpClientPort for all network I/O.
 */

import type { HttpClientPort } from "../../ports/http-client";
import type {
  TTSSourcePort,
  TTSFetchOptions,
  TTSAudioResult,
  PrefetchedAudio,
} from "../../ports/tts-source";
import type { Locale } from "../../types/config";
import { TTSError } from "../../errors";
import { buildEndpointUrl, ENDPOINTS, resolveVoiceId } from "../../config";

/**
 * Configuration for HttpTTSSource
 */
export interface HttpTTSSourceConfig {
  /** TTS stream endpoint URL (full URL or baseUrl) */
  ttsStreamUrl?: string;
  /** Base URL (used if ttsStreamUrl is not set) */
  baseUrl?: string;
  /** Default voice ID */
  defaultVoice?: string;
  /** Default TTS model */
  defaultModel?: string;
}

/**
 * HTTP-based TTS Source
 *
 * Streams PCM audio from a TTS API endpoint.
 * Audio format: 24kHz, 16-bit signed little-endian, mono
 */
export class HttpTTSSource implements TTSSourcePort {
  private httpClient: HttpClientPort;
  private config: Required<HttpTTSSourceConfig>;
  private prefetchCounter = 0;
  private activePrefetches = new Map<string, {
    abortController: AbortController;
    chunks: Uint8Array[];
    totalBytes: number;
    isComplete: boolean;
    error?: Error;
  }>();

  constructor(httpClient: HttpClientPort, config: HttpTTSSourceConfig = {}) {
    this.httpClient = httpClient;
    this.config = {
      ttsStreamUrl: config.ttsStreamUrl ?? "",
      baseUrl: config.baseUrl ?? "https://kond.studio/api/voice/v1",
      defaultVoice: config.defaultVoice ?? "marie-fr",
      defaultModel: config.defaultModel ?? "",
    };
  }

  async fetchAudio(
    text: string,
    locale: Locale,
    options?: TTSFetchOptions
  ): Promise<TTSAudioResult> {
    const url = this.getTTSUrl();
    const voice = resolveVoiceId(options?.voice ?? this.config.defaultVoice);

    const response = await this.httpClient.request({
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        text,
        locale,
        voice,
        model: options?.model ?? (this.config.defaultModel || undefined),
        speed: options?.speed,
      },
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "TTS request failed" })) as { error?: string };
      throw new TTSError(errorData.error ?? `TTS failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new TTSError("TTS response has no body");
    }

    return {
      contentType: "audio/pcm",
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      stream: this.streamFromReadable(response.body),
    };
  }

  async prefetch(
    text: string,
    locale: Locale,
    options?: TTSFetchOptions
  ): Promise<PrefetchedAudio> {
    const id = `prefetch-${++this.prefetchCounter}`;
    const abortController = new AbortController();

    const state = {
      abortController,
      chunks: [] as Uint8Array[],
      totalBytes: 0,
      isComplete: false,
      error: undefined as Error | undefined,
    };

    this.activePrefetches.set(id, state);

    // Start fetching in background
    this.fetchInBackground(id, text, locale, {
      ...options,
      signal: abortController.signal,
    });

    return {
      id,
      get isComplete() {
        return state.isComplete;
      },
      get totalBytes() {
        return state.totalBytes;
      },
      get error() {
        return state.error;
      },
      getResult: () => this.getPrefetchResult(id),
    };
  }

  cancelPrefetch(handle: PrefetchedAudio): void {
    const state = this.activePrefetches.get(handle.id);
    if (state && !state.isComplete) {
      state.abortController.abort();
      this.activePrefetches.delete(handle.id);
    }
  }

  private getTTSUrl(): string {
    if (this.config.ttsStreamUrl) {
      return this.config.ttsStreamUrl;
    }
    return buildEndpointUrl(this.config.baseUrl, "ttsStream");
  }

  private async *streamFromReadable(
    readable: ReadableStream<Uint8Array>
  ): AsyncIterable<Uint8Array> {
    const reader = readable.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async fetchInBackground(
    id: string,
    text: string,
    locale: Locale,
    options: TTSFetchOptions
  ): Promise<void> {
    const state = this.activePrefetches.get(id);
    if (!state) return;

    try {
      const result = await this.fetchAudio(text, locale, options);

      for await (const chunk of result.stream) {
        if (state.abortController.signal.aborted) break;
        state.chunks.push(chunk);
        state.totalBytes += chunk.length;
      }

      state.isComplete = true;
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        state.error = error instanceof Error ? error : new Error(String(error));
        state.isComplete = true;
      }
    }
  }

  private async getPrefetchResult(id: string): Promise<TTSAudioResult> {
    const state = this.activePrefetches.get(id);
    if (!state) {
      throw new TTSError("Prefetch not found");
    }

    // Wait for completion if not done
    while (!state.isComplete) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (state.error) {
      throw state.error;
    }

    // Return cached chunks as a stream
    const chunks = state.chunks;
    return {
      contentType: "audio/pcm",
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      stream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
    };
  }
}

/**
 * Create an HttpTTSSource instance
 */
export function createHttpTTSSource(
  httpClient: HttpClientPort,
  config?: HttpTTSSourceConfig
): HttpTTSSource {
  return new HttpTTSSource(httpClient, config);
}
