/**
 * Language Detector Adapters
 */

// KOND (cloud via KOND API → Lingua)
export { KondLanguageDetector, createKondLanguageDetector } from "./kond";
export type { KondLanguageDetectorOptions } from "./kond";

// Mock (testing)
export { MockLanguageDetector, createMockLanguageDetector } from "./mock";
export type { MockLanguageDetectorOptions } from "./mock";
