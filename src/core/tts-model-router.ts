/**
 * TTS Model Router - Turbo by Default
 *
 * Flash v2.5: ~75ms latency - DISABLED (causes word skipping issues)
 * Turbo v2.5: ~250-300ms latency, excellent quality - DEFAULT
 *
 * Flash was causing pronunciation issues (mots mâchés) even with
 * stability adjustments. Turbo provides reliable quality.
 */

export type TtsModel = "eleven_flash_v2_5" | "eleven_turbo_v2_5";

export interface TtsContext {
  /** Content importance level */
  importance?: "low" | "normal" | "high";
  /** Whether this is an explanation or instructional content */
  isExplanation?: boolean;
  /** Position in the response (0 = first sentence) */
  sentenceIndex?: number;
}

export interface TtsModelSelection {
  model: TtsModel;
  reason: string;
}

/**
 * Select the appropriate TTS model based on text content and context
 *
 * @param text The text to speak
 * @param context Optional context for selection
 * @returns The selected model with reason
 */
export function selectTtsModel(
  text: string,
  context?: TtsContext
): TtsModel {
  const { model } = selectTtsModelWithReason(text, context);
  return model;
}

/**
 * Select model with detailed reason (for logging/debugging)
 */
export function selectTtsModelWithReason(
  text: string,
  context?: TtsContext
): TtsModelSelection {
  // High importance content always gets Turbo
  if (context?.importance === "high") {
    return { model: "eleven_turbo_v2_5", reason: "high_importance" };
  }

  // Explicit explanation flag
  if (context?.isExplanation) {
    return { model: "eleven_turbo_v2_5", reason: "is_explanation" };
  }

  // Long text (> 300 chars) benefits from Turbo quality
  if (text.length > 300) {
    return { model: "eleven_turbo_v2_5", reason: "long_text" };
  }

  // Multiple sentences (3+) suggest complex content
  const sentenceCount = (text.match(/[.!?]+/g) || []).length;
  if (sentenceCount >= 3) {
    return { model: "eleven_turbo_v2_5", reason: "multiple_sentences" };
  }

  // Default: Turbo for quality (Flash caused word skipping)
  return { model: "eleven_turbo_v2_5", reason: "default_turbo" };
}

/**
 * Check if text is likely a short acknowledgment
 * (useful for analytics)
 */
export function isShortAcknowledgment(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // Common short responses
  const shortPatterns = [
    /^(ok|d'accord|oui|non|bien|parfait|super|merci|voilà|compris|entendu|exactement|absolument|c'est fait|c'est bon|je comprends)\.?$/i,
    /^(yes|no|sure|got it|okay|done|right|exactly|understood|perfect|thanks)\.?$/i,
  ];

  return shortPatterns.some((p) => p.test(trimmed)) || text.length < 30;
}
