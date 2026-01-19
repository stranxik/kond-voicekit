/**
 * Device Capability Detection
 *
 * Detects device capabilities to determine if local ONNX inference is feasible.
 * Used by the "auto" turn detector mode to choose between local ONNX and cloud API.
 */

/**
 * Device capabilities for ONNX inference
 */
export interface DeviceCapabilities {
  /** Whether the device can run local ONNX inference efficiently */
  canRunLocalOnnx: boolean;
  /** Device memory in GB (null if not available) */
  deviceMemoryGB: number | null;
  /** Whether WebAssembly is supported */
  hasWebAssembly: boolean;
  /** Whether IndexedDB is available for model caching */
  hasIndexedDB: boolean;
  /** Whether this is a mobile device */
  isMobile: boolean;
  /** Number of logical CPU cores (null if not available) */
  hardwareConcurrency: number | null;
}

/**
 * Extended Navigator interface with deviceMemory
 */
interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Detect device capabilities for ONNX inference
 *
 * Checks:
 * - Not a mobile device (phones/tablets have limited memory)
 * - WebAssembly support (required for ONNX runtime)
 * - IndexedDB support (for model caching)
 * - Minimum 4GB RAM (if deviceMemory API available)
 *
 * @returns Device capabilities object
 */
export function detectDeviceCapabilities(): DeviceCapabilities {
  // Check if running in browser environment
  const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

  if (!isBrowser) {
    // Server-side or non-browser environment - cannot run ONNX
    return {
      canRunLocalOnnx: false,
      deviceMemoryGB: null,
      hasWebAssembly: false,
      hasIndexedDB: false,
      isMobile: false,
      hardwareConcurrency: null,
    };
  }

  const nav = navigator as NavigatorWithMemory;

  // Device memory (in GB) - only available in Chromium browsers
  const deviceMemoryGB = nav.deviceMemory ?? null;

  // WebAssembly support check
  const hasWebAssembly =
    typeof WebAssembly !== "undefined" &&
    typeof WebAssembly.instantiate === "function";

  // IndexedDB support check
  const hasIndexedDB = "indexedDB" in window;

  // Mobile detection using User-Agent
  // Note: This is a heuristic, not 100% reliable
  const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    nav.userAgent
  );

  // Hardware concurrency (logical CPU cores)
  const hardwareConcurrency = nav.hardwareConcurrency ?? null;

  // Decision logic for local ONNX capability
  // Requirements:
  // 1. Not a mobile device (limited memory, battery concerns)
  // 2. WebAssembly support (required for ONNX runtime)
  // 3. IndexedDB support (for model caching)
  // 4. At least 4GB RAM (if deviceMemory API available)
  //    - If deviceMemory is null (Firefox, Safari), we assume capable desktop
  const canRunLocalOnnx =
    !isMobile &&
    hasWebAssembly &&
    hasIndexedDB &&
    (deviceMemoryGB === null || deviceMemoryGB >= 4);

  return {
    canRunLocalOnnx,
    deviceMemoryGB,
    hasWebAssembly,
    hasIndexedDB,
    isMobile,
    hardwareConcurrency,
  };
}

/**
 * Check if device has sufficient capabilities for local ONNX inference
 * Convenience wrapper around detectDeviceCapabilities
 */
export function canRunLocalOnnxInference(): boolean {
  return detectDeviceCapabilities().canRunLocalOnnx;
}

/**
 * Get a human-readable reason why local ONNX cannot be used
 * Useful for debugging and user feedback
 */
export function getOnnxCapabilityReason(): string {
  const caps = detectDeviceCapabilities();

  if (caps.canRunLocalOnnx) {
    return "Device is capable of running local ONNX inference";
  }

  const reasons: string[] = [];

  if (caps.isMobile) {
    reasons.push("Mobile device detected");
  }

  if (!caps.hasWebAssembly) {
    reasons.push("WebAssembly not supported");
  }

  if (!caps.hasIndexedDB) {
    reasons.push("IndexedDB not available");
  }

  if (caps.deviceMemoryGB !== null && caps.deviceMemoryGB < 4) {
    reasons.push(`Low memory: ${caps.deviceMemoryGB}GB (need 4GB+)`);
  }

  return reasons.length > 0
    ? `Cannot run local ONNX: ${reasons.join(", ")}`
    : "Unknown reason";
}
