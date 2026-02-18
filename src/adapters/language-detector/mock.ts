/**
 * Mock Language Detector
 *
 * For testing purposes.
 */

import type {
  LanguageDetectorPort,
  LanguageDetectionResult,
} from "../../ports/language-detector";
import { languageToLocale } from "../../ports/language-detector";
import type { Locale } from "../../types/config";

/**
 * Mock Language Detector Options
 */
export interface MockLanguageDetectorOptions {
  /** Fixed language to return */
  language?: string;
  /** Fixed confidence to return */
  confidence?: number;
  /** Delay in ms before returning result */
  delayMs?: number;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Mock Language Detector
 *
 * Returns a fixed language/confidence for testing.
 */
export class MockLanguageDetector implements LanguageDetectorPort {
  readonly name = "mock";

  private options: MockLanguageDetectorOptions;
  private currentLocale: Locale | null = null;

  constructor(options: MockLanguageDetectorOptions = {}) {
    this.options = {
      language: "fr",
      confidence: 0.95,
      delayMs: 10,
      debug: false,
      ...options,
    };
  }

  async init(): Promise<void> {
    if (this.options.debug) {
      console.log("[MockLanguageDetector] Initialized");
    }
  }

  async detect(text: string): Promise<LanguageDetectionResult> {
    if (this.options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    const result: LanguageDetectionResult = {
      lang: this.options.language || "fr",
      confidence: this.options.confidence || 0.95,
    };

    this.currentLocale = languageToLocale(result.lang);

    if (this.options.debug) {
      console.log(`[MockLanguageDetector] detect("${text.substring(0, 20)}...") → ${result.lang}`);
    }

    return result;
  }

  getCurrentLocale(): Locale | null {
    return this.currentLocale;
  }

  reset(): void {
    this.currentLocale = null;
  }

  destroy(): void {
    this.reset();
  }

  /**
   * Set the language to return for subsequent detections
   */
  setLanguage(language: string, confidence = 0.95): void {
    this.options.language = language;
    this.options.confidence = confidence;
  }
}

/**
 * Factory function
 */
export function createMockLanguageDetector(
  options?: MockLanguageDetectorOptions
): LanguageDetectorPort {
  return new MockLanguageDetector(options);
}
