/**
 * Deepgram Adapter - Streaming STT via WebSocket
 *
 * Connects to a WebSocket proxy (Railway voice-ws or custom) which proxies to Deepgram.
 * This avoids CORS issues and keeps API keys server-side.
 */

import type { StreamingSTTPort, StreamingCallbacks, TranscriptionResult } from "../../ports/stt";
import type { TraceEvent } from "../../types/config";
import { getEndpointUrl, ENDPOINT_PATHS, DEFAULT_BASE_URL } from "../../types/config";

// ============================================
// CONFIGURATION
// ============================================

/**
 * Deepgram adapter configuration
 */
export interface DeepgramConfig {
  /** API base URL @default "https://kond.studio/api/voice/v1" */
  baseUrl?: string;
  /** VoiceKit API key (vk_xxx) - required for token fetch */
  apiKey?: string;
  /** WebSocket URL override (normally returned by token endpoint) */
  wsUrl?: string;
  /** Optional trace callback for observability */
  onTrace?: (event: TraceEvent) => void;
}

let globalConfig: DeepgramConfig = {
  baseUrl: DEFAULT_BASE_URL,
};

/**
 * Configure Deepgram adapter globally
 * @internal Usually not needed - SDK handles this automatically
 */
export function configureDeepgram(config: Partial<DeepgramConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current Deepgram config
 * @internal
 */
export function getDeepgramConfig(): DeepgramConfig {
  return { ...globalConfig };
}

// ============================================
// ADAPTER IMPLEMENTATION
// ============================================

interface DeepgramMessage {
  type: "Ready" | "Transcript" | "UtteranceEnd" | "SpeechStarted" | "Error";
  transcript?: string;
  confidence?: number;
  is_final?: boolean;
  speech_final?: boolean;
  message?: string;
}

/**
 * Auth token response from gateway
 * Used when getAuthToken returns an object with token and wsUrl
 */
export interface TokenResponse {
  token: string;
  wsUrl: string;
  expiresIn?: number;
}

export class DeepgramStreamingAdapter implements StreamingSTTPort {
  private ws: WebSocket | null = null;
  private callbacks: StreamingCallbacks | null = null;
  private language: string = "fr";
  private streaming: boolean = false;
  private traceId: string = "";
  private startTime: number = 0;
  private audioSeconds: number = 0;
  private userId: string = "";
  private config: DeepgramConfig;

  // Audio buffering during reconnection
  private audioBuffer: ArrayBuffer[] = [];
  private isReconnecting: boolean = false;
  private static readonly MAX_BUFFER_SIZE = 50; // ~2s at 40ms chunks

  constructor(
    private getAuthToken: () => Promise<string | TokenResponse>,
    config?: Partial<DeepgramConfig>,
    userId?: string
  ) {
    this.userId = userId || "anonymous";
    this.config = { ...globalConfig, ...config };
  }

  async startStreaming(callbacks: StreamingCallbacks, language: string = "fr"): Promise<void> {
    if (this.streaming) {
      throw new Error("Already streaming");
    }

    this.callbacks = callbacks;
    this.language = language;
    this.traceId = this.generateTraceId();
    this.startTime = Date.now();
    this.audioSeconds = 0;

    // Get auth token (returns { token, wsUrl })
    const authResult = await this.getAuthToken();

    // Extract token and wsUrl
    let token: string;
    let baseWsUrl: string;

    if (typeof authResult === "string") {
      // Legacy: just token string, use config wsUrl
      token = authResult;
      if (!this.config.wsUrl) {
        throw new Error("WebSocket URL not configured and not returned by token endpoint");
      }
      baseWsUrl = this.config.wsUrl;
    } else {
      // New: { token, wsUrl } from gateway
      token = authResult.token;
      baseWsUrl = authResult.wsUrl || this.config.wsUrl || "";
    }

    if (!baseWsUrl) {
      throw new Error("WebSocket URL not available");
    }

    // Connect to WebSocket
    // Note: Token is passed via URL query param because browser WebSocket API
    // doesn't support custom headers. This is the industry-standard pattern.
    // The token is a short-lived session token (NOT the user's API key),
    // which was securely obtained via Authorization header above.
    const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}&lang=${language}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          // WebSocket connected, waiting for Ready message from Deepgram
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: DeepgramMessage = JSON.parse(event.data);
            this.handleMessage(msg);

            // Ready signal = resolve the promise
            if (msg.type === "Ready") {
              this.streaming = true;
              resolve();
            }
          } catch {
            // Ignore parse errors for non-JSON messages
          }
        };

        this.ws.onerror = () => {
          this.streaming = false;
          callbacks.onError(new Error("WebSocket connection error"));
          reject(new Error("WebSocket connection error"));
        };

        this.ws.onclose = (event) => {
          this.streaming = false;
          this.logTrace(event.code === 1000);
        };

        // Timeout for connection
        setTimeout(() => {
          if (!this.streaming) {
            this.close();
            reject(new Error("Connection timeout"));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming Deepgram message
   */
  private handleMessage(msg: DeepgramMessage): void {
    if (!this.callbacks) return;

    try {
      switch (msg.type) {
        case "Ready":
          console.log("[STT] Deepgram ready");
          this.callbacks.onReady?.();
          break;

        case "Transcript":
          if (msg.transcript) {
            const result: TranscriptionResult = {
              text: msg.transcript,
              language: this.language,
              confidence: msg.confidence || 0,
              isFinal: msg.is_final || false,
              speechFinal: msg.speech_final || false,
            };

            if (result.isFinal) {
              this.callbacks.onFinal(result);
            } else {
              this.callbacks.onInterim(result);
            }
          }
          break;

        case "UtteranceEnd":
          this.callbacks.onUtteranceEnd();
          break;

        case "SpeechStarted":
          this.callbacks.onSpeechStarted?.();
          break;

        case "Error":
          this.callbacks.onError(new Error(msg.message || "Deepgram error"));
          break;
      }
    } catch (err) {
      try {
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // Silently fail to prevent WebSocket loop breakage
      }
    }
  }

  sendAudio(chunk: ArrayBuffer | Float32Array): void {
    // Convert Float32Array to Int16 PCM if needed
    let pcmData: ArrayBuffer;
    if (chunk instanceof Float32Array) {
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      pcmData = int16.buffer;
    } else {
      pcmData = chunk;
    }

    // Buffer audio during reconnection
    if (this.isReconnecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.audioBuffer.push(pcmData);
      if (this.audioBuffer.length > DeepgramStreamingAdapter.MAX_BUFFER_SIZE) {
        this.audioBuffer.shift(); // Drop oldest chunk
      }
      return;
    }

    // Track audio duration (16kHz, 16-bit = 32000 bytes/sec)
    this.audioSeconds += pcmData.byteLength / 32000;

    this.ws.send(pcmData);
  }

  /**
   * Flush buffered audio after reconnection
   */
  private flushAudioBuffer(): void {
    if (this.audioBuffer.length === 0) return;

    for (const chunk of this.audioBuffer) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.audioSeconds += chunk.byteLength / 32000;
        this.ws.send(chunk);
      }
    }
    this.audioBuffer = [];
  }

  /**
   * Mark adapter as reconnecting (pauses audio sending)
   */
  setReconnecting(value: boolean): void {
    this.isReconnecting = value;
    if (!value) {
      this.flushAudioBuffer();
    }
  }

  endAudio(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
    }
  }

  close(): void {
    if (this.ws) {
      this.endAudio();
      this.ws.close();
      this.ws = null;
    }
    this.streaming = false;
    this.callbacks = null;
    this.audioBuffer = [];
    this.isReconnecting = false;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  private generateTraceId(): string {
    return `tr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private logTrace(success: boolean): void {
    if (!this.config.onTrace) return;

    const latencyMs = Date.now() - this.startTime;
    // Cost calculation: Deepgram Nova-3 is ~$0.0059/min
    const minutes = this.audioSeconds / 60;
    const costCents = minutes * 0.59;

    this.config.onTrace({
      traceId: this.traceId,
      provider: "deepgram",
      operation: "stt_stream",
      latencyMs,
      costCents,
      metadata: {
        model: "nova-3",
        language: this.language,
        audioSeconds: Math.round(this.audioSeconds * 100) / 100,
        success,
        userId: this.userId,
      },
    });
  }
}

/**
 * Create a Deepgram streaming adapter
 * Uses VoiceKit gateway for authentication
 *
 * @param config Config with apiKey (required) and optional baseUrl
 * @param userId User ID for observability
 */
export function createDeepgramAdapter(
  config: Partial<DeepgramConfig> & { apiKey: string },
  userId?: string
): DeepgramStreamingAdapter {
  const mergedConfig = { ...globalConfig, ...config };
  const baseUrl = mergedConfig.baseUrl || DEFAULT_BASE_URL;
  const tokenUrl = getEndpointUrl(baseUrl, ENDPOINT_PATHS.token);

  const getAuthToken = async (): Promise<TokenResponse> => {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid VoiceKit API key");
      }
      if (response.status === 402) {
        throw new Error("VoiceKit quota exceeded");
      }
      throw new Error(`Failed to get voice token: ${response.status}`);
    }

    const data = await response.json();
    return {
      token: data.token,
      wsUrl: data.wsUrl,
      expiresIn: data.expiresIn,
    };
  };

  return new DeepgramStreamingAdapter(getAuthToken, mergedConfig, userId);
}

/**
 * Create a Deepgram adapter with custom auth token provider
 * For advanced use cases where you handle token fetching yourself
 */
export function createDeepgramAdapterWithAuth(
  getAuthToken: () => Promise<string | TokenResponse>,
  config?: Partial<DeepgramConfig>,
  userId?: string
): DeepgramStreamingAdapter {
  return new DeepgramStreamingAdapter(getAuthToken, config, userId);
}
