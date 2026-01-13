/**
 * Browser Utilities
 * Feature detection and device compatibility checks for voice conversations
 */

/**
 * Detect if running on iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * Detect if running on Safari (macOS or iOS)
 */
export function isSafari(): boolean {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /safari/.test(userAgent) && !/chrome/.test(userAgent);
}

/**
 * Get iOS version number
 * Returns 0 if not iOS or version cannot be determined
 */
export function getIOSVersion(): number {
  if (typeof window === "undefined") return 0;

  const match = window.navigator.userAgent.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if VAD (Voice Activity Detection) is supported
 * VAD requires:
 * - AudioContext / WebAudio API
 * - MediaDevices API
 * - WebAssembly
 * - On iOS: version 15+ for AudioContext behavior
 */
export function isVADSupported(): boolean {
  if (typeof window === "undefined") return false;

  // Check required APIs
  const hasAudioContext =
    "AudioContext" in window || "webkitAudioContext" in window;
  const hasMediaDevices =
    "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices;
  const hasWebAssembly = "WebAssembly" in window;

  if (!hasAudioContext || !hasMediaDevices || !hasWebAssembly) {
    return false;
  }

  // iOS-specific checks
  if (isIOS()) {
    const version = getIOSVersion();
    // iOS 17+ has better AudioContext handling
    // iOS 15-16 can work but may have issues
    // iOS < 15 has significant issues
    return version >= 15;
  }

  return true;
}

/**
 * Check if voice conversation mode should be enabled
 * Returns false to fallback to PTT mode
 */
export function isVoiceConversationSupported(): boolean {
  // Server-side: always return false (will be checked on client)
  if (typeof window === "undefined") return false;

  return isVADSupported();
}

/**
 * Resume AudioContext if suspended (required after user gesture on iOS)
 */
export async function ensureAudioContextResumed(
  ctx: AudioContext
): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

/**
 * Sleep utility - simple promise-based delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
