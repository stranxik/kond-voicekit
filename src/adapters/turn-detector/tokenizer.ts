/**
 * BPE Tokenizer for Turn Detection
 *
 * Implements Byte-Pair Encoding (BPE) tokenization compatible with
 * the LiveKit turn-detector model's tokenizer (based on SmolLM2).
 *
 * This tokenizer:
 * 1. Normalizes text (Unicode NFC normalization)
 * 2. Applies pre-tokenization (word splitting with special handling)
 * 3. Encodes using BPE merges from the vocabulary
 * 4. Adds special tokens for the chat template
 */

/**
 * Tokenizer configuration loaded from tokenizer.json
 */
export interface TokenizerConfig {
  /** Token to ID mapping */
  vocab: Record<string, number>;
  /** BPE merge rules as "token1 token2" strings */
  merges: string[];
  /** Special tokens mapping */
  added_tokens?: Array<{
    id: number;
    content: string;
    single_word: boolean;
    lstrip: boolean;
    rstrip: boolean;
    normalized: boolean;
    special: boolean;
  }>;
  /** Model type info */
  model?: {
    type?: string;
    unk_token?: string;
    byte_fallback?: boolean;
  };
}

/**
 * Simplified tokenizer config for our use case
 */
interface InternalConfig {
  vocab: Map<string, number>;
  reverseVocab: Map<number, string>;
  merges: Map<string, string>;
  specialTokens: Map<string, number>;
  unkToken: string;
  unkTokenId: number;
}

/**
 * BPE Tokenizer
 *
 * Encodes text into token IDs for the turn-detector ONNX model.
 */
export class BPETokenizer {
  private config: InternalConfig;
  private initialized = false;

  // Special tokens for chat template
  private readonly BOS_TOKEN = "<|im_start|>";
  private readonly EOS_TOKEN = "<|im_end|>";
  private readonly PAD_TOKEN = "<|endoftext|>";

  constructor(tokenizerConfig: TokenizerConfig) {
    this.config = this.parseConfig(tokenizerConfig);
    this.initialized = true;
  }

  /**
   * Parse tokenizer config into internal format
   */
  private parseConfig(config: TokenizerConfig): InternalConfig {
    // Build vocab maps
    const vocab = new Map<string, number>();
    const reverseVocab = new Map<number, string>();

    for (const [token, id] of Object.entries(config.vocab)) {
      vocab.set(token, id);
      reverseVocab.set(id, token);
    }

    // Build merge map: "token1 token2" -> "token1token2"
    const merges = new Map<string, string>();
    for (const merge of config.merges) {
      const [a, b] = merge.split(" ");
      if (a && b) {
        merges.set(merge, a + b);
      }
    }

    // Extract special tokens
    const specialTokens = new Map<string, number>();
    if (config.added_tokens) {
      for (const token of config.added_tokens) {
        if (token.special) {
          specialTokens.set(token.content, token.id);
          // Also add to main vocab if not present
          if (!vocab.has(token.content)) {
            vocab.set(token.content, token.id);
            reverseVocab.set(token.id, token.content);
          }
        }
      }
    }

    // Find UNK token
    const unkToken = config.model?.unk_token || "<unk>";
    const unkTokenId = vocab.get(unkToken) ?? 0;

    return {
      vocab,
      reverseVocab,
      merges,
      specialTokens,
      unkToken,
      unkTokenId,
    };
  }

  /**
   * Encode text to token IDs
   *
   * @param text - Text to encode
   * @param addSpecialTokens - Whether to add BOS/EOS tokens
   * @returns Array of token IDs
   */
  encode(text: string, addSpecialTokens = false): number[] {
    if (!this.initialized) {
      throw new Error("Tokenizer not initialized");
    }

    // Normalize text
    const normalized = this.normalize(text);

    // Pre-tokenize into words
    const words = this.preTokenize(normalized);

    // Encode each word
    const tokens: number[] = [];

    if (addSpecialTokens) {
      const bosId = this.config.specialTokens.get(this.BOS_TOKEN);
      if (bosId !== undefined) {
        tokens.push(bosId);
      }
    }

    for (const word of words) {
      const wordTokens = this.encodeWord(word);
      tokens.push(...wordTokens);
    }

    if (addSpecialTokens) {
      const eosId = this.config.specialTokens.get(this.EOS_TOKEN);
      if (eosId !== undefined) {
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
  encodeForTurnDetection(
    transcript: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>
  ): number[] {
    // Build the prompt
    let prompt = "";

    // Add history if provided
    if (history && history.length > 0) {
      for (const turn of history) {
        prompt += `${turn.role}: ${turn.content}\n`;
      }
    }

    // Add current transcript
    prompt += `user: ${transcript}`;

    // Wrap in chat template
    const fullPrompt = `${this.BOS_TOKEN}user\n${prompt}${this.EOS_TOKEN}`;

    // Encode without adding extra special tokens (they're in the prompt)
    return this.encode(fullPrompt, false);
  }

  /**
   * Decode token IDs back to text
   *
   * @param ids - Token IDs
   * @returns Decoded text
   */
  decode(ids: number[]): string {
    if (!this.initialized) {
      throw new Error("Tokenizer not initialized");
    }

    const tokens: string[] = [];
    for (const id of ids) {
      const token = this.config.reverseVocab.get(id);
      if (token !== undefined) {
        tokens.push(token);
      }
    }

    // Join and handle GPT-style spacing
    return this.postProcess(tokens.join(""));
  }

  /**
   * Get vocabulary size
   */
  get vocabSize(): number {
    return this.config.vocab.size;
  }

  /**
   * Get token ID for a specific token
   */
  getTokenId(token: string): number | undefined {
    return this.config.vocab.get(token);
  }

  // =========================================================================
  // Internal methods
  // =========================================================================

  /**
   * Normalize text (Unicode NFC)
   */
  private normalize(text: string): string {
    // Unicode NFC normalization
    return text.normalize("NFC");
  }

  /**
   * Pre-tokenize: split text into words
   * Uses GPT-2 style regex pre-tokenization
   */
  private preTokenize(text: string): string[] {
    // GPT-2 style pre-tokenization pattern
    // Handles contractions, punctuation, numbers, and spaces
    const pattern = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
    const matches = text.match(pattern);
    return matches || [];
  }

  /**
   * Encode a single word using BPE
   */
  private encodeWord(word: string): number[] {
    // Check if the whole word is in vocab (common for short words)
    if (this.config.vocab.has(word)) {
      return [this.config.vocab.get(word)!];
    }

    // Check for special tokens
    if (this.config.specialTokens.has(word)) {
      return [this.config.specialTokens.get(word)!];
    }

    // Split word into characters for BPE
    let tokens = this.splitToChars(word);

    // Apply BPE merges
    tokens = this.applyBPE(tokens);

    // Convert tokens to IDs
    const ids: number[] = [];
    for (const token of tokens) {
      const id = this.config.vocab.get(token);
      if (id !== undefined) {
        ids.push(id);
      } else {
        // Fall back to byte encoding for unknown tokens
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
  private splitToChars(word: string): string[] {
    // For most tokenizers, we need to handle the leading space specially
    // and convert to the byte representation
    const chars: string[] = [];
    for (const char of word) {
      chars.push(char);
    }
    return chars;
  }

  /**
   * Apply BPE merges iteratively
   */
  private applyBPE(tokens: string[]): string[] {
    if (tokens.length <= 1) {
      return tokens;
    }

    // Iteratively apply the highest-priority merge
    let iteration = 0;
    const maxIterations = 1000; // Safety limit

    while (iteration < maxIterations) {
      // Find the best merge (lowest rank = highest priority)
      let bestMergeIdx = -1;
      let bestMergeKey = "";

      for (let i = 0; i < tokens.length - 1; i++) {
        const pair = `${tokens[i]} ${tokens[i + 1]}`;
        if (this.config.merges.has(pair)) {
          // First merge found is highest priority (merges are ordered)
          if (bestMergeIdx === -1) {
            bestMergeIdx = i;
            bestMergeKey = pair;
          }
        }
      }

      // No more merges possible
      if (bestMergeIdx === -1) {
        break;
      }

      // Apply the merge
      const merged = this.config.merges.get(bestMergeKey)!;
      tokens = [
        ...tokens.slice(0, bestMergeIdx),
        merged,
        ...tokens.slice(bestMergeIdx + 2),
      ];

      iteration++;
    }

    return tokens;
  }

  /**
   * Encode unknown characters as byte tokens
   * Used as fallback for characters not in vocabulary
   */
  private encodeToBytes(text: string): number[] {
    const ids: number[] = [];
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    for (const byte of bytes) {
      // Look for byte token like <0x00> through <0xFF>
      const byteToken = `<0x${byte.toString(16).toUpperCase().padStart(2, "0")}>`;
      const id = this.config.vocab.get(byteToken);
      if (id !== undefined) {
        ids.push(id);
      } else {
        // Last resort: UNK token
        ids.push(this.config.unkTokenId);
      }
    }

    return ids;
  }

  /**
   * Post-process decoded text
   * Handles GPT-style spacing markers
   */
  private postProcess(text: string): string {
    // Handle common tokenizer spacing patterns
    // GPT-2/GPT-J use Ġ for space at word start
    return text
      .replace(/Ġ/g, " ")
      .replace(/Ċ/g, "\n")
      .trim();
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
  static async fromUrl(url: string): Promise<BPETokenizer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load tokenizer: ${response.status} ${response.statusText}`);
    }

    const config = await response.json() as TokenizerConfig;
    return new BPETokenizer(config);
  }

  /**
   * Create tokenizer from config object
   *
   * @param config - Tokenizer configuration
   * @returns Initialized tokenizer
   */
  static fromConfig(config: TokenizerConfig): BPETokenizer {
    return new BPETokenizer(config);
  }
}
