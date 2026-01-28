/**
 * Device Capability Detection
 * Determines if device can run local ML models efficiently
 */

/**
 * Check if device is capable of running local ONNX models
 *
 * Criteria:
 * - Memory >= 4GB
 * - WASM SIMD support
 * - Not on slow connection (unless model cached)
 * - Desktop or powerful mobile
 */
export async function isDeviceCapableForLocalML(): Promise<boolean> {
  // 1. Check memory (need ~500MB available)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memory = (navigator as any).deviceMemory as number | undefined;
  if (memory && memory < 4) {
    console.log("[DeviceCapability] Insufficient memory:", memory, "GB");
    return false;
  }

  // 2. Check WASM SIMD support (for ONNX performance)
  const wasmSimd = await checkWasmSimd();
  if (!wasmSimd) {
    console.log("[DeviceCapability] WASM SIMD not supported");
    return false;
  }

  // 3. Check connection type (don't download 100MB on slow mobile)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = (navigator as any).connection as
    | { effectiveType?: string; saveData?: boolean }
    | undefined;
  if (connection?.effectiveType === "2g" || connection?.saveData) {
    // Check if model is already cached
    const cached = await isModelCached("turn-detector");
    if (!cached) {
      console.log("[DeviceCapability] Slow connection and model not cached");
      return false;
    }
  }

  // 4. Check if model already cached (if so, always capable)
  const cached = await isModelCached("turn-detector");
  if (cached) {
    console.log("[DeviceCapability] Model cached, using local");
    return true;
  }

  // 5. Default: capable if desktop or good mobile (6GB+)
  const mobile = isMobile();
  const capable = !mobile || (memory !== undefined && memory >= 6);

  console.log("[DeviceCapability] Final check:", {
    mobile,
    memory,
    capable,
  });

  return capable;
}

/**
 * Check if WebAssembly SIMD is supported
 * Required for efficient ONNX inference
 */
async function checkWasmSimd(): Promise<boolean> {
  try {
    // SIMD test module (v128 type)
    return WebAssembly.validate(
      new Uint8Array([
        0x00,
        0x61,
        0x73,
        0x6d, // WASM magic
        0x01,
        0x00,
        0x00,
        0x00, // Version 1
        0x01,
        0x05,
        0x01,
        0x60,
        0x00,
        0x01,
        0x7b, // Type section: () -> v128
        0x03,
        0x02,
        0x01,
        0x00, // Function section
        0x0a,
        0x0a,
        0x01,
        0x08,
        0x00, // Code section
        0x41,
        0x00, // i32.const 0
        0xfd,
        0x0f, // v128.load
        0x0b, // end
      ])
    );
  } catch {
    return false;
  }
}

/**
 * Check if model is cached in Cache API
 */
async function isModelCached(modelName: string): Promise<boolean> {
  try {
    const cache = await caches.open("voicekit-ml-models");
    const response = await cache.match(`/models/${modelName}.onnx`);
    return !!response;
  } catch {
    // Cache API not available or error
    return false;
  }
}

/**
 * Simple mobile detection
 */
function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Get device capability summary (for debugging)
 */
export async function getDeviceCapabilitySummary(): Promise<{
  memory: number | undefined;
  wasmSimd: boolean;
  mobile: boolean;
  connectionType: string | undefined;
  saveData: boolean;
  modelCached: boolean;
  capable: boolean;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memory = (navigator as any).deviceMemory as number | undefined;
  const wasmSimd = await checkWasmSimd();
  const mobile = isMobile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = (navigator as any).connection as
    | { effectiveType?: string; saveData?: boolean }
    | undefined;
  const modelCached = await isModelCached("turn-detector");
  const capable = await isDeviceCapableForLocalML();

  return {
    memory,
    wasmSimd,
    mobile,
    connectionType: connection?.effectiveType,
    saveData: connection?.saveData ?? false,
    modelCached,
    capable,
  };
}
