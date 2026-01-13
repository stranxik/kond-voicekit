/**
 * Turn Detector Adapters
 */

// Heuristic (always available fallback)
export { HeuristicTurnDetector, createHeuristicTurnDetector } from "./heuristic";
export type { HeuristicTurnDetectorOptions } from "./heuristic";
export { isBackchannel, isLikelyIncomplete, isSemanticComplete, hasTerminalPunctuation } from "./heuristic";

// ONNX (local ML - stub)
export { OnnxTurnDetector, createOnnxTurnDetector } from "./onnx";
export type { OnnxTurnDetectorOptions } from "./onnx";

// Cloud (remote ML API)
export {
  CloudTurnDetector,
  createCloudTurnDetector,
  createCloudTurnDetectorWithAuth,
  configureCloudTurnDetector,
  getCloudTurnDetectorConfig,
} from "./cloud";
export type { CloudTurnDetectorOptions, CloudTurnDetectorConfig } from "./cloud";

// Mock (testing)
export { MockTurnDetector, createMockTurnDetector } from "./mock";
export type { MockTurnDetectorOptions } from "./mock";
