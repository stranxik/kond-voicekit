/**
 * Storage Uploader Types
 *
 * BYOS (Bring Your Own Storage) - VoiceKit SDK provides helpers for common providers
 * but users are responsible for their own storage configuration and compliance.
 *
 * @example S3 Upload
 * ```typescript
 * import { createS3Uploader } from "@kond.studio/voicekit";
 *
 * const storage = createS3Uploader({
 *   bucket: "my-recordings",
 *   region: "eu-west-1",
 *   credentials: { accessKeyId: "...", secretAccessKey: "..." },
 * });
 *
 * const result = await storage.upload(recording);
 * console.log("Uploaded to:", result.url);
 * ```
 *
 * @example Custom Backend
 * ```typescript
 * import { createCustomUploader } from "@kond.studio/voicekit";
 *
 * const storage = createCustomUploader({
 *   upload: async (recording) => {
 *     const formData = new FormData();
 *     formData.append("audio", recording.audioBlob);
 *     const res = await fetch("/api/upload", { method: "POST", body: formData });
 *     return res.json();
 *   },
 * });
 * ```
 */

import type { RecordingResult } from "../ports/recording";

// =============================================================================
// Core Types
// =============================================================================

/**
 * Result returned after successful upload
 */
export interface StorageUploadResult {
  /** Storage path or key (e.g., "recordings/rec_123.webm") */
  path: string;

  /** Public or presigned URL for playback */
  url: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Upload timestamp (ISO 8601) */
  uploadedAt: string;

  /** Optional: ETag or content hash for verification */
  etag?: string;

  /** Optional: Provider-specific metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for generating playback URLs
 */
export interface PlaybackUrlOptions {
  /** URL expiry time in seconds (for presigned URLs) @default 3600 */
  expiresIn?: number;

  /** Force download vs inline playback */
  disposition?: "inline" | "attachment";

  /** Custom filename for download */
  filename?: string;
}

/**
 * Storage Uploader Interface
 *
 * Implement this interface for custom storage providers or use
 * built-in helpers like createS3Uploader, createSupabaseUploader, etc.
 */
export interface StorageUploader {
  /** Human-readable name of the storage provider */
  readonly name: string;

  /**
   * Upload a recording to storage
   *
   * @param recording - The RecordingResult from VoiceKit
   * @param options - Optional upload configuration
   * @returns Upload result with URL and metadata
   *
   * @throws StorageError if upload fails
   */
  upload(
    recording: RecordingResult,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  /**
   * Get a playback URL for a stored recording
   *
   * For private buckets, this returns a presigned URL.
   * For public buckets, this returns a direct URL.
   *
   * @param path - The storage path returned from upload()
   * @param options - URL generation options
   * @returns Playback URL
   */
  getPlaybackUrl(path: string, options?: PlaybackUrlOptions): Promise<string>;

  /**
   * Delete a recording from storage
   *
   * @param path - The storage path to delete
   * @throws StorageError if deletion fails
   */
  delete(path: string): Promise<void>;

  /**
   * Check if a recording exists in storage
   *
   * @param path - The storage path to check
   * @returns true if exists, false otherwise
   */
  exists?(path: string): Promise<boolean>;

  /**
   * List recordings in a directory/prefix
   *
   * @param prefix - Path prefix to list (e.g., "user_123/recordings/")
   * @param options - Listing options
   * @returns Array of storage paths
   */
  list?(prefix: string, options?: StorageListOptions): Promise<string[]>;
}

// =============================================================================
// Upload Options
// =============================================================================

/**
 * Options for upload operation
 */
export interface StorageUploadOptions {
  /**
   * Custom path/key for the file
   * If not provided, a path will be generated based on sessionId and format
   * @example "users/123/recordings/session_abc.webm"
   */
  path?: string;

  /**
   * Path prefix (prepended to generated path)
   * @example "recordings/" → "recordings/rec_abc123.webm"
   */
  prefix?: string;

  /**
   * Custom metadata to store with the file
   * @example { userId: "123", conversationId: "abc" }
   */
  metadata?: Record<string, string>;

  /**
   * Content type override
   * @default auto-detected from recording.format
   */
  contentType?: string;

  /**
   * Cache-Control header
   * @default "private, max-age=31536000"
   */
  cacheControl?: string;

  /**
   * Upload progress callback
   */
  onProgress?: (loaded: number, total: number) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;
}

/**
 * Options for listing operations
 */
export interface StorageListOptions {
  /** Maximum number of results */
  maxResults?: number;

  /** Continuation token for pagination */
  continuationToken?: string;

  /** Only return paths modified after this date */
  modifiedAfter?: Date;
}

// =============================================================================
// S3-Specific Types
// =============================================================================

/**
 * AWS credentials for S3 access
 */
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional session token for temporary credentials */
  sessionToken?: string;
}

/**
 * Configuration for S3 uploader
 */
export interface S3UploaderConfig {
  /** S3 bucket name */
  bucket: string;

  /** AWS region @example "us-east-1", "eu-west-1" */
  region: string;

  /** AWS credentials */
  credentials: S3Credentials;

  /**
   * Custom S3 endpoint for S3-compatible storage
   * @example "https://s3.eu-west-1.amazonaws.com" (default)
   * @example "https://storage.example.com" (MinIO, R2, etc.)
   */
  endpoint?: string;

  /**
   * Use path-style URLs instead of virtual-hosted style
   * Required for some S3-compatible providers
   * @default false
   */
  forcePathStyle?: boolean;

  /**
   * Default path prefix for all uploads
   * @example "voice-recordings/"
   */
  prefix?: string;

  /**
   * Default presigned URL expiry in seconds
   * @default 3600 (1 hour)
   */
  urlExpiry?: number;

  /**
   * Whether the bucket is public (affects URL generation)
   * @default false
   */
  publicBucket?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

// =============================================================================
// Custom Uploader Types
// =============================================================================

/**
 * Function signature for custom upload handler
 */
export type CustomUploadFn = (
  recording: RecordingResult,
  options?: StorageUploadOptions
) => Promise<StorageUploadResult>;

/**
 * Function signature for custom playback URL handler
 */
export type CustomGetUrlFn = (
  path: string,
  options?: PlaybackUrlOptions
) => Promise<string>;

/**
 * Function signature for custom delete handler
 */
export type CustomDeleteFn = (path: string) => Promise<void>;

/**
 * Configuration for custom uploader
 */
export interface CustomUploaderConfig {
  /** Custom name for this uploader @default "CustomUploader" */
  name?: string;

  /** Custom upload implementation (required) */
  upload: CustomUploadFn;

  /** Custom URL generation (optional, defaults to returning path) */
  getPlaybackUrl?: CustomGetUrlFn;

  /** Custom delete implementation (optional) */
  delete?: CustomDeleteFn;

  /** Custom exists check (optional) */
  exists?: (path: string) => Promise<boolean>;

  /** Custom list implementation (optional) */
  list?: (prefix: string, options?: StorageListOptions) => Promise<string[]>;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Storage operation error codes
 */
export type StorageErrorCode =
  | "UPLOAD_FAILED"
  | "DELETE_FAILED"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "INVALID_CONFIG"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "CANCELLED"
  | "UNKNOWN";

/**
 * Storage operation error
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "StorageError";
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Get content type from recording format
 */
export function getContentType(format: "webm" | "wav"): string {
  return format === "webm" ? "audio/webm" : "audio/wav";
}

/**
 * Generate a storage path from recording result
 */
export function generateStoragePath(
  recording: RecordingResult,
  prefix?: string
): string {
  const ext = recording.format;
  const safePath = `${prefix || ""}${recording.sessionId}.${ext}`;
  // Remove leading slash if any
  return safePath.replace(/^\/+/, "");
}
