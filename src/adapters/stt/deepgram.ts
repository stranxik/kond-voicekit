/**
 * Deepgram Adapter - Streaming STT via WebSocket
 *
 * Connects to a WebSocket proxy (Railway voice-ws or custom) which proxies to Deepgram.
 * This avoids CORS issues and keeps API keys server-side.
 */

import type { StreamingSTTPort, StreamingCallbacks, TranscriptionResult } from "../../ports/stt";
import type { TraceEvent } from "../../types/config";

// ============================================
// CONFIGURATION
// ============================================

/**
 * Deepgram adapter configuration
 */
export interface DeepgramConfig {
  /** WebSocket URL for STT streaming (e.g., wss://voice-ws.example.com) */
  wsUrl: string;
  /** Token endpoint URL (default: /api/voice/token) */
  tokenUrl?: string;
  /** Optional trace callback for observability */
  onTrace?: (event: TraceEvent) => void;
}

let globalConfig: DeepgramConfig = {
  wsUrl: "",
  tokenUrl: "/api/voice/token",
};

/**
 * Configure Deepgram adapter globally
 * Call this before creating adapters to set your backend URLs
 */
export function configureDeepgram(config: Partial<DeepgramConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current Deepgram config
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
    private getAuthToken: () => Promise<string>,
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

    if (!this.config.wsUrl) {
      throw new Error("Deepgram wsUrl not configured. Call configureDeepgram() first.");
    }

    this.callbacks = callbacks;
    this.language = language;
    this.traceId = this.generateTraceId();
    this.startTime = Date.now();
    this.audioSeconds = 0;

    // Get auth token
    const token = await this.getAuthToken();

    // Connect to WebSocket
    const wsUrl = `${this.config.wsUrl}?token=${encodeURIComponent(token)}&lang=${language}`;

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
 * @param config Optional config override
 * @param userId User ID for observability
 */
export function createDeepgramAdapter(
  config?: Partial<DeepgramConfig> & { tokenUrl?: string },
  userId?: string
): DeepgramStreamingAdapter {
  const mergedConfig = { ...globalConfig, ...config };
  const tokenUrl = mergedConfig.tokenUrl || "/api/voice/token";

  const getAuthToken = async (): Promise<string> => {
    const response = await fetch(tokenUrl, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to get voice token: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  };

  return new DeepgramStreamingAdapter(getAuthToken, mergedConfig, userId);
}

/**
 * Create a Deepgram adapter with custom auth token provider
 */
export function createDeepgramAdapterWithAuth(
  getAuthToken: () => Promise<string>,
  config?: Partial<DeepgramConfig>,
  userId?: string
): DeepgramStreamingAdapter {
  return new DeepgramStreamingAdapter(getAuthToken, config, userId);
}
