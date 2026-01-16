"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  DEFAULT_COOLDOWN_MS: () => DEFAULT_COOLDOWN_MS,
  DEFAULT_IDLE_TIMEOUT_MS: () => DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_SESSION_MS: () => DEFAULT_MAX_SESSION_MS,
  DEFAULT_SPEECH_FINAL_DELAY_MS: () => DEFAULT_SPEECH_FINAL_DELAY_MS,
  MAX_UTTERANCE_MS: () => MAX_UTTERANCE_MS,
  SILENCE_FALLBACK_MS: () => SILENCE_FALLBACK_MS,
  SPEECH_HYSTERESIS_MS: () => SPEECH_HYSTERESIS_MS,
  STREAMING_SAFETY_TIMEOUT_MS: () => STREAMING_SAFETY_TIMEOUT_MS,
  TRIGGERED_TIMEOUT_MS: () => TRIGGERED_TIMEOUT_MS,
  VAD_COOLDOWN_MS: () => VAD_COOLDOWN_MS,
  VoiceButton: () => VoiceButton,
  VoiceButtonDefault: () => VoiceButton_default,
  createTurnDetector: () => createTurnDetector,
  useAudioSetup: () => useAudioSetup,
  useLlmIntegration: () => useLlmIntegration,
  useSTTConnection: () => useSTTConnection,
  useSileroVAD: () => useSileroVAD,
  useTurnCoordination: () => useTurnCoordination,
  useTurnDetector: () => useTurnDetector,
  useVoiceConversation: () => useVoiceConversation,
  useVoiceKit: () => useVoiceKit,
  useVoiceKitDefault: () => use_voice_kit_default,
  useVoiceTimeouts: () => useVoiceTimeouts
});
module.exports = __toCommonJS(index_exports);

// src/react/use-voice-kit.ts
var import_react = require("react");

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
var import_vad_web = require("@ricky0123/vad-web");
var DEFAULT_CONFIG2 = {
  threshold: 0.5,
  minSpeechDuration: 250,
  silenceDuration: 700,
  hysteresisFrames: 3,
  baseAssetPath: "/",
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  modelVersion: "v5"
};
var SileroVADAdapter = class {
  constructor(config2) {
    this.vad = null;
    this.speechProbability = 0;
    this.isActive = false;
    this.stream = null;
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
    import_vad_web.MicVAD.new(vadOptions).then((vad) => {
      this.vad = vad;
      console.log(
        "%c[VAD] Silero VAD ACTIVE (ML-based)",
        "color: #22c55e; font-weight: bold"
      );
    }).catch((error) => {
      console.error(
        "%c[VAD] Silero VAD FAILED",
        "color: #ef4444; font-weight: bold",
        error
      );
      callbacks.onError?.(error);
      this.isActive = false;
    });
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
  const hasTerminalPunctuation2 = /[.!?。？！]$/.test(trimmed);
  if (/,\s*$/.test(trimmed)) return true;
  if (words.length === 1 && !hasTerminalPunctuation2) {
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
var OnnxTurnDetector = class {
  constructor(options = {}) {
    this.name = "onnx";
    this.history = [];
    this.initialized = false;
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options
    };
  }
  async init() {
    if (this.initialized) return;
    if (this.config.debug) {
      console.log("[OnnxTurnDetector] Initializing (STUB)...");
      console.warn(
        "[OnnxTurnDetector] Full implementation pending - falling back to heuristic behavior"
      );
    }
    this.initialized = true;
  }
  /**
   * STUB: Returns heuristic-based prediction
   * Full implementation would run ONNX inference
   */
  async predict(context) {
    if (!this.initialized) {
      await this.init();
    }
    const { transcript, silenceDurationMs, vadProbability, sttConfidence } = context;
    const trimmed = transcript.trim();
    if (trimmed.length < 3) {
      return {
        shouldCommit: false,
        confidence: 0.9,
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
    if (/[.!?]$/.test(trimmed) && silenceDurationMs > 500) {
      return {
        shouldCommit: true,
        confidence: 0.9,
        reason: "model_prediction"
      };
    }
    if (silenceDurationMs > 1e3 && sttConfidence > 0.8) {
      return {
        shouldCommit: true,
        confidence: 0.8,
        reason: "long_silence"
      };
    }
    return {
      shouldCommit: false,
      confidence: 0.6,
      reason: "incomplete"
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
    this.initialized = false;
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
  const hasTerminalPunctuation2 = /[.!?。？！]$/.test(trimmed);
  const lastWord = words[words.length - 1]?.replace(/[.,!?;:]$/, "") || "";
  if (lastWord.length >= 3 && !hasTerminalPunctuation2) {
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
  if (wordCount === 1 && !hasTerminalPunctuation2) {
    const completeCommands = locale === "fr" ? /^(stop|arrête|annule|cancel|non|no|oui|yes|ok|merci|bonjour|salut)$/i : /^(stop|cancel|no|yes|ok|thanks|hello|hi|bye)$/i;
    if (!completeCommands.test(trimmed)) {
      return true;
    }
  }
  if (wordCount < 4 && !hasTerminalPunctuation2) {
    const functionWords = locale === "fr" ? /^(je|tu|il|elle|on|nous|vous|ils|elles|le|la|les|un|une|des|de|du|à|pour|avec|dans|sur|que|qui|ce|cette|mon|ma|ton|ta|son|sa)$/i : /^(i|you|he|she|it|we|they|the|a|an|to|for|with|in|on|that|which|who|this|my|your|his|her)$/i;
    if (functionWords.test(lastWord)) {
      return true;
    }
  }
  if (lastWord.length <= 2 && !hasTerminalPunctuation2) {
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
    log("Committing turn:", transcript.substring(0, 50) + "...");
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
          log("Accumulated transcript (new utterance):", accumulatedFinalTranscript.substring(0, 60) + "...");
        } else {
          accumulatedFinalTranscript = trimmedNew;
        }
        transcript = accumulatedFinalTranscript;
        confidence = conf;
      }
      log("Transcript:", {
        text: text.substring(0, 40) + "...",
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
      if (event === "started") {
        vadSpeechActive = true;
        if (currentState === "speaking" || currentState === "cooldown") {
          log("Barge-in detected in state:", currentState);
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
        log("Added turn to detector history:", turn.role, turn.text.substring(0, 30));
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
  ttsStreamUrl: "/api/voice/tts/stream"
};
var SAMPLE_RATE = 24e3;
var CHANNELS = 1;
var audioContext = null;
var isStreamPlaying = false;
var shouldStopStream = false;
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
function processAndPlayChunk(ctx, chunk) {
  if (shouldStopStream) return;
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
async function speakTextStreaming(text, locale = "fr", onStart, onEnd, onError, ttsModel, voice) {
  stopStreamingTTS();
  shouldStopStream = false;
  isStreamPlaying = true;
  pendingBytes = null;
  const ctx = getAudioContext();
  try {
    const response = await fetch(config.ttsStreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      if (shouldStopStream) {
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
        processAndPlayChunk(ctx, value);
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
async function prefetchAudio(text, locale = "fr", ttsModel, voice) {
  const abortController = new AbortController();
  const preloaded = {
    chunks: [],
    totalBytes: 0,
    abortController,
    isComplete: false
  };
  try {
    const response = await fetch(config.ttsStreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  const ctx = getAudioContext();
  try {
    onStart?.();
    for (const chunk of preloaded.chunks) {
      if (shouldStopStream) break;
      processAndPlayChunk(ctx, chunk);
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
  const { locale, voice, onStart, onEnd, onError, debug = false } = options;
  const queue = [];
  let isPlaying = false;
  let isFinished = false;
  let isCancelled = false;
  let hasStarted = false;
  let nextPreloaded = null;
  let nextItem = null;
  let isPrefetching = false;
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
    nextItem = item;
    log("Prefetching N+1:", item.text.substring(0, 40) + "...", item.ttsModel ? `(${item.ttsModel})` : "");
    prefetchAudio(item.text, locale, item.ttsModel, voice).then((preloaded) => {
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
      prefetchAudio(item.text, locale, item.ttsModel, voice).then((preloaded) => {
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
        voice
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
    if (isCancelled || isPlaying) return;
    if (nextPreloaded && nextItem) {
      await playPreloaded(nextPreloaded, nextItem);
      return;
    }
    if (isPrefetching && nextItem) {
      log("Waiting for N+1 prefetch to complete...");
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
        await playPreloaded(extendedPreload, item);
        return;
      }
      await playStreaming(item);
      return;
    }
    if (isFinished) {
      log("Queue complete");
      onEnd?.();
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
var WORKLET_VERSION = "0.1.1";

// src/core/worklet-loader.ts
var CDN_BASE_URL = "https://kond.studio/sdk/voicekit";
var createLogger = (debug) => debug ? console.log.bind(console, "[VoiceKit]") : () => {
};
async function loadAudioWorklet(audioContext2, options = {}) {
  const { workletUrl, debug } = options;
  const log = createLogger(debug);
  if (workletUrl) {
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
  constructor(config2) {
    this.state = "idle";
    // Adapters
    this.stt = null;
    this.vad = null;
    this.turnDetector = null;
    // Core
    this.turnManager = null;
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
    this.config = {
      ...config2,
      locale: config2.locale || DEFAULT_CONFIG.locale,
      turnDetection: { ...DEFAULT_CONFIG.turnDetection, ...config2.turnDetection },
      tts: { ...DEFAULT_CONFIG.tts, ...config2.tts },
      timing: { ...DEFAULT_CONFIG.timing, ...config2.timing },
      debug: config2.debug ?? DEFAULT_CONFIG.debug
    };
    this.locale = this.config.locale || "fr";
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
      onQuotaExceeded: this.config.onQuotaExceeded
    };
    const hasCloudAuth = this.config.apiKey || this.config.token;
    switch (type) {
      case "cloud":
        return createCloudTurnDetector(cloudOptions);
      case "onnx":
        return createOnnxTurnDetector(baseConfig);
      case "heuristic":
        return createHeuristicTurnDetector(baseConfig);
      case "auto":
      default:
        if (hasCloudAuth) {
          return createCloudTurnDetector(cloudOptions);
        }
        return createHeuristicTurnDetector(baseConfig);
    }
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
      this.ttsQueue = createTTSQueue({
        locale: this.locale,
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

// src/react/use-voice-kit.ts
function useVoiceKit(options) {
  const [state, setState] = (0, import_react.useState)("idle");
  const [error, setError] = (0, import_react.useState)(null);
  const voiceKitRef = (0, import_react.useRef)(null);
  const optionsRef = (0, import_react.useRef)(options);
  (0, import_react.useEffect)(() => {
    optionsRef.current = options;
  }, [options]);
  const hasAuth = options.apiKey || options.token && options.tokenWsUrl;
  (0, import_react.useEffect)(() => {
    if (!hasAuth) {
      return;
    }
    const config2 = {
      ...optionsRef.current,
      onTranscript: (transcript) => optionsRef.current.onTranscript(transcript),
      onStateChange: (newState) => setState(newState),
      onError: (err) => setError(err),
      onBargeIn: () => {
      }
    };
    voiceKitRef.current = new VoiceKit(config2);
    return () => {
      voiceKitRef.current?.destroy();
      voiceKitRef.current = null;
    };
  }, [hasAuth, options.apiKey, options.token, options.tokenWsUrl]);
  const start = (0, import_react.useCallback)(async () => {
    setError(null);
    try {
      await voiceKitRef.current?.start();
    } catch (err) {
      setError({
        code: "start_failed",
        message: err instanceof Error ? err.message : "Failed to start voice",
        details: err
      });
    }
  }, []);
  const stop = (0, import_react.useCallback)(() => {
    voiceKitRef.current?.stop();
  }, []);
  const speak = (0, import_react.useCallback)((text) => {
    voiceKitRef.current?.speak(text);
  }, []);
  const finishSpeaking = (0, import_react.useCallback)(() => {
    voiceKitRef.current?.finishSpeaking();
  }, []);
  const interrupt = (0, import_react.useCallback)(() => {
    voiceKitRef.current?.interrupt();
  }, []);
  return {
    state,
    isActive: state !== "idle",
    isSpeaking: state === "speaking",
    start,
    stop,
    speak,
    finishSpeaking,
    interrupt,
    error
  };
}
var use_voice_kit_default = useVoiceKit;

// src/react/use-voice-conversation.ts
var import_react9 = require("react");

// src/core/utils/browser.ts
function isIOS() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/react/hooks/use-audio-setup.ts
var import_react2 = require("react");
function useAudioSetup(options = {}) {
  const {
    workletPath = "/audio-processor.worklet.js",
    targetSampleRate = 16e3,
    debug = false
  } = options;
  const [isAudioActive, setIsAudioActive] = (0, import_react2.useState)(false);
  const [audioError, setAudioError] = (0, import_react2.useState)(null);
  const mediaStreamRef = (0, import_react2.useRef)(null);
  const audioContextRef = (0, import_react2.useRef)(null);
  const workletNodeRef = (0, import_react2.useRef)(null);
  const log = (0, import_react2.useCallback)(
    (...args) => {
      if (debug) console.log("[audio-setup]", ...args);
    },
    [debug]
  );
  const cleanupAudio = (0, import_react2.useCallback)(() => {
    log("Cleaning up audio resources");
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: "stop" });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
      });
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsAudioActive(false);
    setAudioError(null);
  }, [log]);
  const setupAudio = (0, import_react2.useCallback)(async () => {
    cleanupAudio();
    setAudioError(null);
    try {
      log("Creating audio context...");
      const audioContext2 = new AudioContext();
      audioContextRef.current = audioContext2;
      const nativeSampleRate = audioContext2.sampleRate;
      log(`AudioContext sample rate: ${nativeSampleRate}Hz`);
      log("Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
          // Don't specify sampleRate - browser will match AudioContext
        }
      });
      mediaStreamRef.current = stream;
      log("Loading audio worklet...");
      await audioContext2.audioWorklet.addModule(workletPath);
      const source = audioContext2.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioContext2,
        "audio-capture-processor",
        {
          processorOptions: {
            inputSampleRate: nativeSampleRate,
            outputSampleRate: targetSampleRate
          }
        }
      );
      workletNodeRef.current = workletNode;
      source.connect(workletNode);
      workletNode.connect(audioContext2.destination);
      setIsAudioActive(true);
      log("Audio setup complete");
      return {
        stream,
        context: audioContext2,
        worklet: workletNode,
        source
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio setup failed";
      log("Audio setup error:", message);
      setAudioError(message);
      cleanupAudio();
      throw err;
    }
  }, [cleanupAudio, workletPath, targetSampleRate, log]);
  return {
    // Refs
    mediaStreamRef,
    audioContextRef,
    workletNodeRef,
    // Actions
    setupAudio,
    cleanupAudio,
    // State
    isAudioActive,
    audioError
  };
}

// src/react/hooks/use-stt-connection.ts
var import_react3 = require("react");
var BACKOFF_SEQUENCE_MS = [1e3, 2e3, 4e3, 8e3, 3e4];
var MAX_RECONNECT_ATTEMPTS = BACKOFF_SEQUENCE_MS.length;
function useSTTConnection(options = {}) {
  const { userId = "anonymous", apiKey, baseUrl, getAuthToken, debug = false } = options;
  const sttRef = (0, import_react3.useRef)(null);
  const log = (0, import_react3.useCallback)(
    (...args) => {
      if (debug) console.log("[stt-connection]", ...args);
    },
    [debug]
  );
  const disconnect = (0, import_react3.useCallback)(() => {
    if (sttRef.current) {
      log("Disconnecting STT");
      sttRef.current.close();
      sttRef.current = null;
    }
  }, [log]);
  const connect = (0, import_react3.useCallback)(
    async (callbacks, language = "multi") => {
      disconnect();
      log("Connecting to STT...");
      let adapter;
      if (getAuthToken) {
        adapter = createDeepgramAdapterWithAuth(getAuthToken, { baseUrl }, userId);
      } else if (apiKey) {
        adapter = createDeepgramAdapter({ apiKey, baseUrl }, userId);
      } else {
        throw new Error("Either apiKey or getAuthToken is required");
      }
      sttRef.current = adapter;
      await adapter.startStreaming(
        {
          onReady: () => {
            log("STT ready - forwarding to consumer");
            callbacks.onReady();
          },
          onInterim: (result) => {
            callbacks.onInterim(result);
          },
          onFinal: (result) => {
            callbacks.onFinal(result);
          },
          onUtteranceEnd: () => {
            log("UtteranceEnd - forwarding to consumer");
            callbacks.onUtteranceEnd();
          },
          onSpeechStarted: () => {
            callbacks.onSpeechStarted();
          },
          onError: (err) => {
            log("STT error:", err.message);
            callbacks.onError(err);
          }
        },
        language
      );
    },
    [userId, getAuthToken, disconnect, log]
  );
  const reconnect = (0, import_react3.useCallback)(
    async (callbacks, language = "multi") => {
      const isCurrentlyStreaming = sttRef.current?.isStreaming();
      log("Reconnect check - isStreaming:", isCurrentlyStreaming);
      if (!isCurrentlyStreaming) {
        log("Connection closed, reconnecting...");
        await connect(callbacks, language);
      }
    },
    [connect, log]
  );
  const reconnectWithBackoff = (0, import_react3.useCallback)(
    async (callbacks, language = "multi") => {
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        try {
          log(`Reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS}...`);
          await connect(callbacks, language);
          log(`Reconnect succeeded on attempt ${attempt + 1}`);
          return true;
        } catch (err) {
          const delay = BACKOFF_SEQUENCE_MS[attempt];
          log(`Reconnect attempt ${attempt + 1} failed, retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      log("All reconnect attempts failed");
      callbacks.onError(new Error("Connection failed after max retries"));
      return false;
    },
    [connect, log]
  );
  const sendAudio = (0, import_react3.useCallback)((data) => {
    if (sttRef.current?.isStreaming()) {
      sttRef.current.sendAudio(data);
    }
  }, []);
  const isConnected = (0, import_react3.useCallback)(() => {
    return sttRef.current !== null;
  }, []);
  const isStreaming = (0, import_react3.useCallback)(() => {
    return sttRef.current?.isStreaming() ?? false;
  }, []);
  return {
    sttRef,
    connect,
    reconnect,
    reconnectWithBackoff,
    disconnect,
    sendAudio,
    isConnected,
    isStreaming
  };
}

// src/react/hooks/use-voice-timeouts.ts
var import_react4 = require("react");

// src/react/types.ts
var DEFAULT_COOLDOWN_MS = 150;
var DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1e3;
var DEFAULT_MAX_SESSION_MS = 30 * 60 * 1e3;
var DEFAULT_SPEECH_FINAL_DELAY_MS = 1200;
var TRIGGERED_TIMEOUT_MS = 8e3;
var SILENCE_FALLBACK_MS = 2e3;
var SPEECH_HYSTERESIS_MS = 150;
var STREAMING_SAFETY_TIMEOUT_MS = 3e4;
var VAD_COOLDOWN_MS = 800;
var MAX_UTTERANCE_MS = 3e4;

// src/react/hooks/use-voice-timeouts.ts
function useVoiceTimeouts(options) {
  const {
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxSessionMs = DEFAULT_MAX_SESSION_MS,
    speechFinalDelayMs = DEFAULT_SPEECH_FINAL_DELAY_MS,
    debug = false,
    onIdleTimeout,
    onMaxSessionTimeout,
    onSpeechFinalCommit,
    onTriggeredTimeout,
    onSilenceTimeout,
    onStreamingSafetyTimeout,
    onVADCooldownComplete,
    onMaxUtteranceTimeout
  } = options;
  const idleTimeoutRef = (0, import_react4.useRef)(null);
  const maxSessionTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const speechFinalTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const triggeredTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const silenceTimeoutRef = (0, import_react4.useRef)(null);
  const streamingSafetyTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const vadCooldownTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const maxUtteranceTimeoutRef = (0, import_react4.useRef)(
    null
  );
  const lastSpeechTimeRef = (0, import_react4.useRef)(Date.now());
  const log = (0, import_react4.useCallback)(
    (...args) => {
      if (debug) console.log("[voice-timeouts]", ...args);
    },
    [debug]
  );
  const clearIdleTimeout = (0, import_react4.useCallback)(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);
  const clearMaxSessionTimeout = (0, import_react4.useCallback)(() => {
    if (maxSessionTimeoutRef.current) {
      clearTimeout(maxSessionTimeoutRef.current);
      maxSessionTimeoutRef.current = null;
    }
  }, []);
  const clearSpeechFinalTimeout = (0, import_react4.useCallback)(() => {
    if (speechFinalTimeoutRef.current) {
      clearTimeout(speechFinalTimeoutRef.current);
      speechFinalTimeoutRef.current = null;
    }
  }, []);
  const clearTriggeredTimeout = (0, import_react4.useCallback)(() => {
    if (triggeredTimeoutRef.current) {
      clearTimeout(triggeredTimeoutRef.current);
      triggeredTimeoutRef.current = null;
    }
  }, []);
  const clearSilenceTimeout = (0, import_react4.useCallback)(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);
  const clearStreamingSafetyTimeout = (0, import_react4.useCallback)(() => {
    if (streamingSafetyTimeoutRef.current) {
      clearTimeout(streamingSafetyTimeoutRef.current);
      streamingSafetyTimeoutRef.current = null;
    }
  }, []);
  const clearVADCooldownTimeout = (0, import_react4.useCallback)(() => {
    if (vadCooldownTimeoutRef.current) {
      clearTimeout(vadCooldownTimeoutRef.current);
      vadCooldownTimeoutRef.current = null;
    }
  }, []);
  const clearMaxUtteranceTimeout = (0, import_react4.useCallback)(() => {
    if (maxUtteranceTimeoutRef.current) {
      clearTimeout(maxUtteranceTimeoutRef.current);
      maxUtteranceTimeoutRef.current = null;
    }
  }, []);
  const clearAllTimeouts = (0, import_react4.useCallback)(() => {
    clearIdleTimeout();
    clearMaxSessionTimeout();
    clearSpeechFinalTimeout();
    clearTriggeredTimeout();
    clearSilenceTimeout();
    clearStreamingSafetyTimeout();
    clearVADCooldownTimeout();
    clearMaxUtteranceTimeout();
    log("All timeouts cleared");
  }, [
    clearIdleTimeout,
    clearMaxSessionTimeout,
    clearSpeechFinalTimeout,
    clearTriggeredTimeout,
    clearSilenceTimeout,
    clearStreamingSafetyTimeout,
    clearVADCooldownTimeout,
    clearMaxUtteranceTimeout,
    log
  ]);
  const startIdleTimeout = (0, import_react4.useCallback)(() => {
    if (idleTimeoutMs <= 0) return;
    clearIdleTimeout();
    lastSpeechTimeRef.current = Date.now();
    idleTimeoutRef.current = setTimeout(() => {
      log(`Idle timeout (${idleTimeoutMs / 1e3}s) - auto-stopping`);
      onIdleTimeout();
    }, idleTimeoutMs);
  }, [idleTimeoutMs, clearIdleTimeout, onIdleTimeout, log]);
  const resetIdleTimeout = (0, import_react4.useCallback)(() => {
    lastSpeechTimeRef.current = Date.now();
    if (idleTimeoutMs > 0) {
      startIdleTimeout();
    }
  }, [idleTimeoutMs, startIdleTimeout]);
  const startMaxSessionTimeout = (0, import_react4.useCallback)(() => {
    if (maxSessionMs <= 0) return;
    clearMaxSessionTimeout();
    maxSessionTimeoutRef.current = setTimeout(() => {
      log(`Max session timeout (${maxSessionMs / 1e3}s) - auto-stopping`);
      onMaxSessionTimeout();
    }, maxSessionMs);
  }, [maxSessionMs, clearMaxSessionTimeout, onMaxSessionTimeout, log]);
  const scheduleSpeechFinalCommit = (0, import_react4.useCallback)(() => {
    clearSpeechFinalTimeout();
    log(`Scheduling commit in ${speechFinalDelayMs}ms (grace period)`);
    speechFinalTimeoutRef.current = setTimeout(() => {
      speechFinalTimeoutRef.current = null;
      log("Grace period expired - committing");
      onSpeechFinalCommit();
    }, speechFinalDelayMs);
  }, [speechFinalDelayMs, clearSpeechFinalTimeout, onSpeechFinalCommit, log]);
  const cancelSpeechFinalCommit = (0, import_react4.useCallback)(() => {
    let cancelled = false;
    if (speechFinalTimeoutRef.current) {
      clearSpeechFinalTimeout();
      cancelled = true;
    }
    if (silenceTimeoutRef.current) {
      clearSilenceTimeout();
      cancelled = true;
    }
    if (cancelled) {
      log("Cancelled pending commits (user resumed speaking)");
    }
  }, [clearSpeechFinalTimeout, clearSilenceTimeout, log]);
  const startTriggeredTimeout = (0, import_react4.useCallback)(() => {
    clearTriggeredTimeout();
    triggeredTimeoutRef.current = setTimeout(() => {
      log(`Triggered timeout (${TRIGGERED_TIMEOUT_MS / 1e3}s) - forcing commit`);
      onTriggeredTimeout();
    }, TRIGGERED_TIMEOUT_MS);
  }, [clearTriggeredTimeout, onTriggeredTimeout, log]);
  const startSilenceTimeout = (0, import_react4.useCallback)(() => {
    clearSilenceTimeout();
    silenceTimeoutRef.current = setTimeout(() => {
      log(`Silence timeout (${SILENCE_FALLBACK_MS / 1e3}s) - committing`);
      onSilenceTimeout();
    }, SILENCE_FALLBACK_MS);
  }, [clearSilenceTimeout, onSilenceTimeout, log]);
  const startStreamingSafetyTimeout = (0, import_react4.useCallback)(() => {
    clearStreamingSafetyTimeout();
    streamingSafetyTimeoutRef.current = setTimeout(() => {
      log(
        `Streaming safety timeout (${STREAMING_SAFETY_TIMEOUT_MS / 1e3}s) - recovering`
      );
      onStreamingSafetyTimeout();
    }, STREAMING_SAFETY_TIMEOUT_MS);
  }, [clearStreamingSafetyTimeout, onStreamingSafetyTimeout, log]);
  const startVADCooldownTimeout = (0, import_react4.useCallback)(() => {
    clearVADCooldownTimeout();
    vadCooldownTimeoutRef.current = setTimeout(() => {
      log(`VAD cooldown complete (${VAD_COOLDOWN_MS}ms) - evaluating`);
      onVADCooldownComplete();
    }, VAD_COOLDOWN_MS);
  }, [clearVADCooldownTimeout, onVADCooldownComplete, log]);
  const startMaxUtteranceTimeout = (0, import_react4.useCallback)(() => {
    clearMaxUtteranceTimeout();
    maxUtteranceTimeoutRef.current = setTimeout(() => {
      log(`Max utterance timeout (${MAX_UTTERANCE_MS / 1e3}s) - forcing commit`);
      onMaxUtteranceTimeout();
    }, MAX_UTTERANCE_MS);
  }, [clearMaxUtteranceTimeout, onMaxUtteranceTimeout, log]);
  return {
    // Idle/session
    startIdleTimeout,
    resetIdleTimeout,
    startMaxSessionTimeout,
    // Speech/commit
    scheduleSpeechFinalCommit,
    cancelSpeechFinalCommit,
    // Triggered
    startTriggeredTimeout,
    clearTriggeredTimeout,
    // Silence
    startSilenceTimeout,
    clearSilenceTimeout,
    // Streaming safety
    startStreamingSafetyTimeout,
    clearStreamingSafetyTimeout,
    // VAD cooldown
    startVADCooldownTimeout,
    clearVADCooldownTimeout,
    // Max utterance
    startMaxUtteranceTimeout,
    clearMaxUtteranceTimeout,
    // Cleanup
    clearAllTimeouts,
    // Refs
    lastSpeechTimeRef
  };
}

// src/react/hooks/use-turn-coordination.ts
var import_react5 = require("react");
function useTurnCoordination(options) {
  const {
    speechFinalDelayMs,
    debug = false,
    turnDetector,
    onTurnComplete,
    onBargeIn,
    onSpeechActivity
  } = options;
  const turnManagerRef = (0, import_react5.useRef)(null);
  const log = (0, import_react5.useCallback)(
    (...args) => {
      if (debug) console.log("[turn-coordination]", ...args);
    },
    [debug]
  );
  const createTurnManagerFn = (0, import_react5.useCallback)(() => {
    if (turnManagerRef.current) {
      turnManagerRef.current.destroy();
    }
    log(
      "Creating TurnManager",
      turnDetector ? `with ${turnDetector.name} detector` : "without ML detector"
    );
    turnManagerRef.current = createTurnManager({
      silenceThresholdMs: 700,
      stabilityThresholdMs: 500,
      maxSilenceMs: 1500,
      gracePeriodMs: speechFinalDelayMs,
      rmsThreshold: 0.015,
      speechHysteresisMs: SPEECH_HYSTERESIS_MS,
      speechHangoverMs: 300,
      debug,
      turnDetector: turnDetector ?? void 0,
      onTurnComplete: (transcript, confidence) => {
        log("Turn complete:", transcript.substring(0, 50) + "...");
        onTurnComplete(transcript, confidence);
      },
      onBargeIn: () => {
        log("Barge-in detected");
        onBargeIn();
      },
      onSpeechActivity: (speaking) => {
        onSpeechActivity(speaking);
      }
    });
  }, [
    speechFinalDelayMs,
    debug,
    turnDetector,
    onTurnComplete,
    onBargeIn,
    onSpeechActivity,
    log
  ]);
  const destroyTurnManager = (0, import_react5.useCallback)(() => {
    if (turnManagerRef.current) {
      log("Destroying TurnManager");
      turnManagerRef.current.destroy();
      turnManagerRef.current = null;
    }
  }, [log]);
  const resetTurnManager = (0, import_react5.useCallback)(() => {
    if (turnManagerRef.current) {
      log("Resetting TurnManager");
      turnManagerRef.current.reset();
    }
  }, [log]);
  const feedTranscript = (0, import_react5.useCallback)(
    (text, isFinal, speechFinal, confidence) => {
      turnManagerRef.current?.handleTranscript(
        text,
        isFinal,
        speechFinal,
        confidence
      );
    },
    []
  );
  const feedRMS = (0, import_react5.useCallback)((level) => {
    turnManagerRef.current?.handleRMS(level);
  }, []);
  const feedVADEvent = (0, import_react5.useCallback)((event) => {
    turnManagerRef.current?.handleVADEvent(event);
  }, []);
  const feedVADProbability = (0, import_react5.useCallback)((probability) => {
    turnManagerRef.current?.handleVADProbability(probability);
  }, []);
  const syncState = (0, import_react5.useCallback)((state) => {
    if (!turnManagerRef.current) return;
    const tmState = state === "listening" ? "listening" : state === "triggered" ? "triggered" : state === "streaming" ? "streaming" : state === "speaking" ? "speaking" : state === "cooldown" ? "cooldown" : state === "vad_cooldown" ? "vad_cooldown" : "listening";
    turnManagerRef.current.setState(tmState);
  }, []);
  const getTranscript = (0, import_react5.useCallback)(() => {
    return turnManagerRef.current?.getTranscript() ?? "";
  }, []);
  const setTurnDetector = (0, import_react5.useCallback)(
    (detector) => {
      if (turnManagerRef.current) {
        log("Setting TurnDetector:", detector?.name ?? "none");
        turnManagerRef.current.setTurnDetector(detector);
      }
    },
    [log]
  );
  (0, import_react5.useEffect)(() => {
    return () => {
      destroyTurnManager();
    };
  }, [destroyTurnManager]);
  return {
    turnManagerRef,
    createTurnManager: createTurnManagerFn,
    destroyTurnManager,
    resetTurnManager,
    feedTranscript,
    feedRMS,
    feedVADEvent,
    feedVADProbability,
    syncState,
    getTranscript,
    setTurnDetector
  };
}

// src/react/hooks/use-llm-integration.ts
var import_react6 = require("react");
function useLlmIntegration(options) {
  const { sendMessage, debug = false } = options;
  const llmBufferRef = (0, import_react6.useRef)("");
  const llmAbortRef = (0, import_react6.useRef)(null);
  const isRequestingRef = (0, import_react6.useRef)(false);
  const log = (0, import_react6.useCallback)(
    (...args) => {
      if (debug) console.log("[llm-integration]", ...args);
    },
    [debug]
  );
  const startLlmEarly = (0, import_react6.useCallback)(
    async (transcript) => {
      if (!sendMessage) {
        log("No sendMessage function provided");
        return;
      }
      if (isRequestingRef.current) {
        log("Already requesting LLM, skipping");
        return;
      }
      log("Starting LLM early with:", transcript.substring(0, 50) + "...");
      llmAbortRef.current?.abort();
      llmAbortRef.current = new AbortController();
      llmBufferRef.current = "";
      isRequestingRef.current = true;
      try {
        const response = await sendMessage(transcript);
        llmBufferRef.current = response;
        log("LLM response buffered:", response.substring(0, 50) + "...");
      } catch (err) {
        if (err.name !== "AbortError") {
          log("LLM early error:", err);
        }
      } finally {
        isRequestingRef.current = false;
      }
    },
    [sendMessage, log]
  );
  const abortLlm = (0, import_react6.useCallback)(() => {
    if (llmAbortRef.current) {
      log("Aborting LLM request");
      llmAbortRef.current.abort();
      llmAbortRef.current = null;
    }
    isRequestingRef.current = false;
  }, [log]);
  const clearBuffer = (0, import_react6.useCallback)(() => {
    llmBufferRef.current = "";
  }, []);
  const hasBufferedResponse = (0, import_react6.useCallback)(() => {
    return llmBufferRef.current.length > 0;
  }, []);
  const getBufferedResponse = (0, import_react6.useCallback)(() => {
    return llmBufferRef.current;
  }, []);
  return {
    llmBufferRef,
    llmAbortRef,
    startLlmEarly,
    abortLlm,
    clearBuffer,
    hasBufferedResponse,
    getBufferedResponse
  };
}

// src/react/hooks/use-silero-vad.ts
var import_react7 = require("react");
function useSileroVAD(options = {}) {
  const {
    threshold = 0.5,
    silenceDuration = 700,
    minSpeechDuration = 250,
    debug = false
  } = options;
  const vadRef = (0, import_react7.useRef)(null);
  const log = (0, import_react7.useCallback)(
    (...args) => {
      if (debug) console.log("[silero-vad]", ...args);
    },
    [debug]
  );
  const startVAD = (0, import_react7.useCallback)(
    async (stream, callbacks) => {
      if (vadRef.current) {
        vadRef.current.stop();
      }
      log("Starting Silero VAD");
      vadRef.current = createSileroVAD({
        threshold,
        silenceDuration,
        minSpeechDuration
      });
      await vadRef.current.init();
      vadRef.current.start(stream, callbacks);
    },
    [threshold, silenceDuration, minSpeechDuration, log]
  );
  const stopVAD = (0, import_react7.useCallback)(() => {
    if (vadRef.current) {
      log("Stopping Silero VAD");
      vadRef.current.stop();
      vadRef.current = null;
    }
  }, [log]);
  const getSpeechProbability = (0, import_react7.useCallback)(() => {
    return vadRef.current?.getSpeechProbability() ?? 0;
  }, []);
  const isVADRunning = (0, import_react7.useCallback)(() => {
    return vadRef.current?.isRunning() ?? false;
  }, []);
  (0, import_react7.useEffect)(() => {
    return () => {
      stopVAD();
    };
  }, [stopVAD]);
  return {
    vadRef,
    startVAD,
    stopVAD,
    getSpeechProbability,
    isVADRunning
  };
}

// src/react/hooks/use-turn-detector.ts
var import_react8 = require("react");

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

// src/react/hooks/use-turn-detector.ts
async function createDetector(type, config2) {
  const cloudOptions = {
    ...config2,
    apiKey: config2.apiKey || "",
    onQuotaExceeded: config2.onQuotaExceeded
  };
  if (type === "auto") {
    if (config2.apiKey) {
      console.log("[useTurnDetector] API key provided -> Cloud");
      return {
        provider: createCloudTurnDetector(cloudOptions),
        activeType: "cloud"
      };
    }
    try {
      const capable = await isDeviceCapableForLocalML();
      if (capable) {
        console.log("[useTurnDetector] Device capable for local ML -> ONNX");
        return {
          provider: createOnnxTurnDetector(config2),
          activeType: "onnx"
        };
      }
    } catch (error) {
      console.warn(
        "[useTurnDetector] Auto-select failed, using heuristic:",
        error
      );
    }
    return {
      provider: createHeuristicTurnDetector(config2),
      activeType: "heuristic"
    };
  }
  switch (type) {
    case "onnx":
      return {
        provider: createOnnxTurnDetector(config2),
        activeType: "onnx"
      };
    case "cloud":
      return {
        provider: createCloudTurnDetector(cloudOptions),
        activeType: "cloud"
      };
    case "heuristic":
    default:
      return {
        provider: createHeuristicTurnDetector(config2),
        activeType: "heuristic"
      };
  }
}
function useTurnDetector(options = {}) {
  const { type = "heuristic", enabled = true, ...config2 } = options;
  const [isReady, setIsReady] = (0, import_react8.useState)(false);
  const [activeType, setActiveType] = (0, import_react8.useState)(null);
  const [lastPrediction, setLastPrediction] = (0, import_react8.useState)(
    null
  );
  const [error, setError] = (0, import_react8.useState)(null);
  const providerRef = (0, import_react8.useRef)(null);
  const initializingRef = (0, import_react8.useRef)(false);
  const init = (0, import_react8.useCallback)(async () => {
    console.log(
      "[useTurnDetector] init() called - type:",
      type,
      "enabled:",
      enabled,
      "hasApiKey:",
      !!config2.apiKey
    );
    if (!enabled) {
      console.log("[useTurnDetector] Disabled, skipping init");
      return;
    }
    if (providerRef.current || initializingRef.current) {
      console.log(
        "[useTurnDetector] Already initialized or initializing, skipping"
      );
      return;
    }
    initializingRef.current = true;
    setError(null);
    try {
      console.log("[useTurnDetector] Creating detector...");
      const { provider, activeType: selectedType } = await createDetector(
        type,
        config2
      );
      console.log(
        "[useTurnDetector] Provider created:",
        provider.name,
        "- calling init()..."
      );
      await provider.init();
      providerRef.current = provider;
      setActiveType(selectedType);
      setIsReady(true);
      console.log(
        `[useTurnDetector] Initialized with ${selectedType}`,
        provider
      );
    } catch (err) {
      const error2 = err instanceof Error ? err : new Error(String(err));
      setError(error2);
      console.error("[useTurnDetector] Init failed:", error2);
      try {
        const fallback = createHeuristicTurnDetector(
          config2
        );
        await fallback.init();
        providerRef.current = fallback;
        setActiveType("heuristic");
        setIsReady(true);
        console.log("[useTurnDetector] Fell back to heuristic");
      } catch (fallbackErr) {
        console.error("[useTurnDetector] Fallback also failed:", fallbackErr);
      }
    } finally {
      initializingRef.current = false;
    }
  }, [enabled, type, config2]);
  const predict = (0, import_react8.useCallback)(
    async (context) => {
      if (!providerRef.current) {
        return null;
      }
      try {
        const prediction = await providerRef.current.predict(context);
        setLastPrediction(prediction);
        return prediction;
      } catch (err) {
        console.error("[useTurnDetector] Prediction failed:", err);
        return null;
      }
    },
    []
  );
  const addTurn = (0, import_react8.useCallback)((turn) => {
    providerRef.current?.addTurn(turn);
  }, []);
  const reset = (0, import_react8.useCallback)(() => {
    providerRef.current?.reset();
    setLastPrediction(null);
  }, []);
  const getProvider = (0, import_react8.useCallback)(() => providerRef.current, []);
  (0, import_react8.useEffect)(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, []);
  return {
    isReady,
    activeType,
    init,
    predict,
    addTurn,
    reset,
    getProvider,
    lastPrediction,
    error
  };
}
async function createTurnDetector(options = {}) {
  const { type = "auto", ...config2 } = options;
  const { provider } = await createDetector(type, config2);
  await provider.init();
  return provider;
}

// src/react/use-voice-conversation.ts
function useVoiceConversation(options = {}) {
  const {
    locale = "fr",
    userId = "anonymous",
    onUserMessage,
    sendMessage,
    onAutoStop,
    cancelTTS,
    onTTSStart,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxSessionMs = DEFAULT_MAX_SESSION_MS,
    speechFinalDelayMs = DEFAULT_SPEECH_FINAL_DELAY_MS,
    debug = false
  } = options;
  const [state, setState] = (0, import_react9.useState)("idle");
  const [isActive, setIsActive] = (0, import_react9.useState)(false);
  const [transcript, setTranscript] = (0, import_react9.useState)("");
  const [error, setError] = (0, import_react9.useState)(null);
  const [userSpeaking, setUserSpeaking] = (0, import_react9.useState)(false);
  const stateRef = (0, import_react9.useRef)("idle");
  const isActiveRef = (0, import_react9.useRef)(false);
  const finalTranscriptRef = (0, import_react9.useRef)("");
  const lastInterimRef = (0, import_react9.useRef)("");
  const streamingStartedRef = (0, import_react9.useRef)(false);
  const speechStartedTimeRef = (0, import_react9.useRef)(0);
  const maxUtteranceStartedRef = (0, import_react9.useRef)(false);
  const lastUserMessageRef = (0, import_react9.useRef)("");
  const interruptionContextRef = (0, import_react9.useRef)(null);
  const isSupported = isVoiceConversationSupported();
  const log = (0, import_react9.useCallback)(
    (...args) => {
      if (debug) console.log("[voice-conversation]", ...args);
    },
    [debug]
  );
  (0, import_react9.useEffect)(() => {
    stateRef.current = state;
  }, [state]);
  (0, import_react9.useEffect)(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  const audio = useAudioSetup({ debug });
  const stt = useSTTConnection({ userId, debug });
  const llm = useLlmIntegration({ sendMessage, debug });
  const sileroVAD = useSileroVAD({
    threshold: 0.5,
    silenceDuration: 700,
    minSpeechDuration: 250,
    debug
  });
  const turnDetectorConfig = {
    type: "heuristic",
    // Default to heuristic, can be configured
    locale: locale === "en" ? "en" : "fr",
    detectBackchannels: true,
    detectInterruptions: true
  };
  const {
    getProvider: getTurnDetectorProvider,
    init: initTurnDetector,
    isReady: turnDetectorReady,
    activeType: turnDetectorActiveType
  } = useTurnDetector(turnDetectorConfig);
  const commitResponseRef = (0, import_react9.useRef)(async () => {
  });
  const sttLanguage = locale === "en" ? "en" : locale === "fr" ? "fr" : "multi";
  const resumeListeningRef = (0, import_react9.useRef)(async () => {
  });
  const timeouts = useVoiceTimeouts({
    idleTimeoutMs,
    maxSessionMs,
    speechFinalDelayMs,
    debug,
    onIdleTimeout: () => handleAutoStop("idle"),
    onMaxSessionTimeout: () => handleAutoStop("max_duration"),
    onSpeechFinalCommit: () => {
      timeouts.clearSilenceTimeout();
      setUserSpeaking(false);
      maxUtteranceStartedRef.current = false;
      commitResponseRef.current();
    },
    onTriggeredTimeout: () => commitResponseRef.current(),
    onSilenceTimeout: () => {
      if (isActiveRef.current && stateRef.current !== "speaking" && stateRef.current !== "cooldown") {
        timeouts.cancelSpeechFinalCommit();
        setUserSpeaking(false);
        maxUtteranceStartedRef.current = false;
        commitResponseRef.current();
      }
    },
    onStreamingSafetyTimeout: () => {
      if (stateRef.current === "triggered" && !streamingStartedRef.current && isActiveRef.current) {
        log("Safety timeout: no streaming after 30s");
        setState("listening");
        resumeListeningRef.current();
      }
    },
    onVADCooldownComplete: () => {
      if (stateRef.current !== "vad_cooldown") return;
      log("VAD cooldown complete - evaluating commit");
      const text = turn.getTranscript() || finalTranscriptRef.current || lastInterimRef.current;
      if (!text.trim()) {
        log("No transcript, back to listening");
        setState("listening");
        return;
      }
      const localeKey = locale === "en" ? "en" : "fr";
      if (isLikelyIncomplete2(text, localeKey)) {
        log(
          "Incomplete utterance detected:",
          text.substring(0, 30),
          "- waiting for more"
        );
        setState("listening");
        return;
      }
      startLlmEarly(text);
    },
    // Max utterance timeout - prevents user from speaking indefinitely
    onMaxUtteranceTimeout: () => {
      log("Max utterance timeout (30s) - forcing commit");
      maxUtteranceStartedRef.current = false;
      const text = turn.getTranscript() || finalTranscriptRef.current || lastInterimRef.current;
      if (text.trim() && stateRef.current === "listening") {
        startLlmEarly(text);
      }
    }
  });
  const turn = useTurnCoordination({
    speechFinalDelayMs,
    debug,
    turnDetector: getTurnDetectorProvider(),
    onTurnComplete: (text) => {
      finalTranscriptRef.current = text;
      if (stateRef.current === "listening") {
        startLlmEarly(text);
      }
      timeouts.scheduleSpeechFinalCommit();
    },
    onBargeIn: handleBargeIn,
    onSpeechActivity: (speaking) => {
      setUserSpeaking(speaking);
      if (speaking) timeouts.resetIdleTimeout();
    }
  });
  const startLlmEarly = (0, import_react9.useCallback)(
    async (text) => {
      if (stateRef.current === "triggered" || !sendMessage) return;
      log("Early trigger:", text.substring(0, 40));
      setState("triggered");
      lastUserMessageRef.current = text;
      timeouts.startTriggeredTimeout();
      await llm.startLlmEarly(text);
    },
    [sendMessage, timeouts, llm, log]
  );
  const handleAutoStop = (0, import_react9.useCallback)(
    (reason) => {
      log("Auto-stop:", reason);
      timeouts.clearAllTimeouts();
      turn.destroyTurnManager();
      llm.abortLlm();
      sileroVAD.stopVAD();
      stt.disconnect();
      audio.cleanupAudio();
      setUserSpeaking(false);
      setIsActive(false);
      setState("idle");
      setTranscript("");
      llm.clearBuffer();
      finalTranscriptRef.current = "";
      lastInterimRef.current = "";
      maxUtteranceStartedRef.current = false;
      onAutoStop?.(reason);
    },
    [timeouts, turn, llm, sileroVAD, stt, audio, onAutoStop, log]
  );
  function handleBargeIn() {
    if (stateRef.current === "speaking" || stateRef.current === "cooldown") {
      log("Barge-in detected in state:", stateRef.current);
      const partialResponse = llm.getBufferedResponse();
      if (partialResponse && lastUserMessageRef.current) {
        interruptionContextRef.current = {
          partialResponse,
          userMessage: lastUserMessageRef.current,
          interruptedAt: Date.now()
        };
        log("Stored interruption context:", {
          userMessage: lastUserMessageRef.current.substring(0, 30) + "...",
          partialResponse: partialResponse.substring(0, 50) + "..."
        });
      }
      llm.abortLlm();
      cancelTTS?.();
      setState("listening");
      turn.syncState("listening");
    }
  }
  const resumeListening = (0, import_react9.useCallback)(async () => {
    turn.resetTurnManager();
    await stt.reconnect(createSTTCallbacks(), sttLanguage);
  }, [turn, stt, sttLanguage]);
  (0, import_react9.useEffect)(() => {
    resumeListeningRef.current = resumeListening;
  }, [resumeListening]);
  const handleStreamingStart = (0, import_react9.useCallback)(() => {
    if (stateRef.current === "triggered") {
      log("Streaming started");
      streamingStartedRef.current = true;
      timeouts.clearTriggeredTimeout();
      timeouts.clearStreamingSafetyTimeout();
      setState("streaming");
    }
  }, [timeouts, log]);
  const handleTTSSpeakingStart = (0, import_react9.useCallback)(() => {
    if (stateRef.current === "streaming") {
      log("TTS speaking started");
      setState("speaking");
      turn.syncState("speaking");
    }
  }, [turn, log]);
  const handleStreamingEnd = (0, import_react9.useCallback)(async () => {
    log("Streaming end \u2192 cooldown");
    streamingStartedRef.current = false;
    maxUtteranceStartedRef.current = false;
    timeouts.clearMaxUtteranceTimeout();
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    setTranscript("");
    if (!isActiveRef.current) return;
    setState("cooldown");
    turn.syncState("cooldown");
    await sleep(cooldownMs);
    if (isActiveRef.current) {
      setState("listening");
      turn.syncState("listening");
      resumeListening();
    }
  }, [cooldownMs, llm, timeouts, turn, resumeListening, log]);
  const commitResponse = (0, import_react9.useCallback)(async () => {
    timeouts.clearTriggeredTimeout();
    timeouts.clearMaxUtteranceTimeout();
    maxUtteranceStartedRef.current = false;
    const text = turn.getTranscript() || finalTranscriptRef.current || lastInterimRef.current;
    log("Commit:", text.substring(0, 40), "state:", stateRef.current);
    if (stateRef.current === "triggered" || stateRef.current === "streaming") {
      if (stateRef.current === "triggered" && !streamingStartedRef.current) {
        timeouts.startStreamingSafetyTimeout();
      }
      return;
    }
    if (text) onUserMessage?.(text);
    if (!llm.hasBufferedResponse() && sendMessage && text) {
      setState("processing");
      try {
        await llm.startLlmEarly(text);
      } catch {
        if (isActiveRef.current) {
          setState("listening");
          resumeListening();
        }
        return;
      }
    }
    const response = llm.getBufferedResponse();
    if (!response?.trim()?.replace(/\.{2,}|…/g, "")?.trim()) {
      llm.clearBuffer();
      if (isActiveRef.current) {
        setState("listening");
        resumeListening();
      }
      return;
    }
    setState("cooldown");
    await sleep(cooldownMs);
    if (isActiveRef.current) {
      setState("listening");
      resumeListening();
    }
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    setTranscript("");
  }, [
    timeouts,
    sendMessage,
    llm,
    onUserMessage,
    cooldownMs,
    resumeListening,
    log,
    turn
  ]);
  (0, import_react9.useEffect)(() => {
    commitResponseRef.current = commitResponse;
  }, [commitResponse]);
  (0, import_react9.useEffect)(() => {
    turn.syncState(state);
  }, [state, turn]);
  function createSTTCallbacks() {
    return {
      onReady: () => {
        if (stateRef.current !== "connecting") {
          return;
        }
        log("STT ready");
        setState("listening");
      },
      onInterim: (result) => {
        if (!isActiveRef.current) return;
        turn.feedTranscript(result.text, false, false, result.confidence);
        timeouts.cancelSpeechFinalCommit();
        setTranscript(result.text);
        lastInterimRef.current = result.text;
        if (!maxUtteranceStartedRef.current && stateRef.current === "listening") {
          maxUtteranceStartedRef.current = true;
          timeouts.startMaxUtteranceTimeout();
        }
      },
      onFinal: (result) => {
        if (!isActiveRef.current) return;
        turn.feedTranscript(
          result.text,
          true,
          result.speechFinal || false,
          result.confidence
        );
        setTranscript(result.text);
        finalTranscriptRef.current = result.text;
        timeouts.startSilenceTimeout();
        const localeKey = locale === "en" ? "en" : "fr";
        if (result.speechFinal && isBackchannel2(result.text, result.confidence, localeKey)) {
          log("Backchannel detected:", result.text, "- skipping LLM");
          turn.resetTurnManager();
          finalTranscriptRef.current = "";
          lastInterimRef.current = "";
          setTranscript("");
          return;
        }
        if (result.speechFinal && stateRef.current === "listening") {
          log("VAD speech end \u2192 entering cooldown");
          setState("vad_cooldown");
          timeouts.startVADCooldownTimeout();
          return;
        }
        const localeForIncomplete = locale === "en" ? "en" : "fr";
        const vadProbFinal = sileroVAD.getSpeechProbability();
        if (stateRef.current === "listening" && result.text.trim() && !isLikelyIncomplete2(result.text, localeForIncomplete) && vadProbFinal < 0.15) {
          log("onFinal trigger with VAD:", vadProbFinal.toFixed(2));
          startLlmEarly(result.text);
        } else if (vadProbFinal >= 0.15 && stateRef.current === "listening") {
          log("onFinal trigger blocked by VAD:", vadProbFinal.toFixed(2));
        }
        if (result.speechFinal) timeouts.scheduleSpeechFinalCommit();
      },
      onUtteranceEnd: () => {
        if (!isActiveRef.current) return;
        log("UtteranceEnd \u2192 delegating to TurnManager");
        timeouts.scheduleSpeechFinalCommit();
      },
      onSpeechStarted: () => {
        if (!isActiveRef.current) return;
        turn.feedVADEvent("started");
        if (stateRef.current === "speaking" || stateRef.current === "cooldown") {
          return;
        }
        const now = Date.now();
        if (now - speechStartedTimeRef.current < SPEECH_HYSTERESIS_MS) return;
        speechStartedTimeRef.current = now;
        if (stateRef.current === "vad_cooldown") {
          log("User resumed during VAD cooldown \u2192 back to listening");
          timeouts.clearVADCooldownTimeout();
          setState("listening");
          return;
        }
        if (stateRef.current === "listening") timeouts.cancelSpeechFinalCommit();
      },
      onError: (err) => {
        log("STT error:", err);
        setError(err.message);
        if (isActiveRef.current) {
          audio.cleanupAudio();
          stt.disconnect();
          setIsActive(false);
          setState("idle");
        }
      }
    };
  }
  const start = (0, import_react9.useCallback)(async () => {
    if (!isSupported) {
      setError("Voice not supported");
      return;
    }
    log("Starting...");
    setError(null);
    setTranscript("");
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    initTurnDetector().then(() => {
      const provider = getTurnDetectorProvider();
      if (provider) {
        log("Turn detector ready, setting on TurnManager:", provider.name);
        turn.setTurnDetector(provider);
      }
    }).catch((err) => {
      log("Turn detector init failed (using heuristic fallback):", err);
    });
    turn.createTurnManager();
    setIsActive(true);
    setState("connecting");
    try {
      const { worklet, stream } = await audio.setupAudio();
      await stt.connect(createSTTCallbacks(), sttLanguage);
      sileroVAD.startVAD(stream, {
        onSpeechProbability: (prob) => {
          turn.feedVADProbability(prob);
        },
        onSpeechStart: () => {
          turn.feedVADEvent("started");
        },
        onSpeechEnd: () => {
          turn.feedVADEvent("ended");
        },
        onError: (error2) => {
          console.log(
            "%c[VAD] RMS FALLBACK ACTIVE (Silero failed: " + error2.message + ")",
            "color: #f59e0b; font-weight: bold"
          );
        }
      }).catch((error2) => {
        console.log(
          "%c[VAD] RMS FALLBACK ACTIVE (Silero init failed)",
          "color: #f59e0b; font-weight: bold",
          error2
        );
      });
      worklet.port.onmessage = (e) => {
        if (e.data.type !== "audio") return;
        turn.feedRMS(e.data.isSpeaking ? 0.05 : 1e-3);
        if (e.data.speechProbability !== void 0) {
          turn.feedVADProbability(e.data.speechProbability);
        }
        if (stateRef.current === "listening" || stateRef.current === "triggered") {
          setUserSpeaking(e.data.isSpeaking);
          if (e.data.isSpeaking) timeouts.resetIdleTimeout();
          stt.sendAudio(e.data.data);
        }
      };
      timeouts.startIdleTimeout();
      timeouts.startMaxSessionTimeout();
      log("Started");
    } catch (err) {
      log("Start failed:", err);
      setError(err instanceof Error ? err.message : "Start failed");
      audio.cleanupAudio();
      stt.disconnect();
      setIsActive(false);
      setState("idle");
    }
  }, [
    isSupported,
    audio,
    stt,
    llm,
    turn,
    timeouts,
    log,
    sttLanguage,
    initTurnDetector,
    sileroVAD
  ]);
  const stop = (0, import_react9.useCallback)(() => {
    log("Stopping");
    timeouts.clearAllTimeouts();
    turn.destroyTurnManager();
    llm.abortLlm();
    sileroVAD.stopVAD();
    stt.disconnect();
    audio.cleanupAudio();
    setUserSpeaking(false);
    setIsActive(false);
    setState("idle");
    setTranscript("");
    llm.clearBuffer();
    finalTranscriptRef.current = "";
    lastInterimRef.current = "";
    maxUtteranceStartedRef.current = false;
  }, [timeouts, turn, llm, sileroVAD, stt, audio, log]);
  const interrupt = (0, import_react9.useCallback)(() => {
    log("Interrupt");
    llm.abortLlm();
    if (stateRef.current === "speaking") setState("listening");
  }, [llm, log]);
  const cleanupRef = (0, import_react9.useRef)({
    timeouts,
    turn,
    llm,
    audio,
    stt,
    sileroVAD
  });
  (0, import_react9.useEffect)(() => {
    cleanupRef.current = { timeouts, turn, llm, audio, stt, sileroVAD };
  }, [timeouts, turn, llm, audio, stt, sileroVAD]);
  (0, import_react9.useEffect)(
    () => () => {
      const {
        timeouts: t,
        turn: tu,
        llm: l,
        audio: a,
        stt: s,
        sileroVAD: sv
      } = cleanupRef.current;
      t.clearAllTimeouts();
      tu.destroyTurnManager();
      l.abortLlm();
      sv.stopVAD();
      a.cleanupAudio();
      s.disconnect();
    },
    []
  );
  const getInterruptionContext = (0, import_react9.useCallback)(() => {
    return interruptionContextRef.current;
  }, []);
  const clearInterruptionContext = (0, import_react9.useCallback)(() => {
    interruptionContextRef.current = null;
    log("Cleared interruption context");
  }, [log]);
  return {
    state,
    isActive,
    isSupported,
    start,
    stop,
    interrupt,
    transcript,
    error,
    userSpeaking,
    handleStreamingStart,
    handleTTSSpeakingStart,
    handleStreamingEnd,
    // Interruption context (for barge-in awareness)
    getInterruptionContext,
    clearInterruptionContext
  };
}

// src/react/VoiceButton.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var DEFAULT_LABELS = {
  idle: "\u{1F3A4} Start Voice",
  connecting: "Connecting...",
  listening: "\u{1F3A4} Listening...",
  vad_cooldown: "\u{1F3A4} Processing...",
  triggered: "\u{1F4AD} Thinking...",
  streaming: "\u{1F4AD} Responding...",
  processing: "\u{1F4AD} Processing...",
  speaking: "\u{1F50A} Speaking...",
  cooldown: "\u{1F50A} Finishing..."
};
function VoiceButton({
  className,
  labels,
  children,
  disabled,
  ...voiceOptions
}) {
  const voice = useVoiceKit(voiceOptions);
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };
  if (children) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: children({
      state: voice.state,
      isActive: voice.isActive,
      start: voice.start,
      stop: voice.stop
    }) });
  }
  const handleClick = () => {
    if (voice.isActive) {
      voice.stop();
    } else {
      voice.start();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      onClick: handleClick,
      disabled: disabled || voice.state === "connecting",
      className,
      "aria-label": voice.isActive ? "Stop voice conversation" : "Start voice conversation",
      children: mergedLabels[voice.state]
    }
  );
}
var VoiceButton_default = VoiceButton;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_SESSION_MS,
  DEFAULT_SPEECH_FINAL_DELAY_MS,
  MAX_UTTERANCE_MS,
  SILENCE_FALLBACK_MS,
  SPEECH_HYSTERESIS_MS,
  STREAMING_SAFETY_TIMEOUT_MS,
  TRIGGERED_TIMEOUT_MS,
  VAD_COOLDOWN_MS,
  VoiceButton,
  VoiceButtonDefault,
  createTurnDetector,
  useAudioSetup,
  useLlmIntegration,
  useSTTConnection,
  useSileroVAD,
  useTurnCoordination,
  useTurnDetector,
  useVoiceConversation,
  useVoiceKit,
  useVoiceKitDefault,
  useVoiceTimeouts
});
