/**
 * Language Detector Port
 * Abstract interface for language detection
 *
 * Used by TurnManager to detect language when locale="auto"
 * and adapt semantic patterns + TTS voice accordingly.
 */

import type { Locale } from "../types/config";
import { DEFAULT_BASE_URL } from "../types/config";

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** Detected language ISO 639-1 code (en, fr, de, es, etc.) */
  lang: string;
  /** Detection confidence 0-1 */
  confidence: number;
}

/**
 * Configuration for language detector
 */
export interface LanguageDetectorConfig {
  /** API base URL @default "https://kond.studio/api/voice/v1" */
  baseUrl?: string;
  /** VoiceKit API key (vk_xxx) */
  apiKey?: string;
  /** JWT token for authentication (alternative to apiKey) */
  token?: string;
  /** Request timeout (ms) @default 2000 */
  timeoutMs?: number;
  /** Minimum confidence threshold to accept detection @default 0.8 */
  confidenceThreshold?: number;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Language Detector Provider Interface
 *
 * Implementations:
 * - KondLanguageDetector: Remote detection via KOND API → Lingua service
 * - MockLanguageDetector: For testing
 */
export interface LanguageDetectorPort {
  /** Provider name for logging */
  readonly name: string;

  /**
   * Initialize the detector (if needed)
   */
  init(): Promise<void>;

  /**
   * Detect language of text
   * Returns the detected language and confidence score
   */
  detect(text: string): Promise<LanguageDetectionResult>;

  /**
   * Get the current detected locale (for use by TurnManager)
   * Returns null if no detection has been made yet
   */
  getCurrentLocale(): Locale | null;

  /**
   * Reset state
   */
  reset(): void;

  /**
   * Cleanup resources
   */
  destroy(): void;
}

/**
 * Supported languages for detection
 * Maps ISO 639-1 codes to Locale type
 */
export const SUPPORTED_LOCALES: Record<string, Locale> = {
  en: "en",
  fr: "fr",
  // Other languages fall back to "multi" mode
};

/**
 * Convert detected language to VoiceKit Locale
 * Only "en" and "fr" are supported as single-language modes
 * Other languages use "multi" mode
 */
export function languageToLocale(lang: string): Locale {
  return SUPPORTED_LOCALES[lang] || "multi";
}

/**
 * Default configuration
 */
export const DEFAULT_LANGUAGE_DETECTOR_CONFIG: Required<
  Omit<LanguageDetectorConfig, "apiKey" | "token">
> = {
  baseUrl: DEFAULT_BASE_URL,
  timeoutMs: 2000,
  confidenceThreshold: 0.8,
  debug: false,
};
