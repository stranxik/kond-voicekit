/**
 * VoiceKit Error Classes
 *
 * Structured error handling for better debugging and error recovery.
 * All VoiceKit errors extend VoiceKitError for easy catching.
 */

/**
 * Error codes for VoiceKit errors
 */
export type VoiceKitErrorCode =
  | "NETWORK_ERROR"
  | "AUTH_FAILED"
  | "CONFIGURATION_ERROR"
  | "TRANSCRIPTION_FAILED"
  | "TTS_FAILED"
  | "VAD_FAILED"
  | "TURN_DETECTION_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CANCELLED"
  | "UNKNOWN";

/**
 * Base error class for all VoiceKit errors
 */
export class VoiceKitError extends Error {
  readonly code: VoiceKitErrorCode;
  readonly retryable: boolean;
  readonly cause?: Error;

  constructor(
    message: string,
    code: VoiceKitErrorCode,
    options?: {
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "VoiceKitError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Network-related errors (connection failed, DNS resolution, etc.)
 */
export class NetworkError extends VoiceKitError {
  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR", { retryable: true, cause });
    this.name = "NetworkError";
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends VoiceKitError {
  constructor(message: string, cause?: Error) {
    super(message, "AUTH_FAILED", { retryable: false, cause });
    this.name = "AuthError";
  }
}

/**
 * Configuration errors (invalid config, missing required fields)
 */
export class ConfigurationError extends VoiceKitError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR", { retryable: false });
    this.name = "ConfigurationError";
  }
}

/**
 * Speech-to-Text transcription errors
 */
export class TranscriptionError extends VoiceKitError {
  constructor(message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(message, "TRANSCRIPTION_FAILED", options);
    this.name = "TranscriptionError";
  }
}

/**
 * Text-to-Speech synthesis errors
 */
export class TTSError extends VoiceKitError {
  constructor(message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(message, "TTS_FAILED", options);
    this.name = "TTSError";
  }
}

/**
 * Voice Activity Detection errors
 */
export class VADError extends VoiceKitError {
  constructor(message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(message, "VAD_FAILED", options);
    this.name = "VADError";
  }
}

/**
 * Turn detection errors
 */
export class TurnDetectionError extends VoiceKitError {
  constructor(message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(message, "TURN_DETECTION_FAILED", options);
    this.name = "TurnDetectionError";
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends VoiceKitError {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message, "RATE_LIMITED", { retryable: true });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Request timeout
 */
export class TimeoutError extends VoiceKitError {
  constructor(message: string) {
    super(message, "TIMEOUT", { retryable: true });
    this.name = "TimeoutError";
  }
}

/**
 * Operation was cancelled
 */
export class CancelledError extends VoiceKitError {
  constructor(message = "Operation cancelled") {
    super(message, "CANCELLED", { retryable: false });
    this.name = "CancelledError";
  }
}

/**
 * Check if an error is a VoiceKitError
 */
export function isVoiceKitError(error: unknown): error is VoiceKitError {
  return error instanceof VoiceKitError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof VoiceKitError) {
    return error.retryable;
  }
  return false;
}

/**
 * Wrap unknown errors in VoiceKitError
 */
export function wrapError(error: unknown, defaultMessage = "Unknown error"): VoiceKitError {
  if (error instanceof VoiceKitError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error types
    if (error.name === "AbortError") {
      return new CancelledError();
    }
    if (error.message.includes("timeout") || error.message.includes("timed out")) {
      return new TimeoutError(error.message);
    }
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return new NetworkError(error.message, error);
    }

    return new VoiceKitError(error.message, "UNKNOWN", { cause: error });
  }

  return new VoiceKitError(
    typeof error === "string" ? error : defaultMessage,
    "UNKNOWN"
  );
}
