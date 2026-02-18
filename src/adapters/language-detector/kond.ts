/**
 * KOND Language Detector
 *
 * Remote language detection via KOND API → Lingua service.
 * Used by VoiceKit when locale="auto" to detect user's language.
 */

import type {
  LanguageDetectorPort,
  LanguageDetectionResult,
  LanguageDetectorConfig,
} from "../../ports/language-detector";
import {
  DEFAULT_LANGUAGE_DETECTOR_CONFIG,
  languageToLocale,
} from "../../ports/language-detector";
import type { Locale } from "../../types/config";
import { getEndpointUrl, DEFAULT_BASE_URL } from "../../types/config";

/**
 * KOND Language Detector Options
 */
export interface KondLanguageDetectorOptions extends LanguageDetectorConfig {
  /** Callback when language changes */
  onLanguageChange?: (lang: string, confidence: number, locale: Locale) => void;
}

/**
 * KOND Language Detector
 *
 * Calls KOND /detect-language endpoint which proxies to Lingua service.
 */
export class KondLanguageDetector implements LanguageDetectorPort {
  readonly name = "kond";

  private config: Required<Omit<LanguageDetectorConfig, "apiKey" | "token">>;
  private options: KondLanguageDetectorOptions;
  private baseUrl: string;
  private currentLocale: Locale | null = null;
  private lastDetection: LanguageDetectionResult | null = null;

  constructor(options: KondLanguageDetectorOptions) {
    this.options = options;
    this.config = {
      ...DEFAULT_LANGUAGE_DETECTOR_CONFIG,
      ...options,
    };
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  }

  async init(): Promise<void> {
    if (this.config.debug) {
      console.log("[KondLanguageDetector] Initialized");
    }
  }

  /**
   * Get the auth token (apiKey or JWT token)
   */
  private getAuthToken(): string {
    // Prefer token if available (demo/SSR mode), otherwise use apiKey
    return this.options.token || this.options.apiKey || "";
  }

  /**
   * Detect language of text
   */
  async detect(text: string): Promise<LanguageDetectionResult> {
    if (this.config.debug) {
      console.log(`[KondLanguageDetector] detect() - text length: ${text.length}`);
    }

    // Skip detection for very short text
    if (text.length < 3) {
      return { lang: "unknown", confidence: 0 };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const url = getEndpointUrl(this.baseUrl, "/detect-language");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (this.config.debug) {
          console.warn(`[KondLanguageDetector] API error: ${response.status}`);
        }
        return { lang: "unknown", confidence: 0 };
      }

      const data = await response.json();
      const result: LanguageDetectionResult = {
        lang: data.lang || "unknown",
        confidence: data.confidence || 0,
      };

      // Store last detection
      this.lastDetection = result;

      // Update current locale if confidence is high enough
      if (result.confidence >= this.config.confidenceThreshold) {
        const newLocale = languageToLocale(result.lang);

        if (newLocale !== this.currentLocale) {
          const previousLocale = this.currentLocale;
          this.currentLocale = newLocale;

          if (this.config.debug) {
            console.log(
              `[KondLanguageDetector] Language changed: ${previousLocale} → ${newLocale} (${result.lang}, ${(result.confidence * 100).toFixed(0)}%)`
            );
          }

          // Notify callback
          this.options.onLanguageChange?.(result.lang, result.confidence, newLocale);
        }
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        if (this.config.debug) {
          console.warn("[KondLanguageDetector] Request timeout");
        }
      } else {
        console.warn("[KondLanguageDetector] Detection failed:", error);
      }

      return { lang: "unknown", confidence: 0 };
    }
  }

  getCurrentLocale(): Locale | null {
    return this.currentLocale;
  }

  reset(): void {
    this.currentLocale = null;
    this.lastDetection = null;
  }

  destroy(): void {
    this.reset();
  }
}

/**
 * Factory function
 */
export function createKondLanguageDetector(
  options: KondLanguageDetectorOptions
): LanguageDetectorPort {
  return new KondLanguageDetector(options);
}
