/**
 * Heuristic Turn Detector
 * Fallback adapter using regex patterns and timing heuristics
 *
 * Always available, no ML dependencies, ~1ms latency
 */

import type {
  TurnDetectorProvider,
  TurnPrediction,
  TurnContext,
  ConversationTurn,
  TurnDetectorConfig,
} from "../../ports/turn-detector";
import { DEFAULT_TURN_DETECTOR_CONFIG } from "../../ports/turn-detector";
import type { Locale } from "../../types/config";

// =============================================================================
// Backchannel Patterns
// =============================================================================

const BACKCHANNEL_FR = [
  /^(mm-?h?m+|hm+|uhm?)\.?$/i,
  /^(oui|ouais|ouep|ok|okay|d'accord|d'acc)\.?$/i,
  /^(entendu|compris|pigé|je vois)\.?$/i,
  /^(ah|ah bon|ah oui|ah d'accord)\.?$/i,
  /^(bien|très bien|parfait|super|génial)\.?$/i,
  /^(merci|thanks)\.?$/i,
];

const BACKCHANNEL_EN = [
  /^(mm-?h?m+|uh-?huh|hm+|uhm?)\.?$/i,
  /^(yeah|yep|yup|yes|ok|okay|sure|got it)\.?$/i,
  /^(i see|i understand|right|exactly|correct)\.?$/i,
  /^(ah|oh|oh i see|oh ok|oh okay)\.?$/i,
  /^(good|great|nice|perfect|awesome)\.?$/i,
  /^(thanks|thank you)\.?$/i,
];

// =============================================================================
// Incomplete Patterns
// =============================================================================

const INCOMPLETE_PATTERNS_FR = [
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
  /\b(qui|que|dont|où|lequel|laquelle|lesquels|lesquelles)\s*$/i,
];

const INCOMPLETE_PATTERNS_EN = [
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
  /\b(who|whom|whose|which|that|where|when)\s*$/i,
];

// =============================================================================
// Semantic Completion Patterns
// =============================================================================

const COMPLETE_PATTERNS_FR = [
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,
  /\b(merci|merci beaucoup|merci bien|je t'en prie|de rien)\.?$/i,
  /\b(voilà|c'est tout|c'est ça|c'est bon|ça y est|terminé)\.?$/i,
  /\b(oui|non|peut-être|je ne sais pas|aucune idée|pas du tout)\.?$/i,
  /\b(d'accord|ok|okay|bien sûr|évidemment|entendu|compris|très bien)\.?$/i,
  /\b(parfait|super|génial|excellent|nickel|top|impeccable)\.?$/i,
  /\b(au revoir|à bientôt|à plus|à plus tard|salut|ciao|bonne journée|bonne soirée)\.?$/i,
  /\b(j'ai fini|j'ai terminé|c'est terminé|c'est fait|fini|done)\.?$/i,
  /\b(stop|arrête|annule|continue|vas-y|go)\.?$/i,
];

const COMPLETE_PATTERNS_EN = [
  /\b(please|if you would|if you could|if you don't mind)\.?$/i,
  /\b(thanks|thank you|thank you very much|thanks a lot|appreciate it)\.?$/i,
  /\b(that's it|that's all|i'm done|all set|all good|we're good)\.?$/i,
  /\b(yes|no|maybe|i don't know|not sure|no idea|absolutely|definitely)\.?$/i,
  /\b(okay|ok|alright|sure|of course|understood|got it|sounds good)\.?$/i,
  /\b(perfect|great|awesome|excellent|wonderful|fantastic|nice)\.?$/i,
  /\b(bye|goodbye|see you|see you later|later|take care|have a good one)\.?$/i,
  /\b(i'm done|i'm finished|that's everything|finished|done|complete)\.?$/i,
  /\b(stop|cancel|continue|go ahead|proceed|let's go)\.?$/i,
];

// =============================================================================
// Helper Functions
// =============================================================================

function isBackchannel(
  transcript: string,
  confidence: number,
  locale: Locale
): boolean {
  const trimmed = transcript.trim().toLowerCase();
  const patterns = locale === "fr" ? BACKCHANNEL_FR : BACKCHANNEL_EN;

  return (
    patterns.some((p) => p.test(trimmed)) &&
    transcript.length < 25 &&
    confidence > 0.75
  );
}

function isLikelyIncomplete(transcript: string, locale: Locale): boolean {
  const patterns =
    locale === "fr" ? INCOMPLETE_PATTERNS_FR : INCOMPLETE_PATTERNS_EN;
  const trimmed = transcript.trim();

  if (trimmed.length < 3) return true;
  if (patterns.some((p) => p.test(trimmed))) return true;
  if (/\.{2,}$/.test(trimmed) || /…$/.test(trimmed)) return true;

  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const hasTerminalPunctuation = /[.!?。？！]$/.test(trimmed);

  // Trailing comma = definitely incomplete
  if (/,\s*$/.test(trimmed)) return true;

  // Single word without punctuation
  if (words.length === 1 && !hasTerminalPunctuation) {
    const completeCommands =
      locale === "fr"
        ? /^(stop|arrête|annule|cancel|non|no|oui|yes|ok|merci|bonjour|salut)$/i
        : /^(stop|cancel|no|yes|ok|thanks|hello|hi|bye)$/i;
    if (!completeCommands.test(trimmed)) return true;
  }

  return false;
}

function isSemanticComplete(transcript: string, locale: Locale): boolean {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR : COMPLETE_PATTERNS_EN;
  return patterns.some((p) => p.test(transcript.trim()));
}

function hasTerminalPunctuation(transcript: string): boolean {
  return /[.!?。？！]$/.test(transcript.trim());
}

// =============================================================================
// Heuristic Turn Detector Implementation
// =============================================================================

export interface HeuristicTurnDetectorOptions extends TurnDetectorConfig {
  /** Minimum silence duration for completion (ms) */
  minSilenceMs?: number;
  /** Minimum transcript stable time for completion (ms) */
  minStableMs?: number;
}

/**
 * Heuristic Turn Detector
 * Always available fallback using regex patterns
 */
export class HeuristicTurnDetector implements TurnDetectorProvider {
  readonly name = "heuristic";

  private config: Required<Omit<TurnDetectorConfig, "forceProvider">>;
  private options: HeuristicTurnDetectorOptions;
  private history: ConversationTurn[] = [];

  constructor(options: HeuristicTurnDetectorOptions = {}) {
    this.options = options;
    this.config = {
      ...DEFAULT_TURN_DETECTOR_CONFIG,
      ...options,
    };
  }

  async init(): Promise<void> {
    if (this.config.debug) {
      console.log("[HeuristicTurnDetector] Initialized");
    }
  }

  /**
   * Predict turn state using multi-signal heuristics
   */
  async predict(context: TurnContext): Promise<TurnPrediction> {
    const {
      transcript,
      sttConfidence,
      vadProbability,
      locale,
      silenceDurationMs,
      transcriptStableMs,
    } = context;

    const trimmed = transcript.trim();
    const minSilence = this.options.minSilenceMs ?? 800;
    const minStable = this.options.minStableMs ?? 500;

    // 1. Very short utterance
    if (trimmed.length < 3) {
      return {
        shouldCommit: false,
        confidence: 0.9,
        reason: "incomplete",
      };
    }

    // 2. Backchannel detection (if enabled)
    if (
      this.config.detectBackchannels &&
      isBackchannel(transcript, sttConfidence, locale)
    ) {
      return {
        shouldCommit: false,
        confidence: 0.85,
        reason: "backchannel",
      };
    }

    // 3. Incomplete pattern detection
    if (isLikelyIncomplete(transcript, locale)) {
      return {
        shouldCommit: false,
        confidence: 0.8,
        reason: "incomplete",
      };
    }

    // 4. VAD still active
    if (vadProbability > 0.7) {
      return {
        shouldCommit: false,
        confidence: 0.7,
        reason: "incomplete",
      };
    }

    // 5. Low STT confidence
    if (sttConfidence < this.config.confidenceThreshold) {
      return {
        shouldCommit: false,
        confidence: sttConfidence,
        reason: "incomplete",
      };
    }

    // 6. Terminal punctuation - strong completion signal
    if (hasTerminalPunctuation(transcript)) {
      return {
        shouldCommit: true,
        confidence: 0.95,
        reason: "semantic_complete",
      };
    }

    // 7. Semantic completion pattern
    if (isSemanticComplete(transcript, locale)) {
      return {
        shouldCommit: true,
        confidence: 0.9,
        reason: "semantic_complete",
      };
    }

    // 8. Long silence + stable transcript
    if (silenceDurationMs > minSilence && transcriptStableMs > minStable) {
      return {
        shouldCommit: true,
        confidence: 0.85,
        reason: "long_silence",
      };
    }

    // 9. Default: moderate confidence completion
    return {
      shouldCommit: true,
      confidence: 0.75,
      reason: "model_prediction",
    };
  }

  addTurn(turn: ConversationTurn): void {
    this.history.push(turn);
    if (this.history.length > (this.config.maxContextTurns || 4)) {
      this.history.shift();
    }
  }

  reset(): void {
    this.history = [];
  }

  destroy(): void {
    this.reset();
  }

  // Test helpers
  getHistory(): ConversationTurn[] {
    return [...this.history];
  }
}

/**
 * Factory function
 */
export function createHeuristicTurnDetector(
  options?: HeuristicTurnDetectorOptions
): TurnDetectorProvider {
  return new HeuristicTurnDetector(options);
}

// Re-export helper functions for testing
export { isBackchannel, isLikelyIncomplete, isSemanticComplete, hasTerminalPunctuation };
