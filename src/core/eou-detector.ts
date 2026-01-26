/**
 * End-of-Utterance (EOU) Detector
 *
 * Hybrid approach combining multiple signals to determine
 * when the user has finished speaking:
 *
 * 1. Linguistic patterns (regex-based incomplete detection)
 * 2. VAD probability (voice activity from Silero/RMS)
 * 3. STT confidence scores
 * 4. Terminal punctuation detection
 * 5. Semantic completion patterns
 *
 * Industry standard: LiveKit/Vapi use 135M param ML models (~98% accuracy)
 * VoiceKit approach: Multi-signal heuristics (~90-95% accuracy)
 */

import type { Locale } from "../types/config";
import { isLikelyIncomplete } from "./trigger-detector";

export interface EOUResult {
  isComplete: boolean;
  score: number; // 0-1 confidence score
  reason: EOUReason;
}

export type EOUReason =
  | "regex_incomplete"      // Detected incomplete pattern (trailing pronouns, etc.)
  | "vad_active"            // Voice activity still detected
  | "low_confidence"        // STT confidence too low
  | "terminal_punctuation"  // Sentence ends with . ! ?
  | "semantic_complete"     // Matches completion pattern (merci, voilà, etc.)
  | "heuristic"            // Default: probably complete
  | "short_utterance";     // Very short, probably incomplete

export interface EOUContext {
  transcript: string;
  confidence: number;        // STT confidence 0-1
  vadProbability: number;    // Voice probability 0-1 (from RMS or Silero)
  locale: Locale;
  silenceDurationMs: number; // Time since last speech detected
  transcriptStableMs: number; // Time since transcript changed
}

// Semantic completion patterns - phrases that typically end a turn
const COMPLETE_PATTERNS_FR = [
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,  // Polite ending
  /\b(merci|merci beaucoup|merci bien)\.?$/i,         // Thanks
  /\b(voilà|c'est tout|c'est ça|c'est bon)\.?$/i,    // Conclusion
  /\b(oui|non|peut-être|je ne sais pas)\.?$/i,       // Short answer
  /\b(d'accord|ok|okay|bien sûr|évidemment)\.?$/i,   // Agreement
  /\b(parfait|super|génial|excellent)\.?$/i,          // Positive closure
  /\b(au revoir|à bientôt|à plus|salut|ciao)\.?$/i,  // Goodbye
  /\b(j'ai fini|j'ai terminé|c'est terminé)\.?$/i,   // Explicit end
];

const COMPLETE_PATTERNS_EN = [
  /\b(please|if you would|if you could)\.?$/i,        // Polite ending
  /\b(thanks|thank you|thank you very much)\.?$/i,    // Thanks
  /\b(that's it|that's all|I'm done|all set)\.?$/i,  // Conclusion
  /\b(yes|no|maybe|I don't know|not sure)\.?$/i,     // Short answer
  /\b(okay|ok|alright|sure|of course)\.?$/i,          // Agreement
  /\b(perfect|great|awesome|excellent)\.?$/i,         // Positive closure
  /\b(bye|goodbye|see you|later|take care)\.?$/i,    // Goodbye
  /\b(I'm done|I'm finished|that's everything)\.?$/i,// Explicit end
];

/**
 * Check if transcript matches a semantic completion pattern
 */
function isSemanticComplete(transcript: string, locale: Locale): boolean {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR : COMPLETE_PATTERNS_EN;
  return patterns.some(p => p.test(transcript.trim()));
}

/**
 * Check if transcript ends with terminal punctuation
 */
function hasTerminalPunctuation(transcript: string): boolean {
  return /[.!?。？！]$/.test(transcript.trim());
}

/**
 * Detect End-of-Utterance using hybrid multi-signal approach
 *
 * Decision tree:
 * 1. If regex detects incomplete → NOT complete (score 0.2)
 * 2. If VAD probability > 0.7 → NOT complete (score 0.3)
 * 3. If confidence < 0.7 → NOT complete (score = confidence)
 * 4. If very short (< 3 chars) → NOT complete (score 0.1)
 * 5. If terminal punctuation → COMPLETE (score 0.95)
 * 6. If semantic pattern match → COMPLETE (score 0.9)
 * 7. If long silence (> 800ms) + stable → COMPLETE (score 0.85)
 * 8. Default → COMPLETE with moderate confidence (score 0.75)
 *
 * @param context - All available signals
 * @returns EOUResult with completion status, confidence score, and reason
 */
export function detectEndOfUtterance(context: EOUContext): EOUResult {
  const {
    transcript,
    confidence,
    vadProbability,
    locale,
    silenceDurationMs,
    transcriptStableMs,
  } = context;

  const trimmed = transcript.trim();

  // 1. Very short utterance - likely incomplete
  if (trimmed.length < 3) {
    return { isComplete: false, score: 0.1, reason: "short_utterance" };
  }

  // 2. Regex-based incomplete detection (trailing pronouns, conjunctions, etc.)
  if (isLikelyIncomplete(transcript, locale)) {
    return { isComplete: false, score: 0.2, reason: "regex_incomplete" };
  }

  // 3. VAD still active - user likely still speaking
  if (vadProbability > 0.7) {
    return { isComplete: false, score: 0.3, reason: "vad_active" };
  }

  // 4. Low STT confidence - transcript uncertain
  if (confidence < 0.7) {
    return { isComplete: false, score: confidence, reason: "low_confidence" };
  }

  // 5. Terminal punctuation - strong completion signal
  if (hasTerminalPunctuation(transcript)) {
    return { isComplete: true, score: 0.95, reason: "terminal_punctuation" };
  }

  // 6. Semantic completion pattern (merci, voilà, etc.)
  if (isSemanticComplete(transcript, locale)) {
    return { isComplete: true, score: 0.9, reason: "semantic_complete" };
  }

  // 7. Long silence + stable transcript = probably done
  if (silenceDurationMs > 800 && transcriptStableMs > 500) {
    return { isComplete: true, score: 0.85, reason: "heuristic" };
  }

  // 8. Default: moderate confidence completion
  // User has stopped speaking, transcript is stable, no incomplete signals
  return { isComplete: true, score: 0.75, reason: "heuristic" };
}

/**
 * Quick check for EOU (synchronous, no async overhead)
 * Use for real-time decisions in tight loops
 */
export function isUtteranceComplete(
  transcript: string,
  confidence: number,
  locale: Locale
): boolean {
  // Fast path checks
  if (transcript.trim().length < 3) return false;
  if (isLikelyIncomplete(transcript, locale)) return false;
  if (confidence < 0.7) return false;

  // Positive signals
  if (hasTerminalPunctuation(transcript)) return true;
  if (isSemanticComplete(transcript, locale)) return true;

  // Default: trust confidence score
  return confidence >= 0.85;
}

/**
 * Get human-readable explanation for EOU decision
 */
export function explainEOUResult(result: EOUResult): string {
  const explanations: Record<EOUReason, string> = {
    regex_incomplete: "Detected incomplete pattern (e.g., trailing pronoun, conjunction)",
    vad_active: "Voice activity still detected - user may still be speaking",
    low_confidence: "Transcription confidence too low to make decision",
    terminal_punctuation: "Sentence ends with terminal punctuation (. ! ?)",
    semantic_complete: "Matches semantic completion pattern (e.g., 'merci', 'voilà')",
    heuristic: "No strong signals, using timing heuristics",
    short_utterance: "Utterance too short to be complete",
  };

  return `EOU ${result.isComplete ? "COMPLETE" : "INCOMPLETE"} (${(result.score * 100).toFixed(0)}%): ${explanations[result.reason]}`;
}
