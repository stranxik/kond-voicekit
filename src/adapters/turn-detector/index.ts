/**
 * Turn Detector Adapters
 */

// Heuristic (always available fallback)
export { HeuristicTurnDetector, createHeuristicTurnDetector } from "./heuristic";
export type { HeuristicTurnDetectorOptions } from "./heuristic";
export { isBackchannel, isLikelyIncomplete, isSemanticComplete, hasTerminalPunctuation } from "./heuristic";

// ONNX (local ML inference)
export { OnnxTurnDetector, createOnnxTurnDetector } from "./onnx";
export type { OnnxTurnDetectorOptions } from "./onnx";

// Cloud (remote ML API via KOND)
export { CloudTurnDetector, createCloudTurnDetector } from "./cloud";
export type { CloudTurnDetectorOptions } from "./cloud";

// Mock (testing)
export { MockTurnDetector, createMockTurnDetector } from "./mock";
export type { MockTurnDetectorOptions } from "./mock";

// Support utilities (for advanced use)
export { BPETokenizer } from "./tokenizer";
export type { TokenizerConfig } from "./tokenizer";
export { ModelCache, getModelCache } from "./model-cache";
export type { ModelMetadata } from "./model-cache";
