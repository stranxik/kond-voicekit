// src/types/config.ts
var DEFAULT_CONFIG = {
  voice: "marie-fr",
  locale: "fr",
  turnDetection: {
    confidenceThreshold: 0.7,
    silenceTimeoutMs: 1200,
    detectBackchannels: true
  },
  tts: {
    speed: 1
  },
  timing: {
    cooldownMs: 150,
    gracePeriodMs: 2e3,
    maxSilenceMs: 2500
  },
  debug: false
};
var DEFAULT_BASE_URL = "https://kond.studio/api/voice/v1";
function getEndpointUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}
var ENDPOINT_PATHS = {
  token: "/token",
  turnDetect: "/turn-detect",
  ttsStream: "/tts/stream"
};

// src/adapters/stt/deepgram.ts
var globalConfig = {
  baseUrl: DEFAULT_BASE_URL
};
function configureDeepgram(config2) {
  globalConfig = { ...globalConfig, ...config2 };
}
function getDeepgramConfig() {
  return { ...globalConfig };
}
var _DeepgramStreamingAdapter = class _DeepgramStreamingAdapter {
  // ~2s at 40ms chunks
  constructor(getAuthToken, config2, userId) {
    this.getAuthToken = getAuthToken;
    this.ws = null;
    this.callbacks = null;
    this.language = "fr";
    this.streaming = false;
    this.traceId = "";
    this.startTime = 0;
    this.audioSeconds = 0;
    this.userId = "";
    // Audio buffering during reconnection
    this.audioBuffer = [];
    this.isReconnecting = false;
    this.userId = userId || "anonymous";
    this.config = { ...globalConfig, ...config2 };
  }
  async startStreaming(callbacks, language = "fr") {
    if (this.streaming) {
      throw new Error("Already streaming");
    }
    this.callbacks = callbacks;
    this.language = language;
    this.traceId = this.generateTraceId();
    this.startTime = Date.now();
    this.audioSeconds = 0;
    const authResult = await this.getAuthToken();
    let token;
    let baseWsUrl;
    if (typeof authResult === "string") {
      token = authResult;
      if (!this.config.wsUrl) {
        throw new Error("WebSocket URL not configured and not returned by token endpoint");
      }
      baseWsUrl = this.config.wsUrl;
    } else {
      token = authResult.token;
      baseWsUrl = authResult.wsUrl || this.config.wsUrl || "";
    }
    if (!baseWsUrl) {
      throw new Error("WebSocket URL not available");
    }
    const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}&lang=${language}`;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
        };
        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
            if (msg.type === "Ready") {
              this.streaming = true;
              resolve();
            }
          } catch {
          }
        };
        this.ws.onerror = () => {
          this.streaming = false;
          callbacks.onError(new Error("WebSocket connection error"));
          reject(new Error("WebSocket connection error"));
        };
        this.ws.onclose = (event) => {
          this.streaming = false;
          this.logTrace(event.code === 1e3);
        };
        setTimeout(() => {
          if (!this.streaming) {
            this.close();
            reject(new Error("Connection timeout"));
          }
        }, 1e4);
      } catch (error) {
        reject(error);
      }
    });
  }
  /**
   * Handle incoming Deepgram message
   */
  handleMessage(msg) {
    if (!this.callbacks) return;
    try {
      switch (msg.type) {
        case "Ready":
          console.log("[STT] Deepgram ready");
          this.callbacks.onReady?.();
          break;
        case "Transcript":
          if (msg.transcript) {
            const result = {
              text: msg.transcript,
              language: this.language,
              confidence: msg.confidence || 0,
              isFinal: msg.is_final || false,
              speechFinal: msg.speech_final || false
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
      }
    }
  }
  sendAudio(chunk) {
    let pcmData;
    if (chunk instanceof Float32Array) {
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 32768 : s * 32767;
      }
      pcmData = int16.buffer;
    } else {
      pcmData = chunk;
    }
    if (this.isReconnecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.audioBuffer.push(pcmData);
      if (this.audioBuffer.length > _DeepgramStreamingAdapter.MAX_BUFFER_SIZE) {
        this.audioBuffer.shift();
      }
      return;
    }
    this.audioSeconds += pcmData.byteLength / 32e3;
    this.ws.send(pcmData);
  }
  /**
   * Flush buffered audio after reconnection
   */
  flushAudioBuffer() {
    if (this.audioBuffer.length === 0) return;
    for (const chunk of this.audioBuffer) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.audioSeconds += chunk.byteLength / 32e3;
        this.ws.send(chunk);
      }
    }
    this.audioBuffer = [];
  }
  /**
   * Mark adapter as reconnecting (pauses audio sending)
   */
  setReconnecting(value) {
    this.isReconnecting = value;
    if (!value) {
      this.flushAudioBuffer();
    }
  }
  endAudio() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
    }
  }
  close() {
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
  isStreaming() {
    return this.streaming;
  }
  generateTraceId() {
    return `tr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  logTrace(success) {
    if (!this.config.onTrace) return;
    const latencyMs = Date.now() - this.startTime;
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
        userId: this.userId
      }
    });
  }
};
_DeepgramStreamingAdapter.MAX_BUFFER_SIZE = 50;
var DeepgramStreamingAdapter = _DeepgramStreamingAdapter;
function createDeepgramAdapter(config2, userId) {
  const mergedConfig = { ...globalConfig, ...config2 };
  const baseUrl = mergedConfig.baseUrl || DEFAULT_BASE_URL;
  const tokenUrl = getEndpointUrl(baseUrl, ENDPOINT_PATHS.token);
  const getAuthToken = async () => {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config2.apiKey}`
      }
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
      expiresIn: data.expiresIn
    };
  };
  return new DeepgramStreamingAdapter(getAuthToken, mergedConfig, userId);
}
function createDeepgramAdapterWithAuth(getAuthToken, config2, userId) {
  return new DeepgramStreamingAdapter(getAuthToken, config2, userId);
}

// src/adapters/vad/silero-vad.ts
import { MicVAD } from "@ricky0123/vad-web";
var DEFAULT_CONFIG2 = {
  threshold: 0.5,
  minSpeechDuration: 250,
  silenceDuration: 700,
  hysteresisFrames: 3,
  // Use jsdelivr CDN for VAD model - avoids need to copy 2.3MB file to public/
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  modelVersion: "v5"
};
var SileroVADAdapter = class {
  // 1s, 2s, 3s with exponential backoff
  constructor(config2) {
    this.vad = null;
    this.speechProbability = 0;
    this.isActive = false;
    this.stream = null;
    this.loadAttempts = 0;
    this.maxRetries = 3;
    this.baseRetryDelay = 1e3;
    this.config = { ...DEFAULT_CONFIG2, ...config2 };
  }
  async init() {
    console.log("[SileroVAD] Initialized");
  }
  start(stream, callbacks) {
    if (this.isActive) {
      console.warn("[SileroVAD] Already running");
      return;
    }
    this.isActive = true;
    this.stream = stream;
    const vadOptions = {
      // Stream handling - provide existing stream
      getStream: async () => stream,
      // Thresholds (Silero recommends negative = positive - 0.15)
      positiveSpeechThreshold: this.config.threshold,
      negativeSpeechThreshold: this.config.threshold - 0.15,
      // Timing (in ms)
      minSpeechMs: this.config.minSpeechDuration,
      redemptionMs: this.config.silenceDuration,
      preSpeechPadMs: 100,
      // Model selection
      model: this.config.modelVersion || "v5",
      // Asset paths
      baseAssetPath: this.config.baseAssetPath,
      onnxWASMBasePath: this.config.onnxWASMBasePath,
      // Start immediately when loaded
      startOnLoad: true,
      // Callbacks
      onSpeechStart: () => {
        console.log("[SileroVAD] Speech started");
        callbacks.onSpeechStart?.();
      },
      onSpeechEnd: (_audio) => {
        console.log("[SileroVAD] Speech ended");
        callbacks.onSpeechEnd?.();
      },
      onVADMisfire: () => {
        console.log("[SileroVAD] Misfire (too short)");
      },
      onFrameProcessed: (probabilities, _frame) => {
        this.speechProbability = probabilities.isSpeech;
        callbacks.onSpeechProbability?.(probabilities.isSpeech);
      }
    };
    this.loadVADWithRetry(vadOptions, callbacks);
  }
  /**
   * Attempt to load Silero VAD with retry logic
   * If loading fails (network issues, CDN unavailable), retry with exponential backoff
   * RMS-based barge-in fallback in TurnManager ensures functionality even if VAD fails
   */
  async loadVADWithRetry(vadOptions, callbacks) {
    this.loadAttempts++;
    const attempt = this.loadAttempts;
    try {
      const vad = await MicVAD.new(vadOptions);
      this.vad = vad;
      console.log(
        "%c[VAD] Silero VAD ACTIVE (ML-based)",
        "color: #22c55e; font-weight: bold",
        `(attempt ${attempt}/${this.maxRetries})`
      );
    } catch (error) {
      console.warn(
        `[VAD] Silero VAD load attempt ${attempt}/${this.maxRetries} failed:`,
        error
      );
      if (this.loadAttempts < this.maxRetries && this.isActive && this.stream) {
        const retryDelay = this.baseRetryDelay * this.loadAttempts;
        console.log(`[VAD] Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        if (this.isActive && this.stream) {
          return this.loadVADWithRetry(vadOptions, callbacks);
        }
      }
      console.error(
        "%c[VAD] Silero VAD FAILED after retries - RMS fallback active",
        "color: #ef4444; font-weight: bold",
        error
      );
      callbacks.onError?.(error);
      this.isActive = false;
    }
  }
  stop() {
    if (this.vad) {
      this.vad.pause();
      this.vad.destroy();
      this.vad = null;
    }
    this.isActive = false;
    this.speechProbability = 0;
    this.stream = null;
    this.loadAttempts = 0;
    console.log("[SileroVAD] Stopped");
  }
  isRunning() {
    return this.isActive && this.vad !== null;
  }
  getSpeechProbability() {
    return this.speechProbability;
  }
};
function createSileroVAD(config2) {
  return new SileroVADAdapter(config2);
}

// src/ports/turn-detector.ts
var DEFAULT_TURN_DETECTOR_CONFIG = {
  detectBackchannels: true,
  detectInterruptions: true,
  confidenceThreshold: 0.7,
  maxContextTurns: 4,
  debug: false
};

// src/adapters/turn-detector/heuristic.ts
var BACKCHANNEL_FR = [
  /^(mm-?h?m+|hm+|uhm?)\.?$/i,
  /^(oui|ouais|ouep|ok|okay|d'accord|d'acc)\.?$/i,
  /^(entendu|compris|pigé|je vois)\.?$/i,
  /^(ah|ah bon|ah oui|ah d'accord)\.?$/i,
  /^(bien|très bien|parfait|super|génial)\.?$/i,
  /^(merci|thanks)\.?$/i
];
var BACKCHANNEL_EN = [
  /^(mm-?h?m+|uh-?huh|hm+|uhm?)\.?$/i,
  /^(yeah|yep|yup|yes|ok|okay|sure|got it)\.?$/i,
  /^(i see|i understand|right|exactly|correct)\.?$/i,
  /^(ah|oh|oh i see|oh ok|oh okay)\.?$/i,
  /^(good|great|nice|perfect|awesome)\.?$/i,
  /^(thanks|thank you)\.?$/i
];
var INCOMPLETE_PATTERNS_FR = [
  /\b(là je|et je|mais je|donc je|alors je|quand je|si je|comme je)\s*$/i,
  /\b(là tu|et tu|mais tu|donc tu|alors tu|quand tu|si tu)\s*$/i,
  /\b(là il|et il|mais il|donc il|alors il|quand il|si il)\s*$/i,
  /\b(là on|et on|mais on|donc on|alors on|quand on|si on)\s*$/i,
  /\b(là c'est|et c'est|mais c'est|donc c'est|alors c'est)\s*$/i,
  /\b(je vais|il faut|c'est pour|parce que)\s*$/i,
  /\b(je voudrais|j'aimerais|je pense que|je crois que|je suis en train de)\s*$/i,
  /\b(et|mais|ou|donc|car|puis|alors|ensuite|que|qui)\s*$/i,
  /\b(pour que|afin de|avant de|après avoir|en train de)\s*$/i,
  /\b(de ne pas|de pas|à ne pas|pour ne pas)\s*$/i,
  /\b(de|à|pour|sans|avec|dans|sur|sous|par)\s+(le|la|les|l'|me|te|se|nous|vous|un|une|des|mon|ma|mes|ton|ta|tes|son|sa|ses)?\s*$/i,
  /\b(par rapport|au niveau|en ce qui|du fait|à propos)\s*(de|que|du)?\s*$/i,
  /\b(c'est|ce n'est pas|il y a|il n'y a pas|ça)\s*$/i,
  /\b(je|tu|il|elle|on|nous|vous|ils|elles)\s*$/i,
  /\b(le|la|les|l'|un|une|des|du|de la|ce|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s*$/i,
  /\b(qui|que|dont|où|lequel|laquelle|lesquels|lesquelles)\s*$/i
];
var INCOMPLETE_PATTERNS_EN = [
  /\b(so i|and i|but i|then i|when i|if i|as i|because i)\s*$/i,
  /\b(so you|and you|but you|then you|when you|if you)\s*$/i,
  /\b(so it|and it|but it|then it|when it|if it)\s*$/i,
  /\b(so that|and that|but that|then that|what)\s*$/i,
  /\b(i will|i want to|i need to|i'm going to|i have to)\s*$/i,
  /\b(i would like|i think that|i believe that|i was)\s*$/i,
  /\b(and|but|or|so|because|then|also|that|which|who)\s*$/i,
  /\b(in order to|before i|after i|while i)\s*$/i,
  /\b(to not|not to|to be|to have|to do|to get|to make|to take)\s*$/i,
  /\b(to|for|with|without|about|from|into)\s+(the|a|an|my|your|his|her|its|our|their|this|that|some)?\s*$/i,
  /\b(about the|regarding|in terms of|with respect to|according to)\s*$/i,
  /\b(it's|it is|there is|there are|this is|that is|here's|here is)\s*$/i,
  /\b(i'm|i am|we're|we are|you're|you are|they're|they are|he's|she's)\s*$/i,
  /\b(i|you|he|she|it|we|they)\s*$/i,
  /\b(the|a|an|this|that|these|those|my|your|his|her|its|our|their|some|any)\s*$/i,
  /\b(who|whom|whose|which|that|where|when)\s*$/i
];
var COMPLETE_PATTERNS_FR = [
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,
  /\b(merci|merci beaucoup|merci bien|je t'en prie|de rien)\.?$/i,
  /\b(voilà|c'est tout|c'est ça|c'est bon|ça y est|terminé)\.?$/i,
  /\b(oui|non|peut-être|je ne sais pas|aucune idée|pas du tout)\.?$/i,
  /\b(d'accord|ok|okay|bien sûr|évidemment|entendu|compris|très bien)\.?$/i,
  /\b(parfait|super|génial|excellent|nickel|top|impeccable)\.?$/i,
  /\b(au revoir|à bientôt|à plus|à plus tard|salut|ciao|bonne journée|bonne soirée)\.?$/i,
  /\b(j'ai fini|j'ai terminé|c'est terminé|c'est fait|fini|done)\.?$/i,
  /\b(stop|arrête|annule|continue|vas-y|go)\.?$/i
];
var COMPLETE_PATTERNS_EN = [
  /\b(please|if you would|if you could|if you don't mind)\.?$/i,
  /\b(thanks|thank you|thank you very much|thanks a lot|appreciate it)\.?$/i,
  /\b(that's it|that's all|i'm done|all set|all good|we're good)\.?$/i,
  /\b(yes|no|maybe|i don't know|not sure|no idea|absolutely|definitely)\.?$/i,
  /\b(okay|ok|alright|sure|of course|understood|got it|sounds good)\.?$/i,
  /\b(perfect|great|awesome|excellent|wonderful|fantastic|nice)\.?$/i,
  /\b(bye|goodbye|see you|see you later|later|take care|have a good one)\.?$/i,
  /\b(i'm done|i'm finished|that's everything|finished|done|complete)\.?$/i,
  /\b(stop|cancel|continue|go ahead|proceed|let's go)\.?$/i
];
function isBackchannel(transcript, confidence, locale) {
  const trimmed = transcript.trim().toLowerCase();
  const patterns = locale === "fr" ? BACKCHANNEL_FR : BACKCHANNEL_EN;
  return patterns.some((p) => p.test(trimmed)) && transcript.length < 25 && confidence > 0.75;
}
function isLikelyIncomplete(transcript, locale) {
  const patterns = locale === "fr" ? INCOMPLETE_PATTERNS_FR : INCOMPLETE_PATTERNS_EN;
  const trimmed = transcript.trim();
  if (trimmed.length < 3) return true;
  if (patterns.some((p) => p.test(trimmed))) return true;
  if (/\.{2,}$/.test(trimmed) || /…$/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const hasTerminalPunctuation3 = /[.!?。？！]$/.test(trimmed);
  if (/,\s*$/.test(trimmed)) return true;
  if (words.length === 1 && !hasTerminalPunctuation3) {
    const completeCommands = locale === "fr" ? /^(stop|arrête|annule|cancel|non|no|oui|yes|ok|merci|bonjour|salut)$/i : /^(stop|cancel|no|yes|ok|thanks|hello|hi|bye)$/i;
    if (!completeCommands.test(trimmed)) return true;
  }
  return false;
}
function isSemanticComplete(transcript, locale) {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR : COMPLETE_PATTERNS_EN;
  return patterns.some((p) => p.test(transcript.trim()));
}
function hasTerminalPunctuation(transcript) {
  return /[.!?。？！]$/.test(transcript.trim());
}
var HeuristicTurnDetector = class {
  constructor(options = {}) {
    this.name = "heuristic";
    this.history = [];
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options
    };
  }
  async init() {
    if (this.config.debug) {
      console.log("[HeuristicTurnDetector] Initialized");
    }
  }
  /**
   * Predict turn state using multi-signal heuristics
   */
  async predict(context) {
    const {
      transcript,
      sttConfidence,
      vadProbability,
      locale,
      silenceDurationMs,
      transcriptStableMs
    } = context;
    const trimmed = transcript.trim();
    const minSilence = this.options.minSilenceMs ?? 800;
    const minStable = this.options.minStableMs ?? 500;
    if (trimmed.length < 3) {
      return {
        shouldCommit: false,
        confidence: 0.9,
        reason: "incomplete"
      };
    }
    if (this.config.detectBackchannels && isBackchannel(transcript, sttConfidence, locale)) {
      return {
        shouldCommit: false,
        confidence: 0.85,
        reason: "backchannel"
      };
    }
    if (isLikelyIncomplete(transcript, locale)) {
      return {
        shouldCommit: false,
        confidence: 0.8,
        reason: "incomplete"
      };
    }
    if (vadProbability > 0.7) {
      return {
        shouldCommit: false,
        confidence: 0.7,
        reason: "incomplete"
      };
    }
    if (sttConfidence < this.config.confidenceThreshold) {
      return {
        shouldCommit: false,
        confidence: sttConfidence,
        reason: "incomplete"
      };
    }
    if (hasTerminalPunctuation(transcript)) {
      return {
        shouldCommit: true,
        confidence: 0.95,
        reason: "semantic_complete"
      };
    }
    if (isSemanticComplete(transcript, locale)) {
      return {
        shouldCommit: true,
        confidence: 0.9,
        reason: "semantic_complete"
      };
    }
    if (silenceDurationMs > minSilence && transcriptStableMs > minStable) {
      return {
        shouldCommit: true,
        confidence: 0.85,
        reason: "long_silence"
      };
    }
    return {
      shouldCommit: true,
      confidence: 0.75,
      reason: "model_prediction"
    };
  }
  addTurn(turn) {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
  }
  reset() {
    this.history = [];
  }
  destroy() {
    this.reset();
  }
  // Test helpers
  getHistory() {
    return [...this.history];
  }
};
function createHeuristicTurnDetector(options) {
  return new HeuristicTurnDetector(options);
}

// src/adapters/turn-detector/onnx.ts
import * as ort from "onnxruntime-web";

// src/adapters/turn-detector/tokenizer.ts
var BPETokenizer = class _BPETokenizer {
  constructor(tokenizerConfig) {
    this.initialized = false;
    // Special tokens for chat template
    this.BOS_TOKEN = "<|im_start|>";
    this.EOS_TOKEN = "<|im_end|>";
    this.PAD_TOKEN = "<|endoftext|>";
    this.config = this.parseConfig(tokenizerConfig);
    this.initialized = true;
  }
  /**
   * Parse tokenizer config into internal format
   */
  parseConfig(config2) {
    const vocab = /* @__PURE__ */ new Map();
    const reverseVocab = /* @__PURE__ */ new Map();
    for (const [token, id] of Object.entries(config2.vocab)) {
      vocab.set(token, id);
      reverseVocab.set(id, token);
    }
    const merges = /* @__PURE__ */ new Map();
    for (const merge of config2.merges) {
      const [a, b] = merge.split(" ");
      if (a && b) {
        merges.set(merge, a + b);
      }
    }
    const specialTokens = /* @__PURE__ */ new Map();
    if (config2.added_tokens) {
      for (const token of config2.added_tokens) {
        if (token.special) {
          specialTokens.set(token.content, token.id);
          if (!vocab.has(token.content)) {
            vocab.set(token.content, token.id);
            reverseVocab.set(token.id, token.content);
          }
        }
      }
    }
    const unkToken = config2.model?.unk_token || "<unk>";
    const unkTokenId = vocab.get(unkToken) ?? 0;
    return {
      vocab,
      reverseVocab,
      merges,
      specialTokens,
      unkToken,
      unkTokenId
    };
  }
  /**
   * Encode text to token IDs
   *
   * @param text - Text to encode
   * @param addSpecialTokens - Whether to add BOS/EOS tokens
   * @returns Array of token IDs
   */
  encode(text, addSpecialTokens = false) {
    if (!this.initialized) {
      throw new Error("Tokenizer not initialized");
    }
    const normalized = this.normalize(text);
    const words = this.preTokenize(normalized);
    const tokens = [];
    if (addSpecialTokens) {
      const bosId = this.config.specialTokens.get(this.BOS_TOKEN);
      if (bosId !== void 0) {
        tokens.push(bosId);
      }
    }
    for (const word of words) {
      const wordTokens = this.encodeWord(word);
      tokens.push(...wordTokens);
    }
    if (addSpecialTokens) {
      const eosId = this.config.specialTokens.get(this.EOS_TOKEN);
      if (eosId !== void 0) {
        tokens.push(eosId);
      }
    }
    return tokens;
  }
  /**
   * Encode for chat template (turn detection format)
   *
   * Format: <|im_start|>user\n{history}\nuser: {transcript}<|im_end|>
   *
   * @param transcript - Current user transcript
   * @param history - Optional conversation history
   * @returns Array of token IDs
   */
  encodeForTurnDetection(transcript, history) {
    let prompt = "";
    if (history && history.length > 0) {
      for (const turn of history) {
        prompt += `${turn.role}: ${turn.content}
`;
      }
    }
    prompt += `user: ${transcript}`;
    const fullPrompt = `${this.BOS_TOKEN}user
${prompt}${this.EOS_TOKEN}`;
    return this.encode(fullPrompt, false);
  }
  /**
   * Decode token IDs back to text
   *
   * @param ids - Token IDs
   * @returns Decoded text
   */
  decode(ids) {
    if (!this.initialized) {
      throw new Error("Tokenizer not initialized");
    }
    const tokens = [];
    for (const id of ids) {
      const token = this.config.reverseVocab.get(id);
      if (token !== void 0) {
        tokens.push(token);
      }
    }
    return this.postProcess(tokens.join(""));
  }
  /**
   * Get vocabulary size
   */
  get vocabSize() {
    return this.config.vocab.size;
  }
  /**
   * Get token ID for a specific token
   */
  getTokenId(token) {
    return this.config.vocab.get(token);
  }
  // =========================================================================
  // Internal methods
  // =========================================================================
  /**
   * Normalize text (Unicode NFC)
   */
  normalize(text) {
    return text.normalize("NFC");
  }
  /**
   * Pre-tokenize: split text into words
   * Uses GPT-2 style regex pre-tokenization
   */
  preTokenize(text) {
    const pattern = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
    const matches = text.match(pattern);
    return matches || [];
  }
  /**
   * Encode a single word using BPE
   */
  encodeWord(word) {
    if (this.config.vocab.has(word)) {
      return [this.config.vocab.get(word)];
    }
    if (this.config.specialTokens.has(word)) {
      return [this.config.specialTokens.get(word)];
    }
    let tokens = this.splitToChars(word);
    tokens = this.applyBPE(tokens);
    const ids = [];
    for (const token of tokens) {
      const id = this.config.vocab.get(token);
      if (id !== void 0) {
        ids.push(id);
      } else {
        const byteIds = this.encodeToBytes(token);
        ids.push(...byteIds);
      }
    }
    return ids;
  }
  /**
   * Split word into initial character tokens
   * Handles UTF-8 properly
   */
  splitToChars(word) {
    const chars = [];
    for (const char of word) {
      chars.push(char);
    }
    return chars;
  }
  /**
   * Apply BPE merges iteratively
   */
  applyBPE(tokens) {
    if (tokens.length <= 1) {
      return tokens;
    }
    let iteration = 0;
    const maxIterations = 1e3;
    while (iteration < maxIterations) {
      let bestMergeIdx = -1;
      let bestMergeKey = "";
      for (let i = 0; i < tokens.length - 1; i++) {
        const pair = `${tokens[i]} ${tokens[i + 1]}`;
        if (this.config.merges.has(pair)) {
          if (bestMergeIdx === -1) {
            bestMergeIdx = i;
            bestMergeKey = pair;
          }
        }
      }
      if (bestMergeIdx === -1) {
        break;
      }
      const merged = this.config.merges.get(bestMergeKey);
      tokens = [
        ...tokens.slice(0, bestMergeIdx),
        merged,
        ...tokens.slice(bestMergeIdx + 2)
      ];
      iteration++;
    }
    return tokens;
  }
  /**
   * Encode unknown characters as byte tokens
   * Used as fallback for characters not in vocabulary
   */
  encodeToBytes(text) {
    const ids = [];
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    for (const byte of bytes) {
      const byteToken = `<0x${byte.toString(16).toUpperCase().padStart(2, "0")}>`;
      const id = this.config.vocab.get(byteToken);
      if (id !== void 0) {
        ids.push(id);
      } else {
        ids.push(this.config.unkTokenId);
      }
    }
    return ids;
  }
  /**
   * Post-process decoded text
   * Handles GPT-style spacing markers
   */
  postProcess(text) {
    return text.replace(/Ġ/g, " ").replace(/Ċ/g, "\n").trim();
  }
  // =========================================================================
  // Static factory methods
  // =========================================================================
  /**
   * Load tokenizer from a URL
   *
   * @param url - URL to tokenizer.json
   * @returns Initialized tokenizer
   */
  static async fromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load tokenizer: ${response.status} ${response.statusText}`);
    }
    const config2 = await response.json();
    return new _BPETokenizer(config2);
  }
  /**
   * Create tokenizer from config object
   *
   * @param config - Tokenizer configuration
   * @returns Initialized tokenizer
   */
  static fromConfig(config2) {
    return new _BPETokenizer(config2);
  }
};

// src/adapters/turn-detector/model-cache.ts
var DB_NAME = "voicekit-models";
var DB_VERSION = 1;
var STORE_NAME = "onnx-models";
var ModelCache = class {
  constructor() {
    this.db = null;
    this.initPromise = null;
    this.isInitialized = false;
  }
  /**
   * Initialize the IndexedDB connection
   * Safe to call multiple times - will only open once
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }
    if (this.isInitialized && this.db) {
      return;
    }
    this.initPromise = this.openDatabase();
    await this.initPromise;
  }
  async openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        console.warn("[ModelCache] IndexedDB not available");
        resolve();
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        console.warn("[ModelCache] Failed to open database:", request.error);
        resolve();
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "modelId" });
          store.createIndex("version", "metadata.version", { unique: false });
        }
      };
    });
  }
  /**
   * Get a cached model by ID
   *
   * @param modelId - Unique model identifier
   * @param expectedVersion - Optional version for cache validation
   * @returns Model ArrayBuffer or null if not cached/outdated
   */
  async getModel(modelId, expectedVersion) {
    await this.init();
    if (!this.db) {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(modelId);
        request.onerror = () => {
          console.warn("[ModelCache] Failed to get model:", request.error);
          resolve(null);
        };
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          if (expectedVersion && result.metadata.version !== expectedVersion) {
            console.log(
              `[ModelCache] Version mismatch for ${modelId}: cached=${result.metadata.version}, expected=${expectedVersion}`
            );
            resolve(null);
            return;
          }
          resolve(result.data);
        };
      } catch (error) {
        console.warn("[ModelCache] Error reading model:", error);
        resolve(null);
      }
    });
  }
  /**
   * Store a model in the cache
   *
   * @param modelId - Unique model identifier
   * @param buffer - Model data
   * @param metadata - Model metadata (version, source URL, etc.)
   */
  async setModel(modelId, buffer, metadata) {
    await this.init();
    if (!this.db) {
      console.warn("[ModelCache] Database not available, skipping cache");
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const entry = {
          modelId,
          data: buffer,
          metadata: {
            ...metadata,
            modelId,
            sizeBytes: buffer.byteLength,
            cachedAt: Date.now()
          }
        };
        const request = store.put(entry);
        request.onerror = () => {
          console.warn("[ModelCache] Failed to store model:", request.error);
          resolve();
        };
        request.onsuccess = () => {
          console.log(
            `[ModelCache] Cached model ${modelId} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`
          );
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error storing model:", error);
        resolve();
      }
    });
  }
  /**
   * Check if a model exists in cache
   *
   * @param modelId - Model identifier
   * @param expectedVersion - Optional version check
   * @returns True if model is cached (and version matches if specified)
   */
  async hasModel(modelId, expectedVersion) {
    const model = await this.getModel(modelId, expectedVersion);
    return model !== null;
  }
  /**
   * Delete a model from cache
   *
   * @param modelId - Model identifier
   */
  async deleteModel(modelId) {
    await this.init();
    if (!this.db) {
      return;
    }
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(modelId);
        request.onerror = () => {
          console.warn("[ModelCache] Failed to delete model:", request.error);
          resolve();
        };
        request.onsuccess = () => {
          console.log(`[ModelCache] Deleted model ${modelId}`);
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error deleting model:", error);
        resolve();
      }
    });
  }
  /**
   * Clear all cached models
   */
  async clear() {
    await this.init();
    if (!this.db) {
      return;
    }
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => {
          console.warn("[ModelCache] Failed to clear cache:", request.error);
          resolve();
        };
        request.onsuccess = () => {
          console.log("[ModelCache] Cache cleared");
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error clearing cache:", error);
        resolve();
      }
    });
  }
  /**
   * Get cache metadata for all stored models
   */
  async getMetadata() {
    await this.init();
    if (!this.db) {
      return [];
    }
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onerror = () => {
          console.warn("[ModelCache] Failed to get metadata:", request.error);
          resolve([]);
        };
        request.onsuccess = () => {
          const entries = request.result;
          resolve(entries.map((e) => e.metadata));
        };
      } catch (error) {
        console.warn("[ModelCache] Error getting metadata:", error);
        resolve([]);
      }
    });
  }
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }
};

// src/config/defaults.ts
var ENVIRONMENTS = {
  production: {
    baseUrl: "https://kond.studio/api/voice/v1"
  },
  staging: {
    baseUrl: "https://staging.kond.studio/api/voice/v1"
  },
  development: {
    baseUrl: "http://localhost:3000/api/voice/v1"
  }
};
var ENDPOINTS = {
  /** Token exchange endpoint */
  token: "/token",
  /** Turn detection API */
  turnDetect: "/turn-detect",
  /** TTS streaming endpoint */
  ttsStream: "/tts/stream"
};
var VOICE_PRESETS = {
  "marie-fr": "9BWtsMINqrJLrRacOk9x",
  // ElevenLabs voice ID
  "thomas-fr": "ThT5KcBeYPX3keUQqHPh",
  "emma-en": "21m00Tcm4TlvDq8ikWAM",
  "james-en": "JBFqnCBsd6RMkjVDRZzb"
};
var DEFAULTS = {
  /** Default base URL for API calls (production) */
  baseUrl: "https://kond.studio/api/voice/v1",
  /** Default locale */
  locale: "fr",
  /** Default worklet URL */
  workletUrl: "/audio-processor.worklet.js",
  /** Turn detection defaults */
  turnDetection: {
    type: "auto",
    confidenceThreshold: 0.7,
    silenceTimeoutMs: 1200,
    detectBackchannels: true
  },
  /** TTS defaults */
  tts: {
    speed: 1
  },
  /** Internal timing */
  timing: {
    cooldownMs: 150,
    gracePeriodMs: 2e3,
    maxSilenceMs: 2500
  },
  /** Debug mode */
  debug: false
};
var ONNX_DEFAULTS = {
  /** ONNX model file (quantized INT8 for smaller size) */
  modelUrl: "https://huggingface.co/livekit/turn-detector/resolve/main/onnx/model_q8.onnx",
  /** Tokenizer config file */
  tokenizerUrl: "https://huggingface.co/livekit/turn-detector/resolve/main/tokenizer.json",
  /** Model version for cache invalidation */
  modelVersion: "1.2.0",
  /** Enable IndexedDB caching */
  enableCache: true,
  /** ONNX execution provider */
  executionProvider: "wasm",
  /** EOT probability threshold (0.6 = 60% confidence for end-of-turn) */
  eotThreshold: 0.6,
  /** Maximum input sequence length */
  maxSeqLength: 512
};
function getEnvironmentConfig(env2) {
  if (env2 && env2 in ENVIRONMENTS) {
    return ENVIRONMENTS[env2];
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv in ENVIRONMENTS) {
      return ENVIRONMENTS[nodeEnv];
    }
  }
  return ENVIRONMENTS.production;
}
function buildEndpointUrl(baseUrl, endpoint) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${ENDPOINTS[endpoint]}`;
}
function resolveVoiceId(voice) {
  if (voice in VOICE_PRESETS) {
    return VOICE_PRESETS[voice];
  }
  return voice;
}
function validateSecureUrl(baseUrl, debug) {
  const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  const isHttps = baseUrl.startsWith("https://");
  if (!isHttps && !isLocalhost) {
    if (isProduction) {
      throw new Error(
        `[VoiceKit] Security: HTTPS is required in production. Got: ${baseUrl.substring(0, 50)}`
      );
    } else if (debug) {
      console.warn(
        `[VoiceKit] Security warning: Using HTTP in non-production. Consider using HTTPS for ${baseUrl.substring(0, 50)}`
      );
    }
  }
}

// src/adapters/turn-detector/onnx.ts
var OnnxTurnDetector = class {
  constructor(options = {}) {
    this.name = "onnx";
    this.session = null;
    this.tokenizer = null;
    this.conversationHistory = [];
    this.initialized = false;
    this.initPromise = null;
    this.initFailed = false;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options
    };
    this.onnxConfig = {
      modelUrl: options.modelUrl || ONNX_DEFAULTS.modelUrl,
      tokenizerUrl: options.tokenizerUrl || ONNX_DEFAULTS.tokenizerUrl,
      modelVersion: options.modelVersion || ONNX_DEFAULTS.modelVersion,
      enableCache: options.enableCache ?? ONNX_DEFAULTS.enableCache,
      executionProvider: options.executionProvider || ONNX_DEFAULTS.executionProvider,
      eotThreshold: options.eotThreshold ?? ONNX_DEFAULTS.eotThreshold,
      maxSeqLength: options.maxSeqLength ?? ONNX_DEFAULTS.maxSeqLength
    };
    this.modelCache = new ModelCache();
    this.heuristicFallback = new HeuristicTurnDetector({
      ...options,
      debug: this.config.debug
    });
  }
  /**
   * Initialize the ONNX session and tokenizer
   * Downloads and caches model on first load
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }
    if (this.initialized) {
      return;
    }
    this.initPromise = this.doInit();
    return this.initPromise;
  }
  async doInit() {
    try {
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Initializing...");
      }
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      await this.modelCache.init();
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Loading tokenizer...");
      }
      this.tokenizer = await BPETokenizer.fromUrl(this.onnxConfig.tokenizerUrl);
      let modelBuffer = await this.modelCache.getModel(
        "turn-detector",
        this.onnxConfig.modelVersion
      );
      if (modelBuffer) {
        if (this.config.debug) {
          console.log("[OnnxTurnDetector] Loaded model from cache");
        }
      } else {
        if (this.config.debug) {
          console.log("[OnnxTurnDetector] Downloading model...");
        }
        const response = await fetch(this.onnxConfig.modelUrl);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status}`);
        }
        modelBuffer = await response.arrayBuffer();
        if (this.onnxConfig.enableCache) {
          await this.modelCache.setModel("turn-detector", modelBuffer, {
            version: this.onnxConfig.modelVersion,
            sourceUrl: this.onnxConfig.modelUrl
          });
        }
        if (this.config.debug) {
          console.log(
            `[OnnxTurnDetector] Downloaded model (${(modelBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`
          );
        }
      }
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Creating ONNX session...");
      }
      this.session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: [this.onnxConfig.executionProvider],
        graphOptimizationLevel: "all"
      });
      this.initialized = true;
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Initialized successfully");
        console.log("[OnnxTurnDetector] Input names:", this.session.inputNames);
        console.log("[OnnxTurnDetector] Output names:", this.session.outputNames);
      }
    } catch (error) {
      this.initFailed = true;
      console.warn(
        "[OnnxTurnDetector] Initialization failed, using heuristic fallback:",
        error
      );
      await this.heuristicFallback.init();
    }
  }
  /**
   * Predict if the current utterance is complete
   */
  async predict(context) {
    if (!this.initialized && !this.initFailed) {
      await this.init();
    }
    if (this.initFailed || !this.session || !this.tokenizer) {
      return this.heuristicFallback.predict(context);
    }
    try {
      const startTime = performance.now();
      const history = this.conversationHistory.map((t) => ({
        role: t.role,
        content: t.text
      }));
      const tokenIds = this.tokenizer.encodeForTurnDetection(
        context.transcript,
        history
      );
      const truncatedIds = tokenIds.slice(-this.onnxConfig.maxSeqLength);
      const inputTensor = new ort.Tensor(
        "int64",
        BigInt64Array.from(truncatedIds.map(BigInt)),
        [1, truncatedIds.length]
      );
      const attentionMask = new ort.Tensor(
        "int64",
        BigInt64Array.from(truncatedIds.map(() => BigInt(1))),
        [1, truncatedIds.length]
      );
      const feeds = {
        input_ids: inputTensor,
        attention_mask: attentionMask
      };
      const results = await this.session.run(feeds);
      const logits = this.extractLogits(results);
      const probabilities = this.softmax(logits);
      const eotProbability = probabilities[1] ?? 0;
      const latencyMs = performance.now() - startTime;
      if (this.config.debug) {
        console.log(`[OnnxTurnDetector] Inference: ${latencyMs.toFixed(1)}ms`);
        console.log(`[OnnxTurnDetector] EOT probability: ${(eotProbability * 100).toFixed(1)}%`);
      }
      const shouldCommit = eotProbability > this.onnxConfig.eotThreshold;
      return {
        shouldCommit,
        confidence: shouldCommit ? eotProbability : 1 - eotProbability,
        reason: shouldCommit ? "model_prediction" : "incomplete"
      };
    } catch (error) {
      console.warn("[OnnxTurnDetector] Inference failed:", error);
      return this.heuristicFallback.predict(context);
    }
  }
  /**
   * Add a completed turn to conversation history
   */
  addTurn(turn) {
    this.conversationHistory.push(turn);
    if (this.conversationHistory.length > (this.config.maxContextTurns || 4)) {
      this.conversationHistory.shift();
    }
    this.heuristicFallback.addTurn(turn);
  }
  /**
   * Reset state
   */
  reset() {
    this.conversationHistory = [];
    this.heuristicFallback.reset();
  }
  /**
   * Cleanup resources
   */
  destroy() {
    this.reset();
    this.session?.release();
    this.session = null;
    this.tokenizer = null;
    this.initialized = false;
    this.initPromise = null;
    this.modelCache.close();
    this.heuristicFallback.destroy();
  }
  // =========================================================================
  // Helper methods
  // =========================================================================
  /**
   * Extract logits from ONNX output
   * Handles different model output formats
   */
  extractLogits(results) {
    const outputNames = ["logits", "output", "probabilities"];
    let outputTensor = null;
    for (const name of outputNames) {
      if (results[name]) {
        outputTensor = results[name];
        break;
      }
    }
    if (!outputTensor) {
      const keys = Object.keys(results);
      if (keys.length > 0) {
        outputTensor = results[keys[0]];
      }
    }
    if (!outputTensor) {
      throw new Error("No output tensor found");
    }
    const data = outputTensor.data;
    if (data instanceof Float32Array || data instanceof Float64Array) {
      if (outputTensor.dims.length === 3) {
        const seqLen = outputTensor.dims[1];
        const vocabSize = outputTensor.dims[2];
        const startIdx = (seqLen - 1) * vocabSize;
        return [data[startIdx], data[startIdx + 1]];
      } else if (outputTensor.dims.length === 2) {
        return [data[0], data[1]];
      }
    }
    return [Number(data[0]), Number(data[1])];
  }
  /**
   * Apply softmax to logits
   */
  softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map((x) => Math.exp(x - maxLogit));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / sum);
  }
  // =========================================================================
  // Getters for testing/debugging
  // =========================================================================
  /**
   * Check if using fallback
   */
  get isUsingFallback() {
    return this.initFailed || !this.session;
  }
  /**
   * Get conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }
};
function createOnnxTurnDetector(options) {
  return new OnnxTurnDetector(options);
}

// src/adapters/turn-detector/cloud.ts
var CloudTurnDetector = class {
  constructor(options) {
    this.name = "cloud";
    this.history = [];
    this.fallbackDetector = null;
    this.options = {
      timeoutMs: options.timeoutMs ?? 2e3,
      maxRetries: options.maxRetries ?? 1,
      ...options
    };
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options
    };
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  }
  async init() {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Initializing with KOND API`);
    }
    this.fallbackDetector = createHeuristicTurnDetector(this.config);
    await this.fallbackDetector.init();
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Ready`);
    }
  }
  /**
   * Predict turn state by calling KOND API
   */
  async predict(context) {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] predict() - transcript: "${context.transcript.substring(0, 30)}..."`);
    }
    try {
      const prediction = await this.callApi(context);
      if (this.config.debug) {
        console.log(`[CloudTurnDetector] API response: ${prediction.reason} (${(prediction.confidence * 100).toFixed(0)}%)`);
      }
      return prediction;
    } catch (error) {
      console.warn("[CloudTurnDetector] API call failed, using fallback:", error);
      return this.useFallback(context, "api_error");
    }
  }
  /**
   * Get the auth token (apiKey or JWT token)
   */
  getAuthToken() {
    return this.options.token || this.options.apiKey || "";
  }
  /**
   * Call the KOND turn detector API
   */
  async callApi(context) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );
    try {
      const url = getEndpointUrl(this.baseUrl, ENDPOINT_PATHS.turnDetect);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          transcript: context.transcript,
          locale: context.locale,
          vadProbability: context.vadProbability,
          silenceDurationMs: context.silenceDurationMs,
          sttConfidence: context.sttConfidence,
          utteranceDurationMs: context.utteranceDurationMs,
          history: this.history.slice(-4)
          // Last 4 turns
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 402) {
        const data2 = await response.json();
        if (this.config.debug) {
          console.log("[CloudTurnDetector] Quota exceeded, using fallback");
        }
        if (this.options.onQuotaExceeded && data2.upgradeUrl) {
          this.options.onQuotaExceeded(data2.upgradeUrl);
        }
        return this.useFallback(context, "quota_exceeded");
      }
      if (response.status === 401) {
        console.warn("[CloudTurnDetector] Invalid API key (401)");
        return this.useFallback(context, "invalid_api_key");
      }
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        shouldCommit: data.shouldCommit,
        confidence: data.confidence,
        reason: data.reason || "model_prediction",
        predictedEndMs: data.predictedEndMs
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
  /**
   * Use fallback heuristic detector
   */
  async useFallback(context, reason) {
    if (this.config.debug) {
      console.log(`[CloudTurnDetector] Using fallback (${reason})`);
    }
    if (!this.fallbackDetector) {
      return {
        shouldCommit: context.silenceDurationMs > 1e3,
        confidence: 0.5,
        reason: "incomplete"
      };
    }
    return this.fallbackDetector.predict(context);
  }
  addTurn(turn) {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
    this.fallbackDetector?.addTurn(turn);
  }
  reset() {
    this.history = [];
    this.fallbackDetector?.reset();
  }
  destroy() {
    this.reset();
    this.fallbackDetector?.destroy();
    this.fallbackDetector = null;
  }
};
function createCloudTurnDetector(options) {
  return new CloudTurnDetector(options);
}

// src/adapters/turn-detector/mock.ts
var MockTurnDetector = class {
  constructor(options = {}) {
    this.name = "mock";
    this.history = [];
    this.predictCount = 0;
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options
    };
  }
  async init() {
    if (this.config.debug) {
      console.log("[MockTurnDetector] Initialized");
    }
  }
  async predict(context) {
    this.predictCount++;
    if (this.options.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }
    if (this.options.alwaysReturn) {
      return this.options.alwaysReturn;
    }
    if (this.options.incompleteUntil && this.predictCount <= this.options.incompleteUntil) {
      return {
        shouldCommit: false,
        confidence: 0.9,
        reason: "incomplete"
      };
    }
    return {
      shouldCommit: true,
      confidence: 0.85,
      reason: "model_prediction"
    };
  }
  addTurn(turn) {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
  }
  reset() {
    this.history = [];
    this.predictCount = 0;
  }
  destroy() {
    this.reset();
  }
  // Test helpers
  getHistory() {
    return [...this.history];
  }
  getPredictCount() {
    return this.predictCount;
  }
};
function createMockTurnDetector(options) {
  return new MockTurnDetector(options);
}

// src/adapters/http/fetch-client.ts
var FetchHttpClient = class {
  constructor(config2 = {}) {
    this.config = {
      timeout: 3e4,
      ...config2
    };
  }
  async request(req) {
    const url = this.buildUrl(req.url);
    const headers = {
      ...this.config.defaultHeaders,
      ...req.headers
    };
    if (req.body && typeof req.body === "object" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    let body;
    if (req.body !== void 0) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.config.timeout);
    const signal = req.signal ? this.combineSignals(req.signal, timeoutController.signal) : timeoutController.signal;
    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body,
        signal,
        credentials: req.credentials ?? this.config.credentials
      });
      clearTimeout(timeoutId);
      return this.wrapResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  buildUrl(url) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (this.config.baseUrl) {
      const base = this.config.baseUrl.endsWith("/") ? this.config.baseUrl.slice(0, -1) : this.config.baseUrl;
      const path = url.startsWith("/") ? url : `/${url}`;
      return `${base}${path}`;
    }
    return url;
  }
  wrapResponse(response) {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      json: () => response.json(),
      text: () => response.text(),
      arrayBuffer: () => response.arrayBuffer()
    };
  }
  combineSignals(userSignal, timeoutSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    userSignal.addEventListener("abort", abort);
    timeoutSignal.addEventListener("abort", abort);
    if (userSignal.aborted || timeoutSignal.aborted) {
      controller.abort();
    }
    return controller.signal;
  }
};
function createFetchHttpClient(config2) {
  return new FetchHttpClient(config2);
}

// src/adapters/utils/device-capability.ts
function detectDeviceCapabilities() {
  const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
  if (!isBrowser) {
    return {
      canRunLocalOnnx: false,
      deviceMemoryGB: null,
      hasWebAssembly: false,
      hasIndexedDB: false,
      isMobile: false,
      hardwareConcurrency: null
    };
  }
  const nav = navigator;
  const deviceMemoryGB = nav.deviceMemory ?? null;
  const hasWebAssembly = typeof WebAssembly !== "undefined" && typeof WebAssembly.instantiate === "function";
  const hasIndexedDB = "indexedDB" in window;
  const isMobile2 = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    nav.userAgent
  );
  const hardwareConcurrency = nav.hardwareConcurrency ?? null;
  const canRunLocalOnnx = !isMobile2 && hasWebAssembly && hasIndexedDB && (deviceMemoryGB === null || deviceMemoryGB >= 4);
  return {
    canRunLocalOnnx,
    deviceMemoryGB,
    hasWebAssembly,
    hasIndexedDB,
    isMobile: isMobile2,
    hardwareConcurrency
  };
}

// src/core/trigger-detector.ts
var VERB_PATTERNS_FR = [
  "cr\xE9er",
  "cr\xE9e",
  "cr\xE9\xE9",
  "ajouter",
  "ajoute",
  "ajout\xE9",
  "supprimer",
  "supprime",
  "supprim\xE9",
  "chercher",
  "cherche",
  "recherche",
  "ouvrir",
  "ouvre",
  "modifier",
  "modifie",
  "modifi\xE9",
  "envoyer",
  "envoie",
  "envoy\xE9",
  "trouver",
  "trouve",
  "trouv\xE9",
  "annuler",
  "annule",
  "annul\xE9",
  "mettre",
  "mets",
  "mis",
  "afficher",
  "affiche",
  "affich\xE9",
  "montrer",
  "montre",
  "montr\xE9",
  "lister",
  "liste",
  "list\xE9",
  "rappeler",
  "rappelle",
  "rappel\xE9",
  "planifier",
  "planifie",
  "planifi\xE9"
];
var VERB_PATTERNS_EN = [
  "create",
  "add",
  "delete",
  "remove",
  "search",
  "find",
  "look",
  "open",
  "modify",
  "edit",
  "change",
  "send",
  "cancel",
  "set",
  "put",
  "show",
  "display",
  "list",
  "remind",
  "schedule",
  "plan"
];
var OBJECT_PATTERNS_FR = [
  "\xE9v\xE9nement",
  "event",
  "\xE9v\xE8nement",
  "contact",
  "contacts",
  "fichier",
  "fichiers",
  "document",
  "calendrier",
  "agenda",
  "rappel",
  "reminder",
  "note",
  "notes",
  "t\xE2che",
  "t\xE2ches",
  "task",
  "r\xE9union",
  "meeting",
  "email",
  "mail",
  "message",
  "rendez-vous",
  "rdv",
  "d\xE9pense",
  "expense",
  "objectif",
  "goal",
  "habitude",
  "habit"
];
var OBJECT_PATTERNS_EN = [
  "event",
  "events",
  "contact",
  "contacts",
  "file",
  "files",
  "document",
  "calendar",
  "agenda",
  "reminder",
  "reminders",
  "note",
  "notes",
  "task",
  "tasks",
  "meeting",
  "meetings",
  "email",
  "mail",
  "message",
  "appointment",
  "expense",
  "expenses",
  "goal",
  "goals",
  "habit",
  "habits"
];
var VERB_REGEX = new RegExp(
  `\\b(${[...VERB_PATTERNS_FR, ...VERB_PATTERNS_EN].join("|")})\\b`,
  "i"
);
var OBJECT_REGEX = new RegExp(
  `\\b(${[...OBJECT_PATTERNS_FR, ...OBJECT_PATTERNS_EN].join("|")})\\b`,
  "i"
);
function analyzeTrigger(transcript, confidence) {
  const hasVerb = VERB_REGEX.test(transcript);
  const hasObject = OBJECT_REGEX.test(transcript);
  return {
    hasVerb,
    hasObject,
    confidence,
    transcript
  };
}
function shouldTriggerEarly(transcript, confidence, minConfidence = 0.8) {
  const state = analyzeTrigger(transcript, confidence);
  return state.hasVerb && state.hasObject && state.confidence >= minConfidence;
}
var BACKCHANNEL_FR2 = [
  /^(mm-?h?m+|hm+|uhm?)\.?$/i,
  /^(oui|ouais|ouep|ok|okay|d'accord|d'acc)\.?$/i,
  /^(entendu|compris|pigé|je vois)\.?$/i,
  /^(ah|ah bon|ah oui|ah d'accord)\.?$/i,
  /^(bien|très bien|parfait|super|génial)\.?$/i,
  /^(merci|thanks)\.?$/i
];
var BACKCHANNEL_EN2 = [
  /^(mm-?h?m+|uh-?huh|hm+|uhm?)\.?$/i,
  /^(yeah|yep|yup|yes|ok|okay|sure|got it)\.?$/i,
  /^(i see|i understand|right|exactly|correct)\.?$/i,
  /^(ah|oh|oh i see|oh ok|oh okay)\.?$/i,
  /^(good|great|nice|perfect|awesome)\.?$/i,
  /^(thanks|thank you)\.?$/i
];
function isBackchannel2(transcript, confidence, locale = "fr") {
  const trimmed = transcript.trim().toLowerCase();
  const patterns = locale === "fr" ? BACKCHANNEL_FR2 : BACKCHANNEL_EN2;
  return patterns.some((p) => p.test(trimmed)) && transcript.length < 25 && confidence > 0.75;
}
var INCOMPLETE_PATTERNS_FR2 = [
  // "X je/tu/il" patterns - user about to say what they'll do
  /\b(là je|et je|mais je|donc je|alors je|quand je|si je|comme je)\s*$/i,
  /\b(là tu|et tu|mais tu|donc tu|alors tu|quand tu|si tu)\s*$/i,
  /\b(là il|et il|mais il|donc il|alors il|quand il|si il)\s*$/i,
  /\b(là on|et on|mais on|donc on|alors on|quand on|si on)\s*$/i,
  /\b(là c'est|et c'est|mais c'est|donc c'est|alors c'est)\s*$/i,
  // Verb starters
  /\b(je vais|il faut|c'est pour|parce que)\s*$/i,
  /\b(je voudrais|j'aimerais|je pense que|je crois que|je suis en train de)\s*$/i,
  // Conjunctions at end
  /\b(et|mais|ou|donc|car|puis|alors|ensuite|que|qui)\s*$/i,
  // Subordinate clause starters
  /\b(pour que|afin de|avant de|après avoir|en train de)\s*$/i,
  // Infinitive patterns (de + verb, à + verb)
  /\b(de ne pas|de pas|à ne pas|pour ne pas)\s*$/i,
  /\b(de|à|pour|sans|avec|dans|sur|sous|par)\s+(le|la|les|l'|me|te|se|nous|vous|un|une|des|mon|ma|mes|ton|ta|tes|son|sa|ses)?\s*$/i,
  // Mid-sentence prepositions
  /\b(par rapport|au niveau|en ce qui|du fait|à propos)\s*(de|que|du)?\s*$/i,
  /\b(c'est|ce n'est pas|il y a|il n'y a pas|ça)\s*$/i,
  // Trailing pronouns (user cut off mid-word)
  /\b(je|tu|il|elle|on|nous|vous|ils|elles)\s*$/i,
  // Trailing articles/determiners (about to say a noun)
  /\b(le|la|les|l'|un|une|des|du|de la|ce|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s*$/i,
  // Relative pronouns
  /\b(qui|que|dont|où|lequel|laquelle|lesquels|lesquelles)\s*$/i
];
var INCOMPLETE_PATTERNS_EN2 = [
  // "X I/you/he" patterns
  /\b(so i|and i|but i|then i|when i|if i|as i|because i)\s*$/i,
  /\b(so you|and you|but you|then you|when you|if you)\s*$/i,
  /\b(so it|and it|but it|then it|when it|if it)\s*$/i,
  /\b(so that|and that|but that|then that|what)\s*$/i,
  // Verb starters
  /\b(i will|i want to|i need to|i'm going to|i have to)\s*$/i,
  /\b(i would like|i think that|i believe that|i was)\s*$/i,
  // Conjunctions at end
  /\b(and|but|or|so|because|then|also|that|which|who)\s*$/i,
  // Subordinate clause starters
  /\b(in order to|before i|after i|while i)\s*$/i,
  // Infinitive patterns (to + verb, not to)
  /\b(to not|not to|to be|to have|to do|to get|to make|to take)\s*$/i,
  /\b(to|for|with|without|about|from|into)\s+(the|a|an|my|your|his|her|its|our|their|this|that|some)?\s*$/i,
  // Mid-sentence prepositions
  /\b(about the|regarding|in terms of|with respect to|according to)\s*$/i,
  /\b(it's|it is|there is|there are|this is|that is|here's|here is)\s*$/i,
  /\b(i'm|i am|we're|we are|you're|you are|they're|they are|he's|she's)\s*$/i,
  // Trailing pronouns
  /\b(i|you|he|she|it|we|they)\s*$/i,
  // Trailing articles/determiners
  /\b(the|a|an|this|that|these|those|my|your|his|her|its|our|their|some|any)\s*$/i,
  // Relative pronouns
  /\b(who|whom|whose|which|that|where|when)\s*$/i
];
function isLikelyIncomplete2(transcript, locale = "fr") {
  const patterns = locale === "fr" ? INCOMPLETE_PATTERNS_FR2 : INCOMPLETE_PATTERNS_EN2;
  const trimmed = transcript.trim();
  if (trimmed.length < 3) {
    return true;
  }
  if (patterns.some((p) => p.test(trimmed))) {
    return true;
  }
  if (/\.{2,}$/.test(trimmed) || /…$/.test(trimmed)) {
    return true;
  }
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const hasTerminalPunctuation3 = /[.!?。？！]$/.test(trimmed);
  const lastWord = words[words.length - 1]?.replace(/[.,!?;:]$/, "") || "";
  if (lastWord.length >= 3 && !hasTerminalPunctuation3) {
    const partialWordFR = /[bcdfghjklmnpqrstvwxz]{2,}$|[aeiou][bcdfghjklmnpqrstvwxz]$/i;
    const partialWordEN = /[bcdfghjklmnpqrstvwxz]{2,}$|[aeiou][bcdfghjklmnpqrstvwxz]$/i;
    const validEndingsFR = /^(ant|ent|eur|eux|ait|ais|ont|ons|ez|er|ir|re|le|ne|me|te|se|de|que|ce|est|et|en|an|on|un|ou|au|eu|il|al|el|ol|ul|ar|or|ur|is|us|as|os|es)$/i;
    const validEndingsEN = /^(ing|tion|ness|ment|able|ible|ful|less|ous|ive|ant|ent|er|or|ed|ly|ty|ry|al|el|ol|ul|ar|is|us|as|os|es|en|on|an|in|at|it|ut|et)$/i;
    const lastThree = lastWord.slice(-3);
    const lastTwo = lastWord.slice(-2);
    const isPartial = locale === "fr" ? partialWordFR : partialWordEN;
    const validEndings = locale === "fr" ? validEndingsFR : validEndingsEN;
    if (isPartial.test(lastWord) && !validEndings.test(lastThree) && !validEndings.test(lastTwo)) {
      return true;
    }
  }
  if (wordCount === 1 && !hasTerminalPunctuation3) {
    const completeCommands = locale === "fr" ? /^(stop|arrête|annule|cancel|non|no|oui|yes|ok|merci|bonjour|salut)$/i : /^(stop|cancel|no|yes|ok|thanks|hello|hi|bye)$/i;
    if (!completeCommands.test(trimmed)) {
      return true;
    }
  }
  if (wordCount < 4 && !hasTerminalPunctuation3) {
    const functionWords = locale === "fr" ? /^(je|tu|il|elle|on|nous|vous|ils|elles|le|la|les|un|une|des|de|du|à|pour|avec|dans|sur|que|qui|ce|cette|mon|ma|ton|ta|son|sa)$/i : /^(i|you|he|she|it|we|they|the|a|an|to|for|with|in|on|that|which|who|this|my|your|his|her)$/i;
    if (functionWords.test(lastWord)) {
      return true;
    }
  }
  if (lastWord.length <= 2 && !hasTerminalPunctuation3) {
    const validShortWords = locale === "fr" ? /^(ok|ça|là|ou|si|ni|ne|eu|pu|su|vu|lu|bu|du|va|ça)$/i : /^(ok|no|so|go|do|to|up|on|in|at|be|we|me|he|if|it|as|an|am)$/i;
    if (!validShortWords.test(lastWord)) {
      return true;
    }
  }
  if (/,\s*$/.test(trimmed)) {
    return true;
  }
  return false;
}
var COMPLETE_PATTERNS_FR2 = [
  // Polite endings
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,
  // Gratitude (turn-ending)
  /\b(merci|merci beaucoup|merci bien|je t'en prie|de rien)\.?$/i,
  // Conclusions
  /\b(voilà|c'est tout|c'est ça|c'est bon|ça y est|terminé)\.?$/i,
  // Short definitive answers
  /\b(oui|non|peut-être|je ne sais pas|aucune idée|pas du tout)\.?$/i,
  // Agreement/acknowledgment (turn-ending)
  /\b(d'accord|ok|okay|bien sûr|évidemment|entendu|compris|très bien)\.?$/i,
  // Positive closure
  /\b(parfait|super|génial|excellent|nickel|top|impeccable)\.?$/i,
  // Goodbye / farewell
  /\b(au revoir|à bientôt|à plus|à plus tard|salut|ciao|bonne journée|bonne soirée)\.?$/i,
  // Explicit end signals
  /\b(j'ai fini|j'ai terminé|c'est terminé|c'est fait|fini|done)\.?$/i,
  // Commands that are complete
  /\b(stop|arrête|annule|continue|vas-y|go)\.?$/i
];
var COMPLETE_PATTERNS_EN2 = [
  // Polite endings
  /\b(please|if you would|if you could|if you don't mind)\.?$/i,
  // Gratitude
  /\b(thanks|thank you|thank you very much|thanks a lot|appreciate it)\.?$/i,
  // Conclusions
  /\b(that's it|that's all|i'm done|all set|all good|we're good)\.?$/i,
  // Short definitive answers
  /\b(yes|no|maybe|i don't know|not sure|no idea|absolutely|definitely)\.?$/i,
  // Agreement/acknowledgment
  /\b(okay|ok|alright|sure|of course|understood|got it|sounds good)\.?$/i,
  // Positive closure
  /\b(perfect|great|awesome|excellent|wonderful|fantastic|nice)\.?$/i,
  // Goodbye / farewell
  /\b(bye|goodbye|see you|see you later|later|take care|have a good one)\.?$/i,
  // Explicit end signals
  /\b(i'm done|i'm finished|that's everything|finished|done|complete)\.?$/i,
  // Commands that are complete
  /\b(stop|cancel|continue|go ahead|proceed|let's go)\.?$/i
];
function isLikelyComplete(transcript, locale = "fr") {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR2 : COMPLETE_PATTERNS_EN2;
  const trimmed = transcript.trim();
  if (patterns.some((p) => p.test(trimmed))) {
    return true;
  }
  if (/[.!?。？！]$/.test(trimmed)) {
    return true;
  }
  return false;
}
function analyzeLinguisticSignals(transcript, locale = "fr") {
  const trimmed = transcript.trim();
  const patterns = locale === "fr" ? INCOMPLETE_PATTERNS_FR2 : INCOMPLETE_PATTERNS_EN2;
  return {
    endsWithTerminal: /[.!?。？！]$/.test(trimmed),
    isQuestion: /\?$/.test(trimmed) || /^(est-ce|qu'est|pourquoi|comment|où|quand|qui|what|where|when|why|how|who|is|are|do|does|can|could)/i.test(trimmed),
    hasIncompleteClause: patterns.some((p) => p.test(trimmed)),
    trailingConjunction: /\b(et|mais|ou|and|but|or)\s*$/i.test(trimmed),
    wordCount: trimmed.split(/\s+/).filter((w) => w.length > 0).length
  };
}

// src/core/turn-manager.ts
var DEFAULT_CONFIG3 = {
  // Phase 6: Increased timings to give user more breathing room
  silenceThresholdMs: 1200,
  // Was 700ms - wait longer before considering commit
  stabilityThresholdMs: 800,
  // Was 500ms - transcript must be stable longer
  maxSilenceMs: 2500,
  // Was 1500ms - force commit after longer silence
  gracePeriodMs: 2e3,
  // Was 1200ms - longer grace after speechFinal
  rmsThreshold: 0.01,
  speechHysteresisMs: 150,
  speechHangoverMs: 500,
  // Was 300ms - stay "speaking" longer after audio drops
  vadProbabilityThreshold: 0.4,
  // Was 0.5 - be more sensitive to ongoing speech
  locale: "fr",
  // ML Turn Detection (Phase 7)
  turnDetector: void 0,
  mlWeight: 0.6,
  // Balance between ML and heuristics
  debug: false
};
function createTurnManager(config2) {
  const cfg = { ...DEFAULT_CONFIG3, ...config2 };
  let transcript = "";
  let lastTranscript = "";
  let accumulatedFinalTranscript = "";
  let confidence = 0;
  let currentState = "listening";
  let lastTokenTime = Date.now();
  let lastTranscriptChangeTime = Date.now();
  let silenceStartTime = 0;
  let isSilent = false;
  let rmsAboveThreshold = false;
  let speechStartTime = 0;
  let lastSpeechTime = Date.now();
  let wasSpeaking = false;
  let vadSpeechActive = false;
  let lastVADTime = 0;
  let vadProbability = 0;
  let commitTimer = null;
  let gracePeriodTimer = null;
  let hasCommitted = false;
  let lastPrediction = null;
  let pendingPrediction = null;
  let lastRmsLogTime = 0;
  const RMS_LOG_THROTTLE_MS = 500;
  const log = (...args) => {
    if (cfg.debug) console.log("[TurnManager]", ...args);
  };
  const endsWithPunctuation = (text) => {
    return /[.!?。？！]$/.test(text.trim());
  };
  const buildTurnContext = () => {
    const now = Date.now();
    return {
      transcript,
      utteranceDurationMs: now - speechStartTime,
      sttConfidence: confidence,
      isFinal: true,
      // Only called on final transcripts
      speechFinal: false,
      // Updated separately
      vadProbability,
      silenceDurationMs: isSilent ? now - silenceStartTime : 0,
      transcriptStableMs: now - lastTranscriptChangeTime,
      locale: cfg.locale || "fr"
    };
  };
  const getMlPrediction = async () => {
    if (!cfg.turnDetector) return null;
    try {
      const context = buildTurnContext();
      const prediction = await cfg.turnDetector.predict(context);
      lastPrediction = prediction;
      return prediction;
    } catch (error) {
      log("ML prediction error:", error);
      return null;
    }
  };
  const combineSignals = (heuristicCommit, heuristicConfidence, mlPrediction) => {
    if (!mlPrediction) {
      return heuristicCommit;
    }
    const mlWeight = cfg.mlWeight ?? 0.6;
    const heuristicWeight = 1 - mlWeight;
    const mlScore = mlPrediction.shouldCommit ? mlPrediction.confidence * mlWeight : (1 - mlPrediction.confidence) * mlWeight;
    const heuristicScore = heuristicCommit ? heuristicConfidence * heuristicWeight : (1 - heuristicConfidence) * heuristicWeight;
    const totalCommitScore = (mlPrediction.shouldCommit ? mlScore : 0) + (heuristicCommit ? heuristicScore : 0);
    log("Signal combination:", {
      mlPrediction: mlPrediction.shouldCommit,
      mlConfidence: mlPrediction.confidence,
      mlReason: mlPrediction.reason,
      heuristicCommit,
      heuristicConfidence,
      totalCommitScore,
      threshold: 0.5
    });
    if (mlPrediction.reason === "backchannel" && mlPrediction.confidence > 0.8) {
      log("Backchannel detected by ML - blocking commit");
      return false;
    }
    return totalCommitScore > 0.5;
  };
  const evaluateCommit = () => {
    if (hasCommitted) return false;
    if (!transcript.trim()) return false;
    if (currentState === "streaming") return false;
    const now = Date.now();
    const timeSinceLastToken = now - lastTokenTime;
    const transcriptStable = now - lastTranscriptChangeTime;
    const silenceDuration = isSilent ? now - silenceStartTime : 0;
    const hasPunctuation = endsWithPunctuation(transcript);
    const semanticComplete = isLikelyComplete(transcript, cfg.locale || "fr");
    const vadActive = vadProbability > cfg.vadProbabilityThreshold;
    log("Evaluating commit:", {
      timeSinceLastToken,
      transcriptStable,
      silenceDuration,
      hasPunctuation,
      semanticComplete,
      confidence,
      vadProbability,
      vadActive,
      state: currentState,
      hasMLDetector: !!cfg.turnDetector
    });
    let heuristicCommit = false;
    let heuristicConfidence = 0.5;
    if (semanticComplete && !vadActive && transcriptStable > cfg.stabilityThresholdMs && timeSinceLastToken > cfg.silenceThresholdMs) {
      log("Semantic completion detected (conservative)");
      heuristicCommit = true;
      heuristicConfidence = 0.9;
    } else if (vadActive) {
      heuristicCommit = timeSinceLastToken > cfg.maxSilenceMs && transcriptStable > cfg.stabilityThresholdMs * 2 && hasPunctuation;
      heuristicConfidence = heuristicCommit ? 0.8 : 0.3;
    } else if (currentState === "triggered") {
      heuristicCommit = timeSinceLastToken > cfg.silenceThresholdMs * 1.5 && transcriptStable > cfg.stabilityThresholdMs && (hasPunctuation || silenceDuration > cfg.maxSilenceMs);
      heuristicConfidence = heuristicCommit ? 0.75 : 0.4;
    } else {
      const lowVADBonus = vadProbability < 0.2 ? 0.7 : 1;
      heuristicCommit = timeSinceLastToken > cfg.silenceThresholdMs * lowVADBonus && transcriptStable > cfg.stabilityThresholdMs * lowVADBonus && (hasPunctuation || silenceDuration > cfg.maxSilenceMs * lowVADBonus);
      heuristicConfidence = heuristicCommit ? 0.75 : 0.4;
    }
    if (cfg.turnDetector && lastPrediction) {
      return combineSignals(heuristicCommit, heuristicConfidence, lastPrediction);
    }
    return heuristicCommit;
  };
  const scheduleCommitCheck = (delayMs) => {
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      if (evaluateCommit()) {
        doCommit();
      }
    }, delayMs);
  };
  const doCommit = () => {
    if (hasCommitted) return;
    hasCommitted = true;
    log("Committing turn:", { length: transcript.length, confidence });
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (gracePeriodTimer) {
      clearTimeout(gracePeriodTimer);
      gracePeriodTimer = null;
    }
    cfg.onTurnComplete(transcript, confidence);
  };
  const cancelPendingCommit = () => {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
      log("Cancelled pending commit");
    }
    if (gracePeriodTimer) {
      clearTimeout(gracePeriodTimer);
      gracePeriodTimer = null;
    }
  };
  const updateSpeechActivity = () => {
    const now = Date.now();
    let speaking = false;
    if (rmsAboveThreshold) {
      const duration = now - speechStartTime;
      speaking = duration >= cfg.speechHysteresisMs;
    } else {
      const timeSinceSpeech = now - lastSpeechTime;
      speaking = timeSinceSpeech < cfg.speechHangoverMs;
    }
    if (vadSpeechActive) {
      const timeSinceVAD = now - lastVADTime;
      if (timeSinceVAD < 500) {
        speaking = true;
      }
    }
    if (speaking !== wasSpeaking) {
      wasSpeaking = speaking;
      cfg.onSpeechActivity(speaking);
    }
  };
  return {
    handleTranscript(text, isFinal, speechFinal, conf) {
      const now = Date.now();
      lastTokenTime = now;
      if (text !== lastTranscript) {
        lastTranscriptChangeTime = now;
        lastTranscript = text;
      }
      if (isFinal) {
        const trimmedNew = text.trim();
        const trimmedAccumulated = accumulatedFinalTranscript.trim();
        if (trimmedAccumulated && !trimmedNew.startsWith(trimmedAccumulated.substring(0, 10))) {
          accumulatedFinalTranscript = `${trimmedAccumulated} ${trimmedNew}`;
          log("Accumulated transcript (new utterance), length:", accumulatedFinalTranscript.length);
        } else {
          accumulatedFinalTranscript = trimmedNew;
        }
        transcript = accumulatedFinalTranscript;
        confidence = conf;
      }
      log("Transcript:", {
        length: text.length,
        isFinal,
        speechFinal,
        conf
      });
      if (!isFinal) {
        cancelPendingCommit();
        hasCommitted = false;
      }
      if (speechFinal && isFinal) {
        log("speechFinal detected, scheduling grace period");
        if (gracePeriodTimer) clearTimeout(gracePeriodTimer);
        gracePeriodTimer = setTimeout(() => {
          gracePeriodTimer = null;
          if (evaluateCommit()) {
            doCommit();
          }
        }, cfg.gracePeriodMs);
      }
      if (isFinal) {
        if (cfg.turnDetector && !pendingPrediction) {
          pendingPrediction = getMlPrediction().finally(() => {
            pendingPrediction = null;
          });
        }
        scheduleCommitCheck(cfg.silenceThresholdMs);
      }
    },
    handleRMS(level) {
      const now = Date.now();
      const wasAbove = rmsAboveThreshold;
      rmsAboveThreshold = level > cfg.rmsThreshold;
      if (cfg.debug && (currentState === "speaking" || currentState === "streaming")) {
        if (now - lastRmsLogTime >= RMS_LOG_THROTTLE_MS) {
          log(`[RMS] state=${currentState} rms=${level.toFixed(3)} vadActive=${vadSpeechActive}`);
          lastRmsLogTime = now;
        }
      }
      if (rmsAboveThreshold && !vadSpeechActive) {
        if (currentState === "cooldown" || currentState === "streaming") {
          log("RMS-based barge-in detected (VAD fallback), rms:", level.toFixed(3), "state:", currentState);
          cfg.onBargeIn();
          return;
        }
      }
      if (rmsAboveThreshold && !wasAbove) {
        speechStartTime = now;
        isSilent = false;
        if (currentState === "listening") {
          cancelPendingCommit();
          hasCommitted = false;
        }
      } else if (!rmsAboveThreshold && wasAbove) {
        lastSpeechTime = now;
        silenceStartTime = now;
        isSilent = true;
      }
      updateSpeechActivity();
    },
    handleVADEvent(event) {
      const now = Date.now();
      lastVADTime = now;
      log(`[VAD] event=${event} state=${currentState} vadActive=${vadSpeechActive}`);
      if (event === "started") {
        vadSpeechActive = true;
        if (currentState === "speaking" || currentState === "cooldown" || currentState === "streaming") {
          log("VAD barge-in detected in state:", currentState);
          cfg.onBargeIn();
        }
        if (currentState === "listening") {
          cancelPendingCommit();
          hasCommitted = false;
        }
      } else {
        vadSpeechActive = false;
      }
      updateSpeechActivity();
    },
    handleVADProbability(probability) {
      vadProbability = Math.max(0, Math.min(1, probability));
      if (probability > cfg.vadProbabilityThreshold && currentState === "listening") {
        cancelPendingCommit();
        hasCommitted = false;
      }
      if (cfg.debug && Math.abs(probability - vadProbability) > 0.3) {
        log("VAD probability:", probability.toFixed(2));
      }
    },
    setState(state) {
      const prevState = currentState;
      if (prevState === state) return;
      currentState = state;
      log("State:", prevState, "\u2192", state);
      if (state === "listening") {
        hasCommitted = false;
      }
      if (state === "speaking" || state === "cooldown" || state === "vad_cooldown") {
        cancelPendingCommit();
      }
    },
    getTranscript() {
      return transcript;
    },
    getVADProbability() {
      return vadProbability;
    },
    isSpeaking() {
      const now = Date.now();
      if (rmsAboveThreshold) {
        const duration = now - speechStartTime;
        return duration >= cfg.speechHysteresisMs;
      }
      const timeSinceSpeech = now - lastSpeechTime;
      return timeSinceSpeech < cfg.speechHangoverMs;
    },
    addCompletedTurn(turn) {
      if (cfg.turnDetector) {
        cfg.turnDetector.addTurn(turn);
        log("Added turn to detector history:", turn.role, "length:", turn.text.length);
      }
    },
    getLastPrediction() {
      return lastPrediction;
    },
    reset() {
      transcript = "";
      lastTranscript = "";
      accumulatedFinalTranscript = "";
      confidence = 0;
      hasCommitted = false;
      lastTokenTime = Date.now();
      lastTranscriptChangeTime = Date.now();
      silenceStartTime = 0;
      isSilent = false;
      rmsAboveThreshold = false;
      speechStartTime = 0;
      lastSpeechTime = Date.now();
      wasSpeaking = false;
      vadSpeechActive = false;
      lastVADTime = 0;
      vadProbability = 0;
      lastPrediction = null;
      pendingPrediction = null;
      cancelPendingCommit();
      log("Reset");
    },
    setTurnDetector(detector) {
      cfg.turnDetector = detector ?? void 0;
      log("TurnDetector set:", detector ? detector.name : "none");
    },
    destroy() {
      cancelPendingCommit();
      if (cfg.turnDetector) {
        cfg.turnDetector.reset();
      }
      log("Destroyed");
    }
  };
}

// src/core/tts-streaming.ts
var config = {
  ttsStreamUrl: "/api/voice/v1/tts/stream"
};
function configureTTSStreaming(newConfig) {
  config = { ...config, ...newConfig };
}
function getTTSStreamingConfig() {
  return { ...config };
}
var SAMPLE_RATE = 24e3;
var CHANNELS = 1;
var audioContext = null;
var isStreamPlaying = false;
var shouldStopStream = false;
var currentStreamId = 0;
var nextPlayTime = 0;
var activeSourceNodes = [];
var pendingBytes = null;
function getAudioContext() {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}
function pcm16ToFloat32(pcmData) {
  const numSamples = Math.floor(pcmData.length / 2);
  const float32 = new Float32Array(numSamples);
  const dataView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  for (let i = 0; i < numSamples; i++) {
    const int16 = dataView.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}
function createAudioBuffer(ctx, samples) {
  const buffer = ctx.createBuffer(CHANNELS, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
function scheduleAudioBuffer(ctx, buffer) {
  if (shouldStopStream) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const currentTime = ctx.currentTime;
  if (nextPlayTime < currentTime) {
    nextPlayTime = currentTime;
  }
  const startTime = nextPlayTime;
  source.start(startTime);
  nextPlayTime += buffer.duration;
  activeSourceNodes.push(source);
  source.onended = () => {
    const index = activeSourceNodes.indexOf(source);
    if (index > -1) {
      activeSourceNodes.splice(index, 1);
    }
    source.disconnect();
  };
}
var totalBytesProcessed = 0;
function processAndPlayChunk(ctx, chunk, streamId) {
  if (shouldStopStream) return;
  if (streamId !== void 0 && streamId !== currentStreamId) return;
  let pcmData;
  if (pendingBytes && pendingBytes.length > 0) {
    pcmData = new Uint8Array(pendingBytes.length + chunk.length);
    pcmData.set(pendingBytes, 0);
    pcmData.set(chunk, pendingBytes.length);
    pendingBytes = null;
  } else {
    pcmData = chunk;
  }
  const remainder = pcmData.length % 2;
  if (remainder > 0) {
    pendingBytes = pcmData.slice(-remainder);
    pcmData = pcmData.slice(0, -remainder);
  }
  if (pcmData.length < 2) return;
  totalBytesProcessed += pcmData.length;
  const float32 = pcm16ToFloat32(pcmData);
  const buffer = createAudioBuffer(ctx, float32);
  scheduleAudioBuffer(ctx, buffer);
}
function stopStreamingTTS() {
  shouldStopStream = true;
  isStreamPlaying = false;
  pendingBytes = null;
  totalBytesProcessed = 0;
  currentStreamId++;
  for (const source of activeSourceNodes) {
    try {
      source.stop();
      source.disconnect();
    } catch {
    }
  }
  activeSourceNodes = [];
  nextPlayTime = 0;
}
function isStreamingTTSPlaying() {
  return isStreamPlaying;
}
async function waitForPlaybackComplete() {
  return new Promise((resolve) => {
    const checkComplete = () => {
      if (shouldStopStream || activeSourceNodes.length === 0) {
        resolve();
      } else {
        setTimeout(checkComplete, 50);
      }
    };
    checkComplete();
  });
}
async function speakTextStreaming(text, locale = "fr", onStart, onEnd, onError, ttsModel, voice, ttsStreamUrl, apiKey) {
  stopStreamingTTS();
  shouldStopStream = false;
  isStreamPlaying = true;
  pendingBytes = null;
  const streamId = ++currentStreamId;
  const ctx = getAudioContext();
  const url = ttsStreamUrl || config.ttsStreamUrl;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, locale, ttsModel, voice })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "TTS streaming failed");
    }
    if (!response.body) {
      throw new Error("No response body");
    }
    const reader = response.body.getReader();
    let hasStarted = false;
    while (true) {
      if (shouldStopStream || streamId !== currentStreamId) {
        reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.length > 0) {
        if (!hasStarted) {
          hasStarted = true;
          console.log("[TTS] Streaming started");
          onStart?.();
        }
        processAndPlayChunk(ctx, value, streamId);
      }
    }
    if (!shouldStopStream) {
      await waitForPlaybackComplete();
      onEnd?.();
    }
  } catch (error) {
    isStreamPlaying = false;
    onError?.(error instanceof Error ? error : new Error("Streaming TTS failed"));
  } finally {
    isStreamPlaying = false;
    pendingBytes = null;
  }
}
function speakTextStreamingWithCallback(text, locale = "fr", onEnd, onError, ttsModel, voice, ttsStreamUrl, apiKey) {
  speakTextStreaming(text, locale, void 0, onEnd, onError, ttsModel, voice, ttsStreamUrl, apiKey).catch((err) => {
    onError?.(err instanceof Error ? err : new Error("Streaming TTS failed"));
  });
}
async function prefetchAudio(text, locale = "fr", ttsModel, voice, ttsStreamUrl, apiKey) {
  const abortController = new AbortController();
  const preloaded = {
    chunks: [],
    totalBytes: 0,
    abortController,
    isComplete: false
  };
  const url = ttsStreamUrl || config.ttsStreamUrl;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, locale, ttsModel, voice }),
      signal: abortController.signal
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "TTS prefetch failed");
    }
    if (!response.body) {
      throw new Error("No response body");
    }
    const reader = response.body.getReader();
    while (true) {
      if (abortController.signal.aborted) {
        reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        preloaded.isComplete = true;
        break;
      }
      if (value && value.length > 0) {
        preloaded.chunks.push(value);
        preloaded.totalBytes += value.length;
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      preloaded.isComplete = false;
    } else {
      preloaded.error = error instanceof Error ? error : new Error("Prefetch failed");
      preloaded.isComplete = true;
    }
  }
  return preloaded;
}
function cancelPrefetch(preloaded) {
  if (!preloaded.isComplete) {
    preloaded.abortController.abort();
  }
}
async function playPreloadedAudio(preloaded, onStart, onEnd, onError) {
  if (preloaded.error) {
    onError?.(preloaded.error);
    return;
  }
  if (preloaded.chunks.length === 0) {
    onEnd?.();
    return;
  }
  stopStreamingTTS();
  shouldStopStream = false;
  isStreamPlaying = true;
  pendingBytes = null;
  const streamId = ++currentStreamId;
  const ctx = getAudioContext();
  try {
    onStart?.();
    for (const chunk of preloaded.chunks) {
      if (shouldStopStream || streamId !== currentStreamId) break;
      processAndPlayChunk(ctx, chunk, streamId);
    }
    if (!shouldStopStream) {
      await waitForPlaybackComplete();
      onEnd?.();
    }
  } catch (error) {
    isStreamPlaying = false;
    onError?.(error instanceof Error ? error : new Error("Preloaded playback failed"));
  } finally {
    isStreamPlaying = false;
    pendingBytes = null;
  }
}
function isPreloadedReady(preloaded) {
  if (!preloaded) return false;
  return preloaded.isComplete || preloaded.chunks.length > 0;
}
function testAudioContextBeep() {
  const ctx = getAudioContext();
  const duration = 0.5;
  const frequency = 440;
  const sampleRate = ctx.sampleRate;
  const samples = new Float32Array(Math.floor(duration * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.3 * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  source.onended = () => {
  };
}
if (typeof window !== "undefined") {
  window.__testTTSBeep = testAudioContextBeep;
}

// src/core/sanitize-for-tts.ts
function sanitizeForTTS(text) {
  if (!text) return "";
  let sanitized = text;
  sanitized = sanitized.replace(/\bKOND\b/gi, "Conde");
  sanitized = sanitized.replace(/```[\w-]*[\s\S]*?```/g, "");
  sanitized = sanitized.replace(/`[^`]{30,}`/g, "");
  sanitized = sanitized.replace(/https?:\/\/[^\s)>\]]+/g, "");
  sanitized = sanitized.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  sanitized = sanitized.replace(/\{\{btn:([^|]+)\|[^}]+\}\}/g, "$1");
  sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, "$1");
  sanitized = sanitized.replace(/__([^_]+)__/g, "$1");
  sanitized = sanitized.replace(/\*([^*]+)\*/g, "$1");
  sanitized = sanitized.replace(/_([^_]+)_/g, "$1");
  sanitized = sanitized.replace(/^#{1,6}\s+/gm, "");
  sanitized = sanitized.replace(/^[\s]*[-*]\s+/gm, "");
  sanitized = sanitized.replace(/^[\s]*\d+\.\s+/gm, "");
  sanitized = sanitized.replace(/^>\s*/gm, "");
  sanitized = sanitized.replace(/^[-*_]{3,}$/gm, "");
  sanitized = sanitized.replace(/\|/g, " ");
  sanitized = sanitized.replace(/^[\s]*[-:]+[\s]*$/gm, "");
  sanitized = sanitized.replace(/`([^`]+)`/g, "$1");
  sanitized = sanitized.replace(/\n{2,}/g, " ");
  sanitized = sanitized.replace(/\s{2,}/g, " ");
  return sanitized.trim();
}
function hasVisualBlocks(text) {
  if (!text) return false;
  return /```[\w-]*[\s\S]*?```/.test(text);
}

// src/core/sentence-chunker.ts
var CHUNK_CONFIG = {
  /** Minimum chars before emitting a chunk (avoid micro-chunks like "Ok.") */
  MIN_LENGTH: 25,
  /** Maximum chars before forcing a split (avoid endless sentences) */
  MAX_LENGTH: 200,
  /** Ideal chunk length for natural speech rhythm */
  IDEAL_LENGTH: 80
};
var ABBREVIATIONS = /* @__PURE__ */ new Set([
  // Titles
  "m",
  "mme",
  "mlle",
  "mr",
  "mrs",
  "ms",
  "dr",
  "pr",
  "prof",
  "sr",
  "jr",
  // Common French
  "etc",
  "ex",
  "cf",
  "vs",
  "env",
  "vol",
  "\xE9d",
  "dir",
  "trad",
  "coll",
  "min",
  "max",
  "approx",
  "r\xE9f",
  "fig",
  "ch",
  "sect",
  "art",
  "al",
  // Time & dates
  "av",
  "apr",
  "janv",
  "f\xE9vr",
  "avr",
  "juil",
  "sept",
  "oct",
  "nov",
  "d\xE9c",
  // Measurements
  "cm",
  "mm",
  "km",
  "kg",
  "mg",
  "ml",
  "dl",
  "cl",
  // Numbers
  "no",
  "n\xB0",
  "p",
  "pp",
  "t",
  "vol",
  // Organizations
  "inc",
  "ltd",
  "co",
  "corp",
  "sarl",
  "sa",
  "sas",
  // Common English
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "ave",
  "blvd",
  "dept",
  "est",
  "govt",
  "misc",
  "no",
  "rev",
  "tel",
  "vs"
]);
function isAbbreviation(word) {
  const normalized = word.toLowerCase().replace(/\.$/, "");
  return ABBREVIATIONS.has(normalized);
}
function isPeriodInNumber(text, periodIndex) {
  if (periodIndex === 0 || periodIndex >= text.length - 1) return false;
  const before = text[periodIndex - 1];
  const after = text[periodIndex + 1];
  if (/\d/.test(before) && /\d/.test(after)) return true;
  if (/\d/.test(before) && /\d{3}/.test(text.slice(periodIndex + 1))) return true;
  return false;
}
function isPeriodInUrlOrEmail(text, periodIndex) {
  const context = text.slice(Math.max(0, periodIndex - 30), periodIndex + 30);
  if (/https?:\/\//.test(context)) return true;
  if (/www\./.test(context)) return true;
  if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(context)) return true;
  const afterPeriod = text.slice(periodIndex + 1, periodIndex + 10).toLowerCase();
  const commonTLDs = ["com", "fr", "org", "net", "io", "co", "dev", "app", "ai"];
  if (commonTLDs.some((tld) => afterPeriod.startsWith(tld))) {
    const beforePeriod = text.slice(Math.max(0, periodIndex - 20), periodIndex);
    if (!/\s$/.test(beforePeriod)) return true;
  }
  return false;
}
function isInsideQuotesOrParens(text, index) {
  const before = text.slice(0, index);
  const openParens = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
  const openBrackets = (before.match(/\[/g) || []).length - (before.match(/\]/g) || []).length;
  const doubleQuotes = (before.match(/"/g) || []).length;
  const frenchQuotes = (before.match(/«/g) || []).length - (before.match(/»/g) || []).length;
  return openParens > 0 || openBrackets > 0 || doubleQuotes % 2 === 1 || frenchQuotes > 0;
}
function getWordBeforePeriod(text, periodIndex) {
  const before = text.slice(0, periodIndex);
  const match = before.match(/(\S+)$/);
  return match ? match[1] : "";
}
var SENTENCE_ENDERS = [".", "!", "?", "\u2026"];
function findSentenceBoundary(text, startFrom = 0) {
  for (let i = startFrom; i < text.length; i++) {
    const char = text[i];
    if (SENTENCE_ENDERS.includes(char)) {
      if (char === "." && text.slice(i, i + 3) === "...") {
        const afterEllipsis = text.slice(i + 3).trimStart();
        if (afterEllipsis && /^[A-ZÀ-Ü]/.test(afterEllipsis)) {
          return i + 3;
        }
        continue;
      }
      if (char === "." && isPeriodInNumber(text, i)) continue;
      if (char === "." && isPeriodInUrlOrEmail(text, i)) continue;
      if (isInsideQuotesOrParens(text, i)) continue;
      if (char === ".") {
        const wordBefore = getWordBeforePeriod(text, i);
        if (isAbbreviation(wordBefore)) continue;
      }
      const after = text.slice(i + 1);
      if (!after.trim()) {
        return i + 1;
      }
      const trimmedAfter = after.trimStart();
      const spaceCount = after.length - trimmedAfter.length;
      if (spaceCount === 0) continue;
      if (/^[A-ZÀ-Ü0-9«"]/.test(trimmedAfter)) {
        return i + 1 + spaceCount;
      }
      if ((char === "!" || char === "?") && spaceCount >= 1) {
        return i + 1 + spaceCount;
      }
    }
  }
  return -1;
}
function findSecondaryBreak(text, afterIndex) {
  const searchStart = Math.max(afterIndex, Math.floor(text.length * 0.4));
  for (let i = searchStart; i < text.length; i++) {
    const char = text[i];
    if (char === ":" || char === ";") {
      const after = text.slice(i + 1);
      if (after.trimStart().length > 0) {
        return i + 1;
      }
    }
    if (text.slice(i, i + 2) === " \u2014" || text.slice(i, i + 3) === " \u2013 ") {
      return i;
    }
  }
  const commaSearch = text.slice(Math.floor(text.length * 0.5));
  const commaIndex = commaSearch.indexOf(", ");
  if (commaIndex !== -1) {
    return Math.floor(text.length * 0.5) + commaIndex + 2;
  }
  return -1;
}
function extractSentences(buffer, options) {
  const minLen = options?.minLength ?? CHUNK_CONFIG.MIN_LENGTH;
  const maxLen = options?.maxLength ?? CHUNK_CONFIG.MAX_LENGTH;
  const forceFlush = options?.forceFlush ?? false;
  const sentences = [];
  let remaining = buffer;
  while (remaining.length > 0) {
    const boundaryIndex = findSentenceBoundary(remaining);
    if (boundaryIndex !== -1) {
      const sentence = remaining.slice(0, boundaryIndex).trim();
      if (sentence.length >= minLen) {
        sentences.push(sentence);
        remaining = remaining.slice(boundaryIndex).trimStart();
        continue;
      }
      if (!forceFlush && remaining.slice(boundaryIndex).trim().length < minLen) {
        break;
      }
      if (sentence.length > 0) {
        sentences.push(sentence);
        remaining = remaining.slice(boundaryIndex).trimStart();
        continue;
      }
    }
    if (remaining.length > maxLen) {
      const secondaryBreak = findSecondaryBreak(remaining, minLen);
      if (secondaryBreak !== -1 && secondaryBreak >= minLen) {
        const chunk2 = remaining.slice(0, secondaryBreak).trim();
        sentences.push(chunk2);
        remaining = remaining.slice(secondaryBreak).trimStart();
        continue;
      }
      let cutPoint = maxLen;
      const lastSpace = remaining.slice(0, maxLen).lastIndexOf(" ");
      if (lastSpace > minLen) {
        cutPoint = lastSpace;
      }
      const chunk = remaining.slice(0, cutPoint).trim();
      sentences.push(chunk);
      remaining = remaining.slice(cutPoint).trimStart();
      continue;
    }
    break;
  }
  if (forceFlush && remaining.trim().length > 0) {
    sentences.push(remaining.trim());
    remaining = "";
  }
  return [sentences, remaining];
}
function stripCodeBlocks(text) {
  let cleaned = text.replace(/```[\w-]*[\s\S]*?```/g, "");
  const lastOpenBackticks = cleaned.lastIndexOf("```");
  if (lastOpenBackticks !== -1) {
    const afterOpen = cleaned.slice(lastOpenBackticks + 3);
    if (!afterOpen.includes("```")) {
      cleaned = cleaned.slice(0, lastOpenBackticks);
      return [cleaned, true];
    }
  }
  return [cleaned, false];
}
function createSentenceAccumulator(onSentence, options) {
  let buffer = "";
  let codeBlockBuffer = "";
  return {
    append: (text) => {
      buffer += text;
      const [cleanedBuffer, hasIncomplete] = stripCodeBlocks(buffer);
      if (hasIncomplete) {
        return;
      }
      buffer = cleanedBuffer;
      const [sentences, remaining] = extractSentences(buffer, {
        minLength: options?.minLength,
        maxLength: options?.maxLength
      });
      for (const sentence of sentences) {
        if (!sentence.includes("```")) {
          onSentence(sentence);
        }
      }
      buffer = remaining;
    },
    flush: () => {
      const [cleanedBuffer] = stripCodeBlocks(buffer);
      if (cleanedBuffer.trim().length > 0) {
        const [sentences] = extractSentences(cleanedBuffer, {
          minLength: options?.minLength,
          maxLength: options?.maxLength,
          forceFlush: true
        });
        for (const sentence of sentences) {
          if (!sentence.includes("```")) {
            onSentence(sentence);
          }
        }
      }
      buffer = "";
      codeBlockBuffer = "";
    },
    reset: () => {
      buffer = "";
      codeBlockBuffer = "";
    },
    getBuffer: () => buffer
  };
}

// src/core/tts-queue.ts
function createTTSQueue(options) {
  const { locale, voice, ttsStreamUrl, apiKey, onStart, onEnd, onError, debug = false } = options;
  const queue = [];
  let isPlaying = false;
  let isFinished = false;
  let isCancelled = false;
  let hasStarted = false;
  let nextPreloaded = null;
  let nextItem = null;
  let isPrefetching = false;
  let prefetchStartTime = 0;
  const PREFETCH_TIMEOUT_MS = 5e3;
  let isProcessingNext = false;
  const extendedPrefetchMap = /* @__PURE__ */ new Map();
  const extendedPrefetchPending = /* @__PURE__ */ new Set();
  const log = (...args) => {
    if (debug) console.log("[TTS Queue]", ...args);
  };
  const getNextCleanItem = () => {
    while (queue.length > 0) {
      const item = queue.shift();
      const clean = sanitizeForTTS(item.text);
      if (clean && clean.trim().length > 0) {
        return { text: clean, ttsModel: item.ttsModel };
      }
      log("Skipping empty sentence");
    }
    return null;
  };
  const startPrefetch = () => {
    if (isPrefetching || nextPreloaded || isCancelled) {
      startExtendedPrefetch();
      return;
    }
    const item = getNextCleanItem();
    if (!item) return;
    isPrefetching = true;
    prefetchStartTime = Date.now();
    nextItem = item;
    log("Prefetching N+1:", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");
    prefetchAudio(item.text, locale, item.ttsModel, voice, ttsStreamUrl, apiKey).then((preloaded) => {
      isPrefetching = false;
      if (isCancelled) {
        cancelPrefetch(preloaded);
        return;
      }
      nextPreloaded = preloaded;
      log("Prefetch N+1 ready:", item.text.substring(0, 40) + "...", `(${preloaded.totalBytes} bytes)`);
      startExtendedPrefetch();
    }).catch((err) => {
      isPrefetching = false;
      log("Prefetch error:", err);
    });
  };
  const startExtendedPrefetch = () => {
    if (isCancelled) return;
    const toFetch = [];
    for (let i = 0; i < Math.min(2, queue.length); i++) {
      const item = queue[i];
      const clean = sanitizeForTTS(item.text);
      if (clean && clean.trim().length > 0) {
        const key = `${clean}-${item.ttsModel || "default"}`;
        if (!extendedPrefetchMap.has(key) && !extendedPrefetchPending.has(key)) {
          toFetch.push({ text: clean, ttsModel: item.ttsModel });
        }
      }
    }
    for (const item of toFetch) {
      const key = `${item.text}-${item.ttsModel || "default"}`;
      extendedPrefetchPending.add(key);
      log("Prefetching N+2/3:", item.text.substring(0, 30) + "...");
      prefetchAudio(item.text, locale, item.ttsModel, voice, ttsStreamUrl, apiKey).then((preloaded) => {
        extendedPrefetchPending.delete(key);
        if (isCancelled) {
          cancelPrefetch(preloaded);
          return;
        }
        extendedPrefetchMap.set(key, preloaded);
        log("Extended prefetch ready:", item.text.substring(0, 30) + "...");
      }).catch((err) => {
        extendedPrefetchPending.delete(key);
        log("Extended prefetch error:", err);
      });
    }
  };
  const getExtendedPrefetch = (item) => {
    const key = `${item.text}-${item.ttsModel || "default"}`;
    const preloaded = extendedPrefetchMap.get(key);
    if (preloaded) {
      extendedPrefetchMap.delete(key);
      return preloaded;
    }
    return null;
  };
  const playPreloaded = async (preloaded, item) => {
    isPlaying = true;
    log("Playing (preloaded):", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");
    if (!hasStarted) {
      hasStarted = true;
      onStart?.();
    }
    nextPreloaded = null;
    nextItem = null;
    startPrefetch();
    await playPreloadedAudio(
      preloaded,
      void 0,
      // onStart (already handled)
      () => {
        isPlaying = false;
        if (!isCancelled) {
          processNext();
        }
      },
      (err) => {
        isPlaying = false;
        log("Playback error:", err);
        if (!isCancelled) {
          onError?.(err);
          processNext();
        }
      }
    );
  };
  const playStreaming = async (item) => {
    isPlaying = true;
    log("Playing (streaming):", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");
    if (!hasStarted) {
      hasStarted = true;
      onStart?.();
    }
    startPrefetch();
    try {
      await speakTextStreaming(
        item.text,
        locale,
        void 0,
        // onStart (already handled)
        () => {
          isPlaying = false;
          if (!isCancelled) {
            processNext();
          }
        },
        (err) => {
          isPlaying = false;
          log("Streaming error:", err);
          if (!isCancelled) {
            onError?.(err);
            processNext();
          }
        },
        item.ttsModel,
        voice,
        ttsStreamUrl,
        apiKey
      );
    } catch (err) {
      isPlaying = false;
      log("Exception:", err);
      if (!isCancelled) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        processNext();
      }
    }
  };
  const processNext = async () => {
    if (isCancelled || isPlaying || isProcessingNext) return;
    isProcessingNext = true;
    try {
      if (nextPreloaded && nextItem) {
        isProcessingNext = false;
        await playPreloaded(nextPreloaded, nextItem);
        return;
      }
      if (isPrefetching && nextItem) {
        const elapsed = Date.now() - prefetchStartTime;
        if (elapsed > PREFETCH_TIMEOUT_MS) {
          log("N+1 prefetch timed out after", elapsed, "ms - falling back to streaming");
          isPrefetching = false;
          const timedOutItem = nextItem;
          nextItem = null;
          prefetchStartTime = 0;
          isProcessingNext = false;
          await playStreaming(timedOutItem);
          return;
        }
        log("Waiting for N+1 prefetch to complete...");
        isProcessingNext = false;
        setTimeout(() => {
          if (!isCancelled) processNext();
        }, 50);
        return;
      }
      const item = getNextCleanItem();
      if (item) {
        const extendedPreload = getExtendedPrefetch(item);
        if (extendedPreload) {
          log("Using extended prefetch for:", item.text.substring(0, 30) + "...");
          isProcessingNext = false;
          await playPreloaded(extendedPreload, item);
          return;
        }
        isProcessingNext = false;
        await playStreaming(item);
        return;
      }
      if (isFinished) {
        log("Queue complete");
        onEnd?.();
      }
    } finally {
      isProcessingNext = false;
    }
  };
  return {
    push: (sentence, ttsModel) => {
      if (isCancelled) return;
      if (isFinished) {
        log("Push after finish - reactivating queue");
        isFinished = false;
      }
      log("Queued:", sentence.substring(0, 40) + "...", ttsModel ? `(${ttsModel})` : "");
      queue.push({ text: sentence, ttsModel });
      if (!isPlaying && !isPrefetching) {
        processNext();
      } else if (isPlaying && !nextPreloaded && !isPrefetching) {
        startPrefetch();
      }
    },
    finish: () => {
      if (isCancelled) return;
      log("Stream finished, items remaining:", queue.length);
      isFinished = true;
      if (!isPlaying && queue.length === 0 && !nextPreloaded) {
        if (hasStarted) {
          onEnd?.();
        } else {
          log("Nothing to play");
          onEnd?.();
        }
      }
    },
    cancel: () => {
      log("Cancelled");
      isCancelled = true;
      queue.length = 0;
      if (nextPreloaded) {
        cancelPrefetch(nextPreloaded);
        nextPreloaded = null;
        nextItem = null;
      }
      for (const preloaded of extendedPrefetchMap.values()) {
        cancelPrefetch(preloaded);
      }
      extendedPrefetchMap.clear();
      extendedPrefetchPending.clear();
      stopStreamingTTS();
    },
    isActive: () => !isCancelled && (isPlaying || queue.length > 0 || nextPreloaded !== null || !isFinished)
  };
}

// src/core/tts-model-router.ts
function selectTtsModel(text, context) {
  const { model } = selectTtsModelWithReason(text, context);
  return model;
}
function selectTtsModelWithReason(text, context) {
  if (context?.importance === "high") {
    return { model: "eleven_turbo_v2_5", reason: "high_importance" };
  }
  if (context?.isExplanation) {
    return { model: "eleven_turbo_v2_5", reason: "is_explanation" };
  }
  if (text.length > 300) {
    return { model: "eleven_turbo_v2_5", reason: "long_text" };
  }
  const sentenceCount = (text.match(/[.!?]+/g) || []).length;
  if (sentenceCount >= 3) {
    return { model: "eleven_turbo_v2_5", reason: "multiple_sentences" };
  }
  return { model: "eleven_turbo_v2_5", reason: "default_turbo" };
}
function isShortAcknowledgment(text) {
  const trimmed = text.trim().toLowerCase();
  const shortPatterns = [
    /^(ok|d'accord|oui|non|bien|parfait|super|merci|voilà|compris|entendu|exactement|absolument|c'est fait|c'est bon|je comprends)\.?$/i,
    /^(yes|no|sure|got it|okay|done|right|exactly|understood|perfect|thanks)\.?$/i
  ];
  return shortPatterns.some((p) => p.test(trimmed)) || text.length < 30;
}

// src/core/worklet-source.ts
var AUDIO_PROCESSOR_WORKLET_SOURCE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.isCapturing = true;
    const processorOptions = options.processorOptions || {};
    this.inputSampleRate = processorOptions.inputSampleRate || sampleRate || 48000;
    this.outputSampleRate = processorOptions.outputSampleRate || 16000;
    this.downsampleRatio = this.inputSampleRate / this.outputSampleRate;
    this.CHUNK_SIZE = 640;
    this.buffer = new Float32Array(this.CHUNK_SIZE);
    this.bufferIndex = 0;
    this.sampleAccumulator = 0;
    this.RMS_THRESHOLD = 0.015;
    this.RMS_HISTORY_SIZE = 5; 
    this.rmsHistory = [];
    this.RMS_FLOOR = 0.008;
    this.RMS_CEILING = 0.08;
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isCapturing = false;
        if (this.bufferIndex > 0) {
          const remaining = this.buffer.slice(0, this.bufferIndex);
          const rms = this.calculateRMS(remaining);
          const speechProbability = this.calculateSpeechProbability(rms);
          this.port.postMessage({
            type: "audio",
            data: remaining,
            rms: rms,
            isSpeaking: rms > this.RMS_THRESHOLD,
            speechProbability: speechProbability,
          });
          this.bufferIndex = 0;
        }
      } else if (event.data.type === "start") {
        this.isCapturing = true;
        this.bufferIndex = 0;
        this.sampleAccumulator = 0;
        this.rmsHistory = []; 
      } else if (event.data.type === "setThreshold") {
        this.RMS_THRESHOLD = event.data.threshold;
      }
    };
  }
  calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
  calculateSpeechProbability(currentRms) {
    this.rmsHistory.push(currentRms);
    if (this.rmsHistory.length > this.RMS_HISTORY_SIZE) {
      this.rmsHistory.shift();
    }
    const avgRms =
      this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length;
    if (avgRms <= this.RMS_FLOOR) {
      return 0;
    }
    if (avgRms >= this.RMS_CEILING) {
      return 1;
    }
    return (avgRms - this.RMS_FLOOR) / (this.RMS_CEILING - this.RMS_FLOOR);
  }
  downsample(inputSamples) {
    if (this.downsampleRatio <= 1) {
      return inputSamples;
    }
    const outputLength = Math.floor(inputSamples.length / this.downsampleRatio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.downsampleRatio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      output[i] =
        inputSamples[srcIndexFloor] * (1 - fraction) +
        inputSamples[srcIndexCeil] * fraction;
    }
    return output;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0 && this.isCapturing) {
      const inputChannel = input[0];
      if (inputChannel && inputChannel.length > 0) {
        const downsampled = this.downsample(inputChannel);
        for (let i = 0; i < downsampled.length; i++) {
          this.buffer[this.bufferIndex++] = downsampled[i];
          if (this.bufferIndex >= this.CHUNK_SIZE) {
            const audioData = new Float32Array(this.buffer);
            const rms = this.calculateRMS(audioData);
            const speechProbability = this.calculateSpeechProbability(rms);
            this.port.postMessage({
              type: "audio",
              data: audioData,
              rms: rms,
              isSpeaking: rms > this.RMS_THRESHOLD,
              speechProbability: speechProbability,
            });
            this.bufferIndex = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor("audio-capture-processor", AudioCaptureProcessor);
`;
var WORKLET_VERSION = "0.6.3";

// src/core/worklet-loader.ts
var CDN_BASE_URL = "https://kond.studio/sdk/voicekit";
var createLogger = (debug) => debug ? console.log.bind(console, "[VoiceKit]") : () => {
};
async function loadAudioWorklet(audioContext2, options = {}) {
  const { workletUrl, debug } = options;
  const log = createLogger(debug);
  if (workletUrl) {
    const isSecureUrl = workletUrl.startsWith("https://") || workletUrl.startsWith("blob:") || workletUrl.startsWith("/") || // Relative URLs are OK
    workletUrl.startsWith("http://") && (workletUrl.includes("localhost") || workletUrl.includes("127.0.0.1"));
    if (!isSecureUrl) {
      throw new Error(
        `[VoiceKit] Security: Worklet URL must be HTTPS, blob:, or localhost.
Received: ${workletUrl}
Use HTTPS in production or self-host at a secure URL.`
      );
    }
    log("Loading worklet from custom URL:", workletUrl);
    try {
      await audioContext2.audioWorklet.addModule(workletUrl);
      log("Worklet loaded successfully (custom URL)");
      return;
    } catch (error) {
      throw new Error(
        `[VoiceKit] Failed to load worklet from custom URL: ${workletUrl}
Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  try {
    const blob = new Blob([AUDIO_PROCESSOR_WORKLET_SOURCE], {
      type: "application/javascript"
    });
    const blobUrl = URL.createObjectURL(blob);
    log("Loading worklet from Blob URL...");
    await audioContext2.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);
    log("Worklet loaded successfully (Blob URL)");
    return;
  } catch (blobError) {
    log(
      "Blob URL failed (likely CSP restriction), trying CDN fallback...",
      blobError
    );
  }
  const cdnUrl = `${CDN_BASE_URL}/v${WORKLET_VERSION}/audio-processor.worklet.js`;
  try {
    log("Loading worklet from CDN:", cdnUrl);
    await audioContext2.audioWorklet.addModule(cdnUrl);
    log("Worklet loaded successfully (CDN)");
    return;
  } catch (cdnError) {
    throw new Error(
      `[VoiceKit] Failed to load audio worklet.

Blob URL was blocked (likely by CSP) and CDN fallback also failed.

To fix this, choose one of these options:

1. Add 'blob:' to your Content-Security-Policy script-src directive:
   script-src 'self' blob:;

2. Add the KOND CDN to your CSP:
   script-src 'self' ${CDN_BASE_URL};

3. Self-host the worklet and pass the URL:
   new VoiceKit({ workletUrl: '/path/to/audio-processor.worklet.js' })

CDN Error: ${cdnError instanceof Error ? cdnError.message : String(cdnError)}`
    );
  }
}

// src/voicekit.ts
var VoiceKit = class {
  /**
   * Create a VoiceKit instance
   *
   * @param config - Configuration options
   * @param deps - Optional dependency injection for testing/customization
   */
  constructor(config2, deps) {
    this.state = "idle";
    this.ttsSource = null;
    this.stt = null;
    this.vad = null;
    this.turnDetector = null;
    // Core
    this.turnManager = null;
    this.ttsPlayer = null;
    this.mediaStream = null;
    this.isInitialized = false;
    // Audio capture for routing to STT
    this.audioContext = null;
    this.audioWorklet = null;
    this.audioSource = null;
    // TTS queue for speaking
    this.ttsQueue = null;
    this.sentenceAccumulator = null;
    // Current transcript state
    this.currentTranscript = "";
    this.isProcessing = false;
    const hasApiKey = !!config2.apiKey;
    const hasToken = !!config2.token && !!config2.tokenWsUrl;
    if (!hasApiKey && !hasToken) {
      throw new Error(
        "VoiceKit requires either 'apiKey' or both 'token' and 'tokenWsUrl' for authentication"
      );
    }
    if (config2.baseUrl) {
      validateSecureUrl(config2.baseUrl, config2.debug);
    }
    this.config = {
      ...config2,
      locale: config2.locale || DEFAULT_CONFIG.locale,
      turnDetection: { ...DEFAULT_CONFIG.turnDetection, ...config2.turnDetection },
      tts: { ...DEFAULT_CONFIG.tts, ...config2.tts },
      timing: { ...DEFAULT_CONFIG.timing, ...config2.timing },
      debug: config2.debug ?? DEFAULT_CONFIG.debug
    };
    this.locale = this.config.locale || "fr";
    this.deps = deps ?? {};
    this.httpClient = this.deps.httpClient ?? new FetchHttpClient({
      baseUrl: this.config.baseUrl || DEFAULTS.baseUrl
    });
    if (this.deps.ttsSource) {
      this.ttsSource = this.deps.ttsSource;
    }
    const ttsStreamUrl = buildEndpointUrl(
      this.config.baseUrl || DEFAULTS.baseUrl,
      "ttsStream"
    );
    configureTTSStreaming({ ttsStreamUrl });
  }
  /**
   * Initialize adapters and request microphone permission
   */
  async init() {
    if (this.isInitialized) return;
    try {
      this.setState("connecting");
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.audioContext = new AudioContext();
      await loadAudioWorklet(this.audioContext, {
        workletUrl: this.config.workletUrl,
        debug: this.config.debug
      });
      if (this.config.debug) {
        console.log("[VoiceKit] AudioContext and worklet initialized");
      }
      if (this.config.token && this.config.tokenWsUrl) {
        const token = this.config.token;
        const wsUrl = this.config.tokenWsUrl;
        this.stt = createDeepgramAdapterWithAuth(
          async () => ({ token, wsUrl }),
          { baseUrl: this.config.baseUrl }
        );
      } else {
        this.stt = createDeepgramAdapter({
          apiKey: this.config.apiKey,
          baseUrl: this.config.baseUrl
        });
      }
      this.vad = createSileroVAD({
        threshold: 0.5,
        minSpeechDuration: 250,
        silenceDuration: 700
      });
      await this.vad.init?.();
      const detectorType = this.config.turnDetection?.type || "auto";
      this.turnDetector = await this.createTurnDetector(detectorType);
      await this.turnDetector.init();
      this.turnManager = createTurnManager({
        locale: this.locale === "multi" ? "fr" : this.locale,
        debug: this.config.debug,
        turnDetector: this.turnDetector ?? void 0,
        onTurnComplete: (transcript, confidence) => {
          this.handleTurnComplete(transcript, confidence);
        },
        onBargeIn: () => {
          this.interrupt();
        },
        onSpeechActivity: (speaking) => {
          this.config.onSpeechActivity?.(speaking);
        }
      });
      this.isInitialized = true;
      this.setState("idle");
      if (this.config.debug) {
        console.log("[VoiceKit] Initialized successfully");
      }
    } catch (error) {
      this.setState("idle");
      this.handleError("init_failed", error);
      throw error;
    }
  }
  /**
   * Create the appropriate turn detector based on type
   *
   * Strategy:
   * - "local" / "onnx": Force local ONNX inference (desktop only)
   * - "cloud": Force cloud API inference
   * - "heuristic": Fast regex-based fallback
   * - "auto" (default): Device capability detection:
   *   - Desktop with 4GB+ RAM → local ONNX
   *   - Mobile or low memory → cloud API
   *   - No auth → heuristic fallback
   */
  async createTurnDetector(type) {
    const baseConfig = {
      debug: this.config.debug,
      confidenceThreshold: this.config.turnDetection?.confidenceThreshold || 0.7,
      detectBackchannels: this.config.turnDetection?.detectBackchannels ?? true
    };
    const cloudOptions = {
      ...baseConfig,
      apiKey: this.config.apiKey,
      token: this.config.token,
      // For demo/SSR mode
      baseUrl: this.config.baseUrl,
      // Pass through for dev/staging
      onQuotaExceeded: this.config.onQuotaExceeded
    };
    const hasCloudAuth = !!(this.config.apiKey || this.config.token);
    switch (type) {
      case "local":
      case "onnx":
        if (this.config.debug) {
          console.log("[VoiceKit] Using local ONNX turn detector");
        }
        return createOnnxTurnDetector(baseConfig);
      case "cloud":
        if (this.config.debug) {
          console.log("[VoiceKit] Using cloud turn detector");
        }
        return createCloudTurnDetector(cloudOptions);
      case "heuristic":
        if (this.config.debug) {
          console.log("[VoiceKit] Using heuristic turn detector");
        }
        return createHeuristicTurnDetector(baseConfig);
      case "auto":
      default:
        return this.createAutoTurnDetector(baseConfig, cloudOptions, hasCloudAuth);
    }
  }
  /**
   * Auto-select turn detector based on device capabilities
   *
   * Decision tree:
   * 1. Can run local ONNX? (desktop with 4GB+ RAM, WebAssembly, IndexedDB)
   *    → Use local ONNX for fastest latency
   * 2. Has cloud auth? (apiKey or token)
   *    → Use cloud API
   * 3. No auth?
   *    → Fall back to heuristic
   */
  createAutoTurnDetector(baseConfig, cloudOptions, hasCloudAuth) {
    const capabilities = detectDeviceCapabilities();
    if (this.config.debug) {
      console.log("[VoiceKit] Device capabilities:", {
        canRunLocalOnnx: capabilities.canRunLocalOnnx,
        isMobile: capabilities.isMobile,
        deviceMemoryGB: capabilities.deviceMemoryGB,
        hasWebAssembly: capabilities.hasWebAssembly,
        hasIndexedDB: capabilities.hasIndexedDB
      });
    }
    if (capabilities.canRunLocalOnnx) {
      if (this.config.debug) {
        console.log("[VoiceKit] Auto: Using local ONNX turn detector (capable device)");
      }
      return createOnnxTurnDetector(baseConfig);
    }
    if (hasCloudAuth) {
      const reason = capabilities.isMobile ? "mobile device" : "low memory/no WASM support";
      if (this.config.debug) {
        console.log(`[VoiceKit] Auto: Using cloud turn detector (${reason})`);
      }
      return createCloudTurnDetector(cloudOptions);
    }
    if (this.config.debug) {
      console.log("[VoiceKit] Auto: Using heuristic turn detector (no auth, can't run local)");
    }
    return createHeuristicTurnDetector(baseConfig);
  }
  /**
   * Start listening for voice input
   */
  async start() {
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.state !== "idle") {
      if (this.config.debug) {
        console.log(`[VoiceKit] Cannot start from state: ${this.state}`);
      }
      return;
    }
    try {
      this.setState("connecting");
      if (this.audioContext && this.mediaStream) {
        this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.audioWorklet = new AudioWorkletNode(
          this.audioContext,
          "audio-capture-processor",
          {
            processorOptions: {
              inputSampleRate: this.audioContext.sampleRate,
              outputSampleRate: 16e3
              // Deepgram expects 16kHz
            }
          }
        );
        this.audioSource.connect(this.audioWorklet);
        this.audioWorklet.port.onmessage = (e) => {
          if (e.data.type !== "audio") return;
          const sendingStates = ["listening", "processing"];
          if (sendingStates.includes(this.state) && this.stt) {
            this.stt.sendAudio(e.data.data);
          }
          if (this.turnManager && typeof e.data.speechProbability === "number") {
            this.turnManager.handleVADProbability(e.data.speechProbability);
          }
        };
        if (this.config.debug) {
          console.log("[VoiceKit] Audio worklet connected");
        }
      }
      await this.stt.startStreaming(
        {
          onInterim: (result) => this.handleInterimTranscript(result.text, result.confidence),
          onFinal: (result) => this.handleFinalTranscript(result.text, result.confidence),
          onUtteranceEnd: () => this.handleUtteranceEnd(),
          onError: (error) => this.handleError("stt_error", error),
          onReady: () => {
            if (this.config.debug) {
              console.log("[VoiceKit] STT ready");
            }
          }
        },
        this.locale
      );
      this.vad.start(this.mediaStream, {
        onSpeechStart: () => this.handleSpeechStart(),
        onSpeechEnd: () => this.handleSpeechEnd(),
        onSpeechProbability: (prob) => this.updateVADProbability(prob),
        onError: (error) => this.handleError("vad_error", error)
      });
      this.setState("listening");
    } catch (error) {
      this.setState("idle");
      this.handleError("start_failed", error);
      throw error;
    }
  }
  /**
   * Stop listening
   */
  stop() {
    this.vad?.stop();
    this.stt?.close();
    this.turnManager?.reset();
    this.ttsQueue?.cancel();
    stopStreamingTTS();
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: "stop" });
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    this.currentTranscript = "";
    this.isProcessing = false;
    this.setState("idle");
    if (this.config.debug) {
      console.log("[VoiceKit] Stopped");
    }
  }
  /**
   * Speak text using TTS
   * Handles sentence chunking and progressive playback
   */
  speak(text) {
    if (!text || text.trim().length === 0) return;
    if (!this.ttsQueue) {
      const ttsStreamUrl = buildEndpointUrl(
        this.config.baseUrl || DEFAULTS.baseUrl,
        "ttsStream"
      );
      this.ttsQueue = createTTSQueue({
        locale: this.locale,
        ttsStreamUrl,
        // Pass explicit URL to avoid localhost resolution
        apiKey: this.config.apiKey,
        // Pass API key for authentication
        onStart: () => this.setState("speaking"),
        onEnd: () => {
          this.ttsQueue = null;
          this.sentenceAccumulator = null;
          this.setState("cooldown");
          setTimeout(() => {
            if (this.state === "cooldown") {
              this.setState("listening");
            }
          }, this.config.timing?.cooldownMs || 150);
        },
        onError: (error) => this.handleError("tts_error", error),
        debug: this.config.debug
      });
    }
    if (!this.sentenceAccumulator) {
      this.sentenceAccumulator = createSentenceAccumulator((sentence) => {
        const model = selectTtsModel(sentence);
        this.ttsQueue?.push(sentence, model);
      });
    }
    this.sentenceAccumulator.append(text);
  }
  /**
   * Finish speaking - flush any remaining text
   */
  finishSpeaking() {
    this.sentenceAccumulator?.flush();
    this.ttsQueue?.finish();
  }
  /**
   * Interrupt current TTS playback (barge-in)
   */
  interrupt() {
    this.ttsQueue?.cancel();
    this.ttsQueue = null;
    this.sentenceAccumulator = null;
    stopStreamingTTS();
    this.config.onBargeIn?.();
    if (this.state === "speaking") {
      this.setState("listening");
    }
  }
  // =========================================================================
  // Internal handlers
  // =========================================================================
  handleInterimTranscript(text, confidence) {
    this.currentTranscript = text;
    this.turnManager?.handleTranscript(text, false, false, confidence);
  }
  handleFinalTranscript(text, confidence) {
    this.currentTranscript = text;
    this.turnManager?.handleTranscript(text, true, false, confidence);
  }
  handleTurnComplete(transcript, confidence) {
    if (this.isProcessing) return;
    this.currentTranscript = transcript;
    this.processTranscript();
  }
  handleUtteranceEnd() {
    if (this.isProcessing || !this.currentTranscript.trim()) return;
    this.processTranscript();
  }
  processTranscript() {
    if (!this.currentTranscript.trim()) return;
    this.isProcessing = true;
    this.setState("processing");
    const result = this.config.onTranscript(this.currentTranscript);
    if (result instanceof Promise) {
      result.catch((error) => this.handleError("transcript_handler_error", error)).finally(() => {
        this.isProcessing = false;
        this.currentTranscript = "";
        this.turnManager?.reset();
      });
    } else {
      this.isProcessing = false;
      this.currentTranscript = "";
      this.turnManager?.reset();
    }
  }
  handleSpeechStart() {
    this.config.onSpeechActivity?.(true);
    if (this.state === "speaking") {
      this.interrupt();
    }
  }
  handleSpeechEnd() {
    this.config.onSpeechActivity?.(false);
  }
  updateVADProbability(probability) {
    this.turnManager?.handleVADProbability(probability);
  }
  // =========================================================================
  // State management
  // =========================================================================
  setState(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    if (this.config.debug) {
      console.log(`[VoiceKit] State: ${oldState} \u2192 ${newState}`);
    }
    this.config.onStateChange?.(newState);
  }
  handleError(code, error) {
    const voiceError = {
      code,
      message: error instanceof Error ? error.message : String(error),
      details: error
    };
    if (this.config.debug) {
      console.error(`[VoiceKit] Error (${code}):`, error);
    }
    this.config.onError?.(voiceError);
  }
  // =========================================================================
  // Public getters
  // =========================================================================
  /**
   * Get current conversation state
   */
  getState() {
    return this.state;
  }
  /**
   * Get current locale
   */
  getLocale() {
    return this.locale;
  }
  /**
   * Check if voice is active (listening or processing)
   */
  isActive() {
    return this.state !== "idle";
  }
  /**
   * Check if currently speaking
   */
  isSpeaking() {
    return this.state === "speaking";
  }
  /**
   * Destroy instance and cleanup resources
   */
  destroy() {
    this.stop();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
      });
      this.audioContext = null;
    }
    this.turnDetector?.destroy();
    this.turnManager?.destroy();
    this.isInitialized = false;
    if (this.config.debug) {
      console.log("[VoiceKit] Destroyed");
    }
  }
};
function createVoiceKit(config2, deps) {
  return new VoiceKit(config2, deps);
}

// src/ports/vad.ts
var DEFAULT_VAD_CONFIG = {
  threshold: 0.5,
  minSpeechDuration: 250,
  silenceDuration: 700,
  hysteresisFrames: 3
};

// src/errors/index.ts
var VoiceKitError = class extends Error {
  constructor(message, code, options) {
    super(message);
    this.name = "VoiceKitError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var NetworkError = class extends VoiceKitError {
  constructor(message, cause) {
    super(message, "NETWORK_ERROR", { retryable: true, cause });
    this.name = "NetworkError";
  }
};
var AuthError = class extends VoiceKitError {
  constructor(message, cause) {
    super(message, "AUTH_FAILED", { retryable: false, cause });
    this.name = "AuthError";
  }
};
var ConfigurationError = class extends VoiceKitError {
  constructor(message) {
    super(message, "CONFIGURATION_ERROR", { retryable: false });
    this.name = "ConfigurationError";
  }
};
var TranscriptionError = class extends VoiceKitError {
  constructor(message, options) {
    super(message, "TRANSCRIPTION_FAILED", options);
    this.name = "TranscriptionError";
  }
};
var TTSError = class extends VoiceKitError {
  constructor(message, options) {
    super(message, "TTS_FAILED", options);
    this.name = "TTSError";
  }
};
var VADError = class extends VoiceKitError {
  constructor(message, options) {
    super(message, "VAD_FAILED", options);
    this.name = "VADError";
  }
};
var TurnDetectionError = class extends VoiceKitError {
  constructor(message, options) {
    super(message, "TURN_DETECTION_FAILED", options);
    this.name = "TurnDetectionError";
  }
};
var RateLimitError = class extends VoiceKitError {
  constructor(message, retryAfter) {
    super(message, "RATE_LIMITED", { retryable: true });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
};
var TimeoutError = class extends VoiceKitError {
  constructor(message) {
    super(message, "TIMEOUT", { retryable: true });
    this.name = "TimeoutError";
  }
};
var CancelledError = class extends VoiceKitError {
  constructor(message = "Operation cancelled") {
    super(message, "CANCELLED", { retryable: false });
    this.name = "CancelledError";
  }
};
function isVoiceKitError(error) {
  return error instanceof VoiceKitError;
}
function isRetryableError(error) {
  if (error instanceof VoiceKitError) {
    return error.retryable;
  }
  return false;
}
function wrapError(error, defaultMessage = "Unknown error") {
  if (error instanceof VoiceKitError) {
    return error;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new CancelledError();
    }
    if (error.message.includes("timeout") || error.message.includes("timed out")) {
      return new TimeoutError(error.message);
    }
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return new NetworkError(error.message, error);
    }
    return new VoiceKitError(error.message, "UNKNOWN", { cause: error });
  }
  return new VoiceKitError(
    typeof error === "string" ? error : defaultMessage,
    "UNKNOWN"
  );
}

// src/core/eou-detector.ts
var COMPLETE_PATTERNS_FR3 = [
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,
  // Polite ending
  /\b(merci|merci beaucoup|merci bien)\.?$/i,
  // Thanks
  /\b(voilà|c'est tout|c'est ça|c'est bon)\.?$/i,
  // Conclusion
  /\b(oui|non|peut-être|je ne sais pas)\.?$/i,
  // Short answer
  /\b(d'accord|ok|okay|bien sûr|évidemment)\.?$/i,
  // Agreement
  /\b(parfait|super|génial|excellent)\.?$/i,
  // Positive closure
  /\b(au revoir|à bientôt|à plus|salut|ciao)\.?$/i,
  // Goodbye
  /\b(j'ai fini|j'ai terminé|c'est terminé)\.?$/i
  // Explicit end
];
var COMPLETE_PATTERNS_EN3 = [
  /\b(please|if you would|if you could)\.?$/i,
  // Polite ending
  /\b(thanks|thank you|thank you very much)\.?$/i,
  // Thanks
  /\b(that's it|that's all|I'm done|all set)\.?$/i,
  // Conclusion
  /\b(yes|no|maybe|I don't know|not sure)\.?$/i,
  // Short answer
  /\b(okay|ok|alright|sure|of course)\.?$/i,
  // Agreement
  /\b(perfect|great|awesome|excellent)\.?$/i,
  // Positive closure
  /\b(bye|goodbye|see you|later|take care)\.?$/i,
  // Goodbye
  /\b(I'm done|I'm finished|that's everything)\.?$/i
  // Explicit end
];
function isSemanticComplete2(transcript, locale) {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR3 : COMPLETE_PATTERNS_EN3;
  return patterns.some((p) => p.test(transcript.trim()));
}
function hasTerminalPunctuation2(transcript) {
  return /[.!?。？！]$/.test(transcript.trim());
}
function detectEndOfUtterance(context) {
  const {
    transcript,
    confidence,
    vadProbability,
    locale,
    silenceDurationMs,
    transcriptStableMs
  } = context;
  const trimmed = transcript.trim();
  if (trimmed.length < 3) {
    return { isComplete: false, score: 0.1, reason: "short_utterance" };
  }
  if (isLikelyIncomplete2(transcript, locale)) {
    return { isComplete: false, score: 0.2, reason: "regex_incomplete" };
  }
  if (vadProbability > 0.7) {
    return { isComplete: false, score: 0.3, reason: "vad_active" };
  }
  if (confidence < 0.7) {
    return { isComplete: false, score: confidence, reason: "low_confidence" };
  }
  if (hasTerminalPunctuation2(transcript)) {
    return { isComplete: true, score: 0.95, reason: "terminal_punctuation" };
  }
  if (isSemanticComplete2(transcript, locale)) {
    return { isComplete: true, score: 0.9, reason: "semantic_complete" };
  }
  if (silenceDurationMs > 800 && transcriptStableMs > 500) {
    return { isComplete: true, score: 0.85, reason: "heuristic" };
  }
  return { isComplete: true, score: 0.75, reason: "heuristic" };
}
function isUtteranceComplete(transcript, confidence, locale) {
  if (transcript.trim().length < 3) return false;
  if (isLikelyIncomplete2(transcript, locale)) return false;
  if (confidence < 0.7) return false;
  if (hasTerminalPunctuation2(transcript)) return true;
  if (isSemanticComplete2(transcript, locale)) return true;
  return confidence >= 0.85;
}
function explainEOUResult(result) {
  const explanations = {
    regex_incomplete: "Detected incomplete pattern (e.g., trailing pronoun, conjunction)",
    vad_active: "Voice activity still detected - user may still be speaking",
    low_confidence: "Transcription confidence too low to make decision",
    terminal_punctuation: "Sentence ends with terminal punctuation (. ! ?)",
    semantic_complete: "Matches semantic completion pattern (e.g., 'merci', 'voil\xE0')",
    heuristic: "No strong signals, using timing heuristics",
    short_utterance: "Utterance too short to be complete"
  };
  return `EOU ${result.isComplete ? "COMPLETE" : "INCOMPLETE"} (${(result.score * 100).toFixed(0)}%): ${explanations[result.reason]}`;
}

// src/core/tts-player.ts
var SAMPLE_RATE2 = 24e3;
var CHANNELS2 = 1;
var BYTES_PER_SAMPLE = 2;
function pcm16ToFloat322(pcmData) {
  const numSamples = Math.floor(pcmData.length / BYTES_PER_SAMPLE);
  const float32 = new Float32Array(numSamples);
  const dataView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  for (let i = 0; i < numSamples; i++) {
    const int16 = dataView.getInt16(i * BYTES_PER_SAMPLE, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}
function createAudioBuffer2(ctx, samples) {
  const buffer = ctx.createBuffer(CHANNELS2, samples.length, SAMPLE_RATE2);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
function alignPCMChunk(chunk, pendingBytes2) {
  let pcmData;
  if (pendingBytes2 && pendingBytes2.length > 0) {
    pcmData = new Uint8Array(pendingBytes2.length + chunk.length);
    pcmData.set(pendingBytes2, 0);
    pcmData.set(chunk, pendingBytes2.length);
  } else {
    pcmData = chunk;
  }
  const remainder = pcmData.length % BYTES_PER_SAMPLE;
  if (remainder > 0) {
    return [pcmData.slice(0, -remainder), pcmData.slice(-remainder)];
  }
  return [pcmData, null];
}
var TTSPlayer = class {
  constructor(source, config2 = {}) {
    // Playback state (instance-level, not global)
    this.audioContext = null;
    this.isPlaying = false;
    this.shouldStop = false;
    this.pendingBytes = null;
    this.nextPlayTime = 0;
    this.activeSourceNodes = [];
    this.source = source;
    this.config = {
      voice: config2.voice ?? "marie-fr",
      debug: config2.debug ?? false
    };
  }
  /**
   * Speak text using streaming TTS
   */
  async speak(text, locale = "fr", callbacks, options) {
    this.stop();
    this.shouldStop = false;
    this.isPlaying = true;
    this.pendingBytes = null;
    const ctx = this.getAudioContext();
    try {
      const result = await this.source.fetchAudio(text, locale, {
        voice: options?.voice ?? this.config.voice,
        model: options?.model
      });
      let hasStarted = false;
      for await (const chunk of result.stream) {
        if (this.shouldStop) break;
        if (chunk && chunk.length > 0) {
          if (!hasStarted) {
            hasStarted = true;
            this.log("Streaming started");
            callbacks?.onStart?.();
          }
          this.processAndPlayChunk(ctx, chunk);
        }
      }
      if (!this.shouldStop) {
        await this.waitForPlaybackComplete();
        callbacks?.onEnd?.();
      }
    } catch (error) {
      this.isPlaying = false;
      const err = error instanceof Error ? error : new TTSError("TTS playback failed");
      callbacks?.onError?.(err);
      throw err;
    } finally {
      this.isPlaying = false;
      this.pendingBytes = null;
    }
  }
  /**
   * Stop playback
   */
  stop() {
    this.shouldStop = true;
    this.isPlaying = false;
    this.pendingBytes = null;
    for (const source of this.activeSourceNodes) {
      try {
        source.stop();
        source.disconnect();
      } catch {
      }
    }
    this.activeSourceNodes = [];
    this.nextPlayTime = 0;
  }
  /**
   * Check if currently playing
   */
  get playing() {
    return this.isPlaying;
  }
  /**
   * Dispose of resources
   */
  dispose() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
    this.audioContext = null;
  }
  // ============================================
  // PRIVATE METHODS
  // ============================================
  getAudioContext() {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE2 });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }
  processAndPlayChunk(ctx, chunk) {
    if (this.shouldStop) return;
    const [pcmData, remaining] = alignPCMChunk(chunk, this.pendingBytes);
    this.pendingBytes = remaining;
    if (pcmData.length < BYTES_PER_SAMPLE) return;
    const float32 = pcm16ToFloat322(pcmData);
    const buffer = createAudioBuffer2(ctx, float32);
    this.scheduleAudioBuffer(ctx, buffer);
  }
  scheduleAudioBuffer(ctx, buffer) {
    if (this.shouldStop) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const currentTime = ctx.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.activeSourceNodes.push(source);
    source.onended = () => {
      const index = this.activeSourceNodes.indexOf(source);
      if (index > -1) {
        this.activeSourceNodes.splice(index, 1);
      }
      source.disconnect();
    };
  }
  async waitForPlaybackComplete() {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.shouldStop || this.activeSourceNodes.length === 0) {
          resolve();
        } else {
          setTimeout(checkComplete, 50);
        }
      };
      checkComplete();
    });
  }
  log(message) {
    if (this.config.debug) {
      console.log(`[TTSPlayer] ${message}`);
    }
  }
};
function createTTSPlayer(source, config2) {
  return new TTSPlayer(source, config2);
}

// src/core/utils/device-capability.ts
async function isDeviceCapableForLocalML() {
  const memory = navigator.deviceMemory;
  if (memory && memory < 4) {
    console.log("[DeviceCapability] Insufficient memory:", memory, "GB");
    return false;
  }
  const wasmSimd = await checkWasmSimd();
  if (!wasmSimd) {
    console.log("[DeviceCapability] WASM SIMD not supported");
    return false;
  }
  const connection = navigator.connection;
  if (connection?.effectiveType === "2g" || connection?.saveData) {
    const cached2 = await isModelCached("turn-detector");
    if (!cached2) {
      console.log("[DeviceCapability] Slow connection and model not cached");
      return false;
    }
  }
  const cached = await isModelCached("turn-detector");
  if (cached) {
    console.log("[DeviceCapability] Model cached, using local");
    return true;
  }
  const mobile = isMobile();
  const capable = !mobile || memory !== void 0 && memory >= 6;
  console.log("[DeviceCapability] Final check:", {
    mobile,
    memory,
    capable
  });
  return capable;
}
async function checkWasmSimd() {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0,
        97,
        115,
        109,
        // WASM magic
        1,
        0,
        0,
        0,
        // Version 1
        1,
        5,
        1,
        96,
        0,
        1,
        123,
        // Type section: () -> v128
        3,
        2,
        1,
        0,
        // Function section
        10,
        10,
        1,
        8,
        0,
        // Code section
        65,
        0,
        // i32.const 0
        253,
        15,
        // v128.load
        11
        // end
      ])
    );
  } catch {
    return false;
  }
}
async function isModelCached(modelName) {
  try {
    const cache = await caches.open("voicekit-ml-models");
    const response = await cache.match(`/models/${modelName}.onnx`);
    return !!response;
  } catch {
    return false;
  }
}
function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
async function getDeviceCapabilitySummary() {
  const memory = navigator.deviceMemory;
  const wasmSimd = await checkWasmSimd();
  const mobile = isMobile();
  const connection = navigator.connection;
  const modelCached = await isModelCached("turn-detector");
  const capable = await isDeviceCapableForLocalML();
  return {
    memory,
    wasmSimd,
    mobile,
    connectionType: connection?.effectiveType,
    saveData: connection?.saveData ?? false,
    modelCached,
    capable
  };
}

// src/core/utils/browser.ts
function isIOS() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}
function isSafari() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /safari/.test(userAgent) && !/chrome/.test(userAgent);
}
function getIOSVersion() {
  if (typeof window === "undefined") return 0;
  const match = window.navigator.userAgent.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : 0;
}
function isVADSupported() {
  if (typeof window === "undefined") return false;
  const hasAudioContext = "AudioContext" in window || "webkitAudioContext" in window;
  const hasMediaDevices = "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices;
  const hasWebAssembly = "WebAssembly" in window;
  if (!hasAudioContext || !hasMediaDevices || !hasWebAssembly) {
    return false;
  }
  if (isIOS()) {
    const version = getIOSVersion();
    return version >= 15;
  }
  return true;
}
function isVoiceConversationSupported() {
  if (typeof window === "undefined") return false;
  return isVADSupported();
}
async function ensureAudioContextResumed(ctx) {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/adapters/tts/fetch-tts.ts
var globalConfig2 = {
  ttsStreamUrl: "/api/voice/tts/stream"
};
function configureFetchTTS(config2) {
  globalConfig2 = { ...globalConfig2, ...config2 };
}
function getFetchTTSConfig() {
  return { ...globalConfig2 };
}
var SAMPLE_RATE3 = 24e3;
var FetchTTSAdapter = class {
  constructor(options = {}) {
    this.audioContext = null;
    this.activeSource = null;
    this.isCurrentlyPlaying = false;
    this.ttsStreamUrl = options.ttsStreamUrl || globalConfig2.ttsStreamUrl;
  }
  /**
   * Get or create AudioContext with correct sample rate
   */
  getAudioContext() {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE3 });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }
  /**
   * Convert PCM 16-bit signed little-endian to Float32 (-1 to 1)
   */
  pcm16ToFloat32(pcmData) {
    const numSamples = Math.floor(pcmData.length / 2);
    const float32 = new Float32Array(numSamples);
    const dataView = new DataView(
      pcmData.buffer,
      pcmData.byteOffset,
      pcmData.byteLength
    );
    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      float32[i] = int16 / 32768;
    }
    return float32;
  }
  async synthesize(text, locale) {
    try {
      const response = await fetch(this.ttsStreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale })
      });
      if (!response.ok) {
        if (response.status !== 0) {
          console.warn("[FetchTTSAdapter] TTS request failed:", response.status);
        }
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return;
      }
      this.stop();
      const ctx = this.getAudioContext();
      const pcmData = new Uint8Array(arrayBuffer);
      const float32 = this.pcm16ToFloat32(pcmData);
      const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE3);
      audioBuffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      this.activeSource = source;
      this.isCurrentlyPlaying = true;
      source.onended = () => {
        this.isCurrentlyPlaying = false;
        this.activeSource = null;
      };
      source.start(0);
    } catch (error) {
      this.isCurrentlyPlaying = false;
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TypeError")) {
        return;
      }
      console.error("[FetchTTSAdapter] Playback error:", error);
      throw error;
    }
  }
  stop() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
      }
      this.activeSource = null;
    }
    this.isCurrentlyPlaying = false;
  }
  isPlaying() {
    return this.isCurrentlyPlaying;
  }
};
function createFetchTTSAdapter(options) {
  return new FetchTTSAdapter(options);
}

// src/adapters/tts/http-tts-source.ts
var HttpTTSSource = class {
  constructor(httpClient, config2 = {}) {
    this.prefetchCounter = 0;
    this.activePrefetches = /* @__PURE__ */ new Map();
    this.httpClient = httpClient;
    this.config = {
      ttsStreamUrl: config2.ttsStreamUrl ?? "",
      baseUrl: config2.baseUrl ?? "https://kond.studio/api/voice/v1",
      defaultVoice: config2.defaultVoice ?? "marie-fr",
      defaultModel: config2.defaultModel ?? ""
    };
  }
  async fetchAudio(text, locale, options) {
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
        model: options?.model ?? (this.config.defaultModel || void 0),
        speed: options?.speed
      },
      signal: options?.signal
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "TTS request failed" }));
      throw new TTSError(errorData.error ?? `TTS failed with status ${response.status}`);
    }
    if (!response.body) {
      throw new TTSError("TTS response has no body");
    }
    return {
      contentType: "audio/pcm",
      sampleRate: 24e3,
      channels: 1,
      bitsPerSample: 16,
      stream: this.streamFromReadable(response.body)
    };
  }
  async prefetch(text, locale, options) {
    const id = `prefetch-${++this.prefetchCounter}`;
    const abortController = new AbortController();
    const state = {
      abortController,
      chunks: [],
      totalBytes: 0,
      isComplete: false,
      error: void 0
    };
    this.activePrefetches.set(id, state);
    this.fetchInBackground(id, text, locale, {
      ...options,
      signal: abortController.signal
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
      getResult: () => this.getPrefetchResult(id)
    };
  }
  cancelPrefetch(handle) {
    const state = this.activePrefetches.get(handle.id);
    if (state && !state.isComplete) {
      state.abortController.abort();
      this.activePrefetches.delete(handle.id);
    }
  }
  getTTSUrl() {
    if (this.config.ttsStreamUrl) {
      return this.config.ttsStreamUrl;
    }
    return buildEndpointUrl(this.config.baseUrl, "ttsStream");
  }
  async *streamFromReadable(readable) {
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
  async fetchInBackground(id, text, locale, options) {
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
      if (error.name !== "AbortError") {
        state.error = error instanceof Error ? error : new Error(String(error));
        state.isComplete = true;
      }
    }
  }
  async getPrefetchResult(id) {
    const state = this.activePrefetches.get(id);
    if (!state) {
      throw new TTSError("Prefetch not found");
    }
    while (!state.isComplete) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (state.error) {
      throw state.error;
    }
    const chunks = state.chunks;
    return {
      contentType: "audio/pcm",
      sampleRate: 24e3,
      channels: 1,
      bitsPerSample: 16,
      stream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })()
    };
  }
};
function createHttpTTSSource(httpClient, config2) {
  return new HttpTTSSource(httpClient, config2);
}
export {
  AuthError,
  CancelledError,
  CloudTurnDetector,
  ConfigurationError,
  DEFAULTS,
  DEFAULT_CONFIG,
  DEFAULT_TURN_DETECTOR_CONFIG,
  DEFAULT_VAD_CONFIG,
  DeepgramStreamingAdapter,
  ENDPOINTS,
  ENVIRONMENTS,
  FetchHttpClient,
  FetchTTSAdapter,
  HeuristicTurnDetector,
  HttpTTSSource,
  MockTurnDetector,
  NetworkError,
  OnnxTurnDetector,
  RateLimitError,
  SileroVADAdapter,
  TTSError,
  TTSPlayer,
  TimeoutError,
  TranscriptionError,
  TurnDetectionError,
  VADError,
  VOICE_PRESETS,
  VoiceKit,
  VoiceKitError,
  alignPCMChunk,
  analyzeLinguisticSignals,
  analyzeTrigger,
  buildEndpointUrl,
  cancelPrefetch,
  extractSentences as chunkSentences,
  configureDeepgram,
  configureFetchTTS,
  configureTTSStreaming,
  createAudioBuffer2 as createAudioBuffer,
  createCloudTurnDetector,
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  createFetchHttpClient,
  createFetchTTSAdapter,
  createHeuristicTurnDetector,
  createHttpTTSSource,
  createMockTurnDetector,
  createOnnxTurnDetector,
  createSentenceAccumulator,
  createSileroVAD,
  createTTSPlayer,
  createTTSQueue,
  createTurnManager,
  createVoiceKit,
  detectEndOfUtterance,
  ensureAudioContextResumed,
  explainEOUResult,
  extractSentences,
  getDeepgramConfig,
  getDeviceCapabilitySummary,
  getEnvironmentConfig,
  getFetchTTSConfig,
  getIOSVersion,
  getTTSStreamingConfig,
  hasTerminalPunctuation,
  hasVisualBlocks,
  isBackchannel,
  isDeviceCapableForLocalML,
  isIOS,
  isLikelyComplete,
  isLikelyIncomplete,
  isPreloadedReady,
  isRetryableError,
  isSafari,
  isSemanticComplete,
  isShortAcknowledgment,
  isStreamingTTSPlaying,
  isBackchannel2 as isTriggerBackchannel,
  isLikelyIncomplete2 as isTriggerIncomplete,
  isUtteranceComplete,
  isVADSupported,
  isVoiceConversationSupported,
  isVoiceKitError,
  pcm16ToFloat322 as pcm16ToFloat32,
  playPreloadedAudio,
  prefetchAudio,
  resolveVoiceId,
  sanitizeForTTS,
  selectTtsModel,
  selectTtsModelWithReason,
  shouldTriggerEarly,
  sleep,
  speakTextStreaming,
  speakTextStreamingWithCallback,
  stopStreamingTTS,
  testAudioContextBeep,
  wrapError
};
//# sourceMappingURL=index.mjs.map