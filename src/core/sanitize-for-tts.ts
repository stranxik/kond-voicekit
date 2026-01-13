/**
 * Sanitize text for TTS (Text-to-Speech)
 *
 * In voice conversation mode, the agent can generate visual blocks
 * (mermaid, cards, charts, etc.) that should be DISPLAYED but not READ aloud.
 *
 * This function strips those blocks and markdown formatting while keeping
 * the natural prose.
 */

/**
 * Remove all visual blocks, markdown syntax, and unreadable content from text
 * Handles: code blocks, markdown formatting, URLs, tables, etc.
 */
export function sanitizeForTTS(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // === PRONUNCIATION FIXES ===

  // 0. Fix "KOND" pronunciation: should sound like "conde" not "kondé"
  sanitized = sanitized.replace(/\bKOND\b/gi, "Conde");

  // === BLOCKS & CODE ===

  // 1. Remove all ```...``` blocks (any language tag or none)
  // Matches: ```anything...content...``` with or without newlines
  // Pattern handles: ```event\n{...}```, ```event{...}```, ```\n{...}```
  sanitized = sanitized.replace(/```[\w-]*[\s\S]*?```/g, "");

  // 2. Remove inline code blocks that might be long (like URLs)
  sanitized = sanitized.replace(/`[^`]{30,}`/g, "");

  // === LINKS & MEDIA ===

  // 3. Remove raw URLs (unreadable when spoken)
  sanitized = sanitized.replace(/https?:\/\/[^\s)>\]]+/g, "");

  // 4. Remove markdown image syntax ![alt](url)
  sanitized = sanitized.replace(/!\[[^\]]*\]\([^)]+\)/g, "");

  // 5. Remove markdown link URLs but keep text: [text](url) → text
  sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // === CUSTOM SYNTAX ===

  // 6. Clean up button syntax {{btn:Label|type:value}} → Label
  sanitized = sanitized.replace(/\{\{btn:([^|]+)\|[^}]+\}\}/g, "$1");

  // === MARKDOWN FORMATTING ===

  // 7. Remove bold markers: **text** → text, __text__ → text
  sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, "$1");
  sanitized = sanitized.replace(/__([^_]+)__/g, "$1");

  // 8. Remove italic markers: *text* → text, _text_ → text
  sanitized = sanitized.replace(/\*([^*]+)\*/g, "$1");
  sanitized = sanitized.replace(/_([^_]+)_/g, "$1");

  // 9. Remove heading markers (# at line start)
  sanitized = sanitized.replace(/^#{1,6}\s+/gm, "");

  // 10. Remove list markers (- or * at line start, numbered lists)
  sanitized = sanitized.replace(/^[\s]*[-*]\s+/gm, "");
  sanitized = sanitized.replace(/^[\s]*\d+\.\s+/gm, "");

  // 11. Remove blockquote markers (> at line start)
  sanitized = sanitized.replace(/^>\s*/gm, "");

  // 12. Remove horizontal rules (---, ***, ___)
  sanitized = sanitized.replace(/^[-*_]{3,}$/gm, "");

  // 13. Remove table syntax (pipes → spaces, separator rows removed)
  sanitized = sanitized.replace(/\|/g, " ");
  sanitized = sanitized.replace(/^[\s]*[-:]+[\s]*$/gm, "");

  // 14. Remove remaining short inline code backticks: `code` → code
  sanitized = sanitized.replace(/`([^`]+)`/g, "$1");

  // === CLEANUP ===

  // 15. Clean up excessive whitespace (multiple newlines → single space)
  sanitized = sanitized.replace(/\n{2,}/g, " ");
  sanitized = sanitized.replace(/\s{2,}/g, " ");

  // 16. Trim
  return sanitized.trim();
}

/**
 * Check if text has visual blocks that will be stripped
 * Useful to know if there's visual content to display
 */
export function hasVisualBlocks(text: string): boolean {
  if (!text) return false;
  // Match blocks with or without newlines after the tag
  return /```[\w-]*[\s\S]*?```/.test(text);
}
