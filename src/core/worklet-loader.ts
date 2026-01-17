/**
 * Worklet Loader with Fallback Strategy
 *
 * Loading order:
 * 1. Custom URL if provided (workletUrl config)
 * 2. Blob URL from embedded source (zero-config)
 * 3. CDN fallback if Blob fails (CSP restrictions)
 *
 * This pattern is used by Stripe.js, Auth0, Twilio, etc.
 */

import {
  AUDIO_PROCESSOR_WORKLET_SOURCE,
  WORKLET_VERSION,
} from "./worklet-source";

/**
 * CDN base URL for worklet fallback
 * Hosted on Vercel (kond.studio) with proper CORS headers
 */
const CDN_BASE_URL = "https://kond.studio/sdk/voicekit";

export interface WorkletLoaderOptions {
  /** Custom worklet URL (overrides all defaults) */
  workletUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Create a noop logger or console.log based on debug flag
 */
const createLogger = (debug?: boolean) =>
  debug ? console.log.bind(console, "[VoiceKit]") : () => {};

/**
 * Load the audio processor worklet with intelligent fallback strategy
 *
 * @param audioContext - AudioContext to load the worklet into
 * @param options - Loading options
 *
 * @example
 * ```typescript
 * const ctx = new AudioContext();
 * await loadAudioWorklet(ctx, { debug: true });
 * // Worklet is now loaded and ready to use
 * ```
 */
export async function loadAudioWorklet(
  audioContext: AudioContext,
  options: WorkletLoaderOptions = {}
): Promise<void> {
  const { workletUrl, debug } = options;
  const log = createLogger(debug);

  // =========================================================================
  // Option 1: Custom URL provided by user
  // =========================================================================
  if (workletUrl) {
    // Security: Validate URL scheme to prevent code injection
    const isSecureUrl =
      workletUrl.startsWith("https://") ||
      workletUrl.startsWith("blob:") ||
      workletUrl.startsWith("/") || // Relative URLs are OK
      (workletUrl.startsWith("http://") &&
        (workletUrl.includes("localhost") || workletUrl.includes("127.0.0.1")));

    if (!isSecureUrl) {
      throw new Error(
        `[VoiceKit] Security: Worklet URL must be HTTPS, blob:, or localhost.\n` +
          `Received: ${workletUrl}\n` +
          `Use HTTPS in production or self-host at a secure URL.`
      );
    }

    log("Loading worklet from custom URL:", workletUrl);
    try {
      await audioContext.audioWorklet.addModule(workletUrl);
      log("Worklet loaded successfully (custom URL)");
      return;
    } catch (error) {
      throw new Error(
        `[VoiceKit] Failed to load worklet from custom URL: ${workletUrl}\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // =========================================================================
  // Option 2: Try Blob URL (zero-config, works in most cases)
  // =========================================================================
  try {
    const blob = new Blob([AUDIO_PROCESSOR_WORKLET_SOURCE], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);

    log("Loading worklet from Blob URL...");
    await audioContext.audioWorklet.addModule(blobUrl);

    // Cleanup blob URL after module is loaded (memory optimization)
    URL.revokeObjectURL(blobUrl);

    log("Worklet loaded successfully (Blob URL)");
    return;
  } catch (blobError) {
    log(
      "Blob URL failed (likely CSP restriction), trying CDN fallback...",
      blobError
    );
  }

  // =========================================================================
  // Option 3: CDN fallback (for strict CSP environments)
  // =========================================================================
  const cdnUrl = `${CDN_BASE_URL}/v${WORKLET_VERSION}/audio-processor.worklet.js`;

  try {
    log("Loading worklet from CDN:", cdnUrl);
    await audioContext.audioWorklet.addModule(cdnUrl);
    log("Worklet loaded successfully (CDN)");
    return;
  } catch (cdnError) {
    // All options failed - provide helpful error message
    throw new Error(
      `[VoiceKit] Failed to load audio worklet.\n\n` +
        `Blob URL was blocked (likely by CSP) and CDN fallback also failed.\n\n` +
        `To fix this, choose one of these options:\n\n` +
        `1. Add 'blob:' to your Content-Security-Policy script-src directive:\n` +
        `   script-src 'self' blob:;\n\n` +
        `2. Add the KOND CDN to your CSP:\n` +
        `   script-src 'self' ${CDN_BASE_URL};\n\n` +
        `3. Self-host the worklet and pass the URL:\n` +
        `   new VoiceKit({ workletUrl: '/path/to/audio-processor.worklet.js' })\n\n` +
        `CDN Error: ${cdnError instanceof Error ? cdnError.message : String(cdnError)}`
    );
  }
}

/**
 * Get the CDN URL for the current version
 * Useful for manual loading or debugging
 */
export function getCDNWorkletUrl(): string {
  return `${CDN_BASE_URL}/v${WORKLET_VERSION}/audio-processor.worklet.js`;
}

/**
 * Get the latest CDN URL (not version-pinned)
 * Use with caution - may break if we make breaking changes
 */
export function getLatestCDNWorkletUrl(): string {
  return `${CDN_BASE_URL}/latest/audio-processor.worklet.js`;
}
