/**
 * ONNX Turn Detector
 *
 * Local ML turn detection using ONNX runtime in the browser.
 * Uses the LiveKit turn-detector model (SmolLM2-135M based) for:
 * - End-of-turn prediction
 * - Semantic understanding of utterance completion
 *
 * Features:
 * - ~25-50ms inference latency (vs ~100-200ms cloud)
 * - IndexedDB caching (~100ms load after first download)
 * - Automatic fallback to heuristic on failure
 * - Works offline after initial model download
 *
 * @see https://github.com/livekit/agents for reference implementation
 */

import * as ort from "onnxruntime-web";
import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import { DEFAULT_TURN_DETECTOR_CONFIG } from "../../ports/turn-detector";
import { BPETokenizer } from "./tokenizer";
import { ModelCache } from "./model-cache";
import { HeuristicTurnDetector } from "./heuristic";
import { ONNX_DEFAULTS } from "../../config/defaults";

// ============================================================================
// Types
// ============================================================================

export interface OnnxTurnDetectorOptions extends TurnDetectorConfig {
  /** URL to the ONNX model file */
  modelUrl?: string;
  /** URL to the tokenizer.json file */
  tokenizerUrl?: string;
  /** Model version for cache invalidation */
  modelVersion?: string;
  /** Enable model caching in IndexedDB */
  enableCache?: boolean;
  /** ONNX execution provider */
  executionProvider?: "wasm" | "cpu";
  /** Probability threshold for EOT prediction */
  eotThreshold?: number;
  /** Maximum input sequence length */
  maxSeqLength?: number;
}

interface OnnxConfig {
  modelUrl: string;
  tokenizerUrl: string;
  modelVersion: string;
  enableCache: boolean;
  executionProvider: "wasm" | "cpu";
  eotThreshold: number;
  maxSeqLength: number;
}

// ============================================================================
// ONNX Turn Detector
// ============================================================================

/**
 * ONNX Turn Detector
 *
 * Runs the turn-detector model locally in the browser using ONNX runtime.
 * Automatically falls back to heuristic detection on init or predict failure.
 */
export class OnnxTurnDetector implements TurnDetectorProvider {
  readonly name = "onnx";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private onnxConfig: OnnxConfig;
  private session: ort.InferenceSession | null = null;
  private tokenizer: BPETokenizer | null = null;
  private modelCache: ModelCache;
  private heuristicFallback: HeuristicTurnDetector;
  private conversationHistory: ConversationTurn[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;

  constructor(options: OnnxTurnDetectorOptions = {}) {
    // Base turn detector config
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };

    // ONNX-specific config
    this.onnxConfig = {
      modelUrl: options.modelUrl || ONNX_DEFAULTS.modelUrl,
      tokenizerUrl: options.tokenizerUrl || ONNX_DEFAULTS.tokenizerUrl,
      modelVersion: options.modelVersion || ONNX_DEFAULTS.modelVersion,
      enableCache: options.enableCache ?? ONNX_DEFAULTS.enableCache,
      executionProvider: options.executionProvider || ONNX_DEFAULTS.executionProvider,
      eotThreshold: options.eotThreshold ?? ONNX_DEFAULTS.eotThreshold,
      maxSeqLength: options.maxSeqLength ?? ONNX_DEFAULTS.maxSeqLength,
    };

    // Initialize cache and fallback
    this.modelCache = new ModelCache();
    this.heuristicFallback = new HeuristicTurnDetector({
      ...options,
      debug: this.config.debug,
    });
  }

  /**
   * Initialize the ONNX session and tokenizer
   * Downloads and caches model on first load
   */
  async init(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.initialized) {
      return;
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Initializing...");
      }

      // Configure ONNX runtime
      ort.env.wasm.numThreads = 1; // Use single thread for predictable latency
      ort.env.wasm.simd = true;

      // Initialize model cache
      await this.modelCache.init();

      // Load tokenizer (small file, always fetch)
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Loading tokenizer...");
      }
      this.tokenizer = await BPETokenizer.fromUrl(this.onnxConfig.tokenizerUrl);

      // Try to load model from cache
      let modelBuffer = await this.modelCache.getModel(
        "turn-detector",
        this.onnxConfig.modelVersion
      );

      if (modelBuffer) {
        if (this.config.debug) {
          console.log("[OnnxTurnDetector] Loaded model from cache");
        }
      } else {
        // Download model
        if (this.config.debug) {
          console.log("[OnnxTurnDetector] Downloading model...");
        }

        const response = await fetch(this.onnxConfig.modelUrl);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status}`);
        }

        modelBuffer = await response.arrayBuffer();

        // Cache for next time
        if (this.onnxConfig.enableCache) {
          await this.modelCache.setModel("turn-detector", modelBuffer, {
            version: this.onnxConfig.modelVersion,
            sourceUrl: this.onnxConfig.modelUrl,
          });
        }

        if (this.config.debug) {
          console.log(
            `[OnnxTurnDetector] Downloaded model (${(modelBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`
          );
        }
      }

      // Create ONNX session
      if (this.config.debug) {
        console.log("[OnnxTurnDetector] Creating ONNX session...");
      }

      this.session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: [this.onnxConfig.executionProvider],
        graphOptimizationLevel: "all",
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
      // Initialize heuristic fallback
      await this.heuristicFallback.init();
    }
  }

  /**
   * Predict if the current utterance is complete
   */
  async predict(context: TurnContext): Promise<TurnPrediction> {
    // Ensure initialized
    if (!this.initialized && !this.initFailed) {
      await this.init();
    }

    // Use fallback if init failed or session not available
    if (this.initFailed || !this.session || !this.tokenizer) {
      return this.heuristicFallback.predict(context);
    }

    try {
      const startTime = performance.now();

      // Build input prompt
      const history = this.conversationHistory.map((t) => ({
        role: t.role,
        content: t.text,
      }));

      // Tokenize
      const tokenIds = this.tokenizer.encodeForTurnDetection(
        context.transcript,
        history
      );

      // Truncate if too long
      const truncatedIds = tokenIds.slice(-this.onnxConfig.maxSeqLength);

      // Create input tensor (int64 for most LLM models)
      const inputTensor = new ort.Tensor(
        "int64",
        BigInt64Array.from(truncatedIds.map(BigInt)),
        [1, truncatedIds.length]
      );

      // Create attention mask
      const attentionMask = new ort.Tensor(
        "int64",
        BigInt64Array.from(truncatedIds.map(() => BigInt(1))),
        [1, truncatedIds.length]
      );

      // Run inference
      const feeds: Record<string, ort.Tensor> = {
        input_ids: inputTensor,
        attention_mask: attentionMask,
      };

      const results = await this.session.run(feeds);

      // Parse output - model outputs logits for [CONTINUE, EOT]
      const logits = this.extractLogits(results);
      const probabilities = this.softmax(logits);
      const eotProbability = probabilities[1] ?? 0; // EOT is index 1

      const latencyMs = performance.now() - startTime;

      if (this.config.debug) {
        console.log(`[OnnxTurnDetector] Inference: ${latencyMs.toFixed(1)}ms`);
        console.log(`[OnnxTurnDetector] EOT probability: ${(eotProbability * 100).toFixed(1)}%`);
      }

      // Determine prediction
      const shouldCommit = eotProbability > this.onnxConfig.eotThreshold;

      return {
        shouldCommit,
        confidence: shouldCommit ? eotProbability : 1 - eotProbability,
        reason: shouldCommit ? "model_prediction" : "incomplete",
      };
    } catch (error) {
      console.warn("[OnnxTurnDetector] Inference failed:", error);
      // Fall back to heuristic
      return this.heuristicFallback.predict(context);
    }
  }

  /**
   * Add a completed turn to conversation history
   */
  addTurn(turn: ConversationTurn): void {
    this.conversationHistory.push(turn);
    // Keep only last N turns
    if (this.conversationHistory.length > (this.config.maxContextTurns || 4)) {
      this.conversationHistory.shift();
    }
    // Also update fallback
    this.heuristicFallback.addTurn(turn);
  }

  /**
   * Reset state
   */
  reset(): void {
    this.conversationHistory = [];
    this.heuristicFallback.reset();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
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
  private extractLogits(results: ort.InferenceSession.OnnxValueMapType): number[] {
    // Try common output names
    const outputNames = ["logits", "output", "probabilities"];
    let outputTensor: ort.Tensor | null = null;

    for (const name of outputNames) {
      if (results[name]) {
        outputTensor = results[name] as ort.Tensor;
        break;
      }
    }

    // Fall back to first output
    if (!outputTensor) {
      const keys = Object.keys(results);
      if (keys.length > 0) {
        outputTensor = results[keys[0]] as ort.Tensor;
      }
    }

    if (!outputTensor) {
      throw new Error("No output tensor found");
    }

    const data = outputTensor.data;

    // Handle different data types
    if (data instanceof Float32Array || data instanceof Float64Array) {
      // Get last token's logits (for causal LM, shape is [batch, seq_len, vocab])
      // We need the binary classification logits [CONTINUE, EOT]
      if (outputTensor.dims.length === 3) {
        // [batch, seq_len, 2] - get last position
        const seqLen = outputTensor.dims[1] as number;
        const vocabSize = outputTensor.dims[2] as number;
        const startIdx = (seqLen - 1) * vocabSize;
        return [data[startIdx] as number, data[startIdx + 1] as number];
      } else if (outputTensor.dims.length === 2) {
        // [batch, 2] - already the right shape
        return [data[0] as number, data[1] as number];
      }
    }

    // Default: return first two values
    return [Number(data[0]), Number(data[1])];
  }

  /**
   * Apply softmax to logits
   */
  private softmax(logits: number[]): number[] {
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
  get isUsingFallback(): boolean {
    return this.initFailed || !this.session;
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }
}

/**
 * Factory function
 */
export function createOnnxTurnDetector(
  options?: OnnxTurnDetectorOptions
): TurnDetectorProvider {
  return new OnnxTurnDetector(options);
}
