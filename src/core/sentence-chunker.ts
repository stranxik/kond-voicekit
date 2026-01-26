/**
 * Sentence Chunker - Robust sentence boundary detection for TTS
 * Handles edge cases: abbreviations, numbers, URLs, quotes, etc.
 */

// ============================================
// CONFIGURATION
// ============================================

const CHUNK_CONFIG = {
  /** Minimum chars before emitting a chunk (avoid micro-chunks like "Ok.") */
  MIN_LENGTH: 25,
  /** Maximum chars before forcing a split (avoid endless sentences) */
  MAX_LENGTH: 200,
  /** Ideal chunk length for natural speech rhythm */
  IDEAL_LENGTH: 80,
};

// ============================================
// ABBREVIATIONS (French + English)
// ============================================

/** Common abbreviations that end with a period but aren't sentence endings */
const ABBREVIATIONS = new Set([
  // Titles
  "m", "mme", "mlle", "mr", "mrs", "ms", "dr", "pr", "prof", "sr", "jr",
  // Common French
  "etc", "ex", "cf", "vs", "env", "vol", "éd", "dir", "trad", "coll",
  "min", "max", "approx", "réf", "fig", "ch", "sect", "art", "al",
  // Time & dates
  "av", "apr", "janv", "févr", "avr", "juil", "sept", "oct", "nov", "déc",
  // Measurements
  "cm", "mm", "km", "kg", "mg", "ml", "dl", "cl",
  // Numbers
  "no", "n°", "p", "pp", "t", "vol",
  // Organizations
  "inc", "ltd", "co", "corp", "sarl", "sa", "sas",
  // Common English
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "ave", "blvd",
  "dept", "est", "govt", "misc", "no", "rev", "tel", "vs",
]);

/** Check if a word is an abbreviation */
function isAbbreviation(word: string): boolean {
  const normalized = word.toLowerCase().replace(/\.$/, "");
  return ABBREVIATIONS.has(normalized);
}

// ============================================
// EDGE CASE DETECTION
// ============================================

/** Check if period is part of a number (3.14, 1.000, etc.) */
function isPeriodInNumber(text: string, periodIndex: number): boolean {
  if (periodIndex === 0 || periodIndex >= text.length - 1) return false;

  const before = text[periodIndex - 1];
  const after = text[periodIndex + 1];

  // Check if surrounded by digits: "3.14"
  if (/\d/.test(before) && /\d/.test(after)) return true;

  // Check for thousand separator: "1.000"
  if (/\d/.test(before) && /\d{3}/.test(text.slice(periodIndex + 1))) return true;

  return false;
}

/** Check if period is part of a URL or email */
function isPeriodInUrlOrEmail(text: string, periodIndex: number): boolean {
  // Look for URL patterns around the period
  const context = text.slice(Math.max(0, periodIndex - 30), periodIndex + 30);

  // URL indicators
  if (/https?:\/\//.test(context)) return true;
  if (/www\./.test(context)) return true;

  // Email pattern
  if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(context)) return true;

  // Domain extensions
  const afterPeriod = text.slice(periodIndex + 1, periodIndex + 10).toLowerCase();
  const commonTLDs = ["com", "fr", "org", "net", "io", "co", "dev", "app", "ai"];
  if (commonTLDs.some(tld => afterPeriod.startsWith(tld))) {
    // Check if it looks like a domain (no space before)
    const beforePeriod = text.slice(Math.max(0, periodIndex - 20), periodIndex);
    if (!/\s$/.test(beforePeriod)) return true;
  }

  return false;
}

/** Check if we're inside quotes or parentheses */
function isInsideQuotesOrParens(text: string, index: number): boolean {
  const before = text.slice(0, index);

  // Count unmatched opening brackets
  const openParens = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
  const openBrackets = (before.match(/\[/g) || []).length - (before.match(/\]/g) || []).length;

  // Count unmatched quotes (simplified - just check if odd number)
  const doubleQuotes = (before.match(/"/g) || []).length;
  const frenchQuotes = (before.match(/«/g) || []).length - (before.match(/»/g) || []).length;

  return openParens > 0 || openBrackets > 0 || doubleQuotes % 2 === 1 || frenchQuotes > 0;
}

/** Get the word before a period */
function getWordBeforePeriod(text: string, periodIndex: number): string {
  const before = text.slice(0, periodIndex);
  const match = before.match(/(\S+)$/);
  return match ? match[1] : "";
}

// ============================================
// MAIN CHUNKING LOGIC
// ============================================

/** Sentence ending punctuation */
const SENTENCE_ENDERS = [".", "!", "?", "…"];

/** Secondary break points (for long sentences) */
const SECONDARY_BREAKS = [":", ";", "—", "–", " - "];

/**
 * Find the next valid sentence boundary
 * Returns the index after the boundary, or -1 if none found
 */
function findSentenceBoundary(text: string, startFrom: number = 0): number {
  for (let i = startFrom; i < text.length; i++) {
    const char = text[i];

    // Check for sentence-ending punctuation
    if (SENTENCE_ENDERS.includes(char)) {
      // Handle ellipsis (...)
      if (char === "." && text.slice(i, i + 3) === "...") {
        // Ellipsis - check if followed by space and capital
        const afterEllipsis = text.slice(i + 3).trimStart();
        if (afterEllipsis && /^[A-ZÀ-Ü]/.test(afterEllipsis)) {
          return i + 3;
        }
        continue;
      }

      // Skip if period is in a number
      if (char === "." && isPeriodInNumber(text, i)) continue;

      // Skip if period is in URL/email
      if (char === "." && isPeriodInUrlOrEmail(text, i)) continue;

      // Skip if inside quotes/parens
      if (isInsideQuotesOrParens(text, i)) continue;

      // Skip abbreviations
      if (char === ".") {
        const wordBefore = getWordBeforePeriod(text, i);
        if (isAbbreviation(wordBefore)) continue;
      }

      // Check what comes after
      const after = text.slice(i + 1);

      // Must be followed by space(s) then capital letter, or end of text
      if (!after.trim()) {
        // End of text - valid boundary
        return i + 1;
      }

      const trimmedAfter = after.trimStart();
      const spaceCount = after.length - trimmedAfter.length;

      // Need at least one space
      if (spaceCount === 0) continue;

      // Check for capital letter or number starting next sentence
      if (/^[A-ZÀ-Ü0-9«"]/.test(trimmedAfter)) {
        return i + 1 + spaceCount;
      }

      // For ! and ?, be more lenient (emotional text often continues lowercase)
      if ((char === "!" || char === "?") && spaceCount >= 1) {
        return i + 1 + spaceCount;
      }
    }
  }

  return -1;
}

/**
 * Find a secondary break point for very long sentences
 */
function findSecondaryBreak(text: string, afterIndex: number): number {
  // Look for : ; — in the latter half
  const searchStart = Math.max(afterIndex, Math.floor(text.length * 0.4));

  for (let i = searchStart; i < text.length; i++) {
    const char = text[i];

    if (char === ":" || char === ";") {
      const after = text.slice(i + 1);
      if (after.trimStart().length > 0) {
        return i + 1;
      }
    }

    // Em dash
    if (text.slice(i, i + 2) === " —" || text.slice(i, i + 3) === " – ") {
      return i;
    }
  }

  // Last resort: find a comma in the middle-to-late portion
  const commaSearch = text.slice(Math.floor(text.length * 0.5));
  const commaIndex = commaSearch.indexOf(", ");
  if (commaIndex !== -1) {
    return Math.floor(text.length * 0.5) + commaIndex + 2;
  }

  return -1;
}

/**
 * Sentence boundary detection for streaming text
 * Returns [completeSentences[], remainingIncomplete]
 */
export function extractSentences(
  buffer: string,
  options?: {
    minLength?: number;
    maxLength?: number;
    forceFlush?: boolean;
  }
): [sentences: string[], remaining: string] {
  const minLen = options?.minLength ?? CHUNK_CONFIG.MIN_LENGTH;
  const maxLen = options?.maxLength ?? CHUNK_CONFIG.MAX_LENGTH;
  const forceFlush = options?.forceFlush ?? false;

  const sentences: string[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    // Find sentence boundary
    const boundaryIndex = findSentenceBoundary(remaining);

    if (boundaryIndex !== -1) {
      const sentence = remaining.slice(0, boundaryIndex).trim();

      // Check minimum length
      if (sentence.length >= minLen) {
        sentences.push(sentence);
        remaining = remaining.slice(boundaryIndex).trimStart();
        continue;
      }

      // Sentence too short - try to merge with next
      // But only if we have more content coming
      if (!forceFlush && remaining.slice(boundaryIndex).trim().length < minLen) {
        // Wait for more content
        break;
      }

      // Short sentence but we have more - emit anyway
      if (sentence.length > 0) {
        sentences.push(sentence);
        remaining = remaining.slice(boundaryIndex).trimStart();
        continue;
      }
    }

    // No boundary found - check if too long
    if (remaining.length > maxLen) {
      // Try secondary breaks
      const secondaryBreak = findSecondaryBreak(remaining, minLen);

      if (secondaryBreak !== -1 && secondaryBreak >= minLen) {
        const chunk = remaining.slice(0, secondaryBreak).trim();
        sentences.push(chunk);
        remaining = remaining.slice(secondaryBreak).trimStart();
        continue;
      }

      // Last resort: hard cut at maxLen, find last space
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

    // No boundary, not too long - wait for more content
    break;
  }

  // Force flush remaining if requested
  if (forceFlush && remaining.trim().length > 0) {
    sentences.push(remaining.trim());
    remaining = "";
  }

  return [sentences, remaining];
}

/**
 * Strip complete code blocks from text (```...```)
 * Returns [cleanedText, hasIncompleteBlock]
 */
function stripCodeBlocks(text: string): [string, boolean] {
  // First, remove all complete code blocks
  let cleaned = text.replace(/```[\w-]*[\s\S]*?```/g, "");

  // Check if there's an incomplete block (opening ``` without closing)
  const lastOpenBackticks = cleaned.lastIndexOf("```");
  if (lastOpenBackticks !== -1) {
    // Check if there's a closing after it
    const afterOpen = cleaned.slice(lastOpenBackticks + 3);
    if (!afterOpen.includes("```")) {
      // Incomplete block - remove everything from the opening ```
      cleaned = cleaned.slice(0, lastOpenBackticks);
      return [cleaned, true];
    }
  }

  return [cleaned, false];
}

/**
 * Create a sentence accumulator for streaming text
 * Buffers text and emits complete sentences
 *
 * For TTS: Automatically strips code blocks (```...```) which should be
 * displayed but not read aloud.
 */
export function createSentenceAccumulator(
  onSentence: (sentence: string) => void,
  options?: {
    minLength?: number;
    maxLength?: number;
  }
): {
  append: (text: string) => void;
  flush: () => void;
  reset: () => void;
  getBuffer: () => string;
} {
  let buffer = "";
  let codeBlockBuffer = ""; // Holds incomplete code blocks

  return {
    append: (text: string) => {
      // Add to main buffer
      buffer += text;

      // Strip complete code blocks and detect incomplete ones
      const [cleanedBuffer, hasIncomplete] = stripCodeBlocks(buffer);

      // If we have an incomplete code block, don't process yet
      // Wait for more text to complete the block
      if (hasIncomplete) {
        // Keep the original buffer to complete the code block later
        return;
      }

      // Work with the cleaned buffer (no code blocks)
      buffer = cleanedBuffer;

      // Extract complete sentences with config
      const [sentences, remaining] = extractSentences(buffer, {
        minLength: options?.minLength,
        maxLength: options?.maxLength,
      });

      // Emit each sentence
      for (const sentence of sentences) {
        // Double-check: skip if somehow still contains code block markers
        if (!sentence.includes("```")) {
          onSentence(sentence);
        }
      }

      // Keep incomplete part
      buffer = remaining;
    },

    flush: () => {
      // Strip any remaining code blocks before flushing
      const [cleanedBuffer] = stripCodeBlocks(buffer);

      // Force flush any remaining text
      if (cleanedBuffer.trim().length > 0) {
        const [sentences] = extractSentences(cleanedBuffer, {
          minLength: options?.minLength,
          maxLength: options?.maxLength,
          forceFlush: true,
        });

        for (const sentence of sentences) {
          // Skip if contains code block markers
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

    getBuffer: () => buffer,
  };
}

/**
 * Type for the sentence accumulator returned by createSentenceAccumulator
 */
export type SentenceAccumulator = ReturnType<typeof createSentenceAccumulator>;
