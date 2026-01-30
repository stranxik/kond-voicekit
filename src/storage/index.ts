/**
 * Storage Module - BYOS (Bring Your Own Storage)
 *
 * VoiceKit SDK provides optional helpers for uploading recordings to popular
 * storage providers. Users are responsible for their own storage configuration,
 * compliance (GDPR, etc.), and data retention.
 *
 * @example AWS S3
 * ```typescript
 * import { createS3Uploader, RecordingResult } from "@kond.studio/voicekit";
 *
 * const storage = createS3Uploader({
 *   bucket: "my-recordings",
 *   region: "us-east-1",
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   },
 * });
 *
 * // After recording stops:
 * async function handleRecording(recording: RecordingResult) {
 *   const result = await storage.upload(recording);
 *   console.log("Uploaded to:", result.url);
 *
 *   // Save to your database
 *   await db.recordings.create({
 *     userId: currentUser.id,
 *     path: result.path,
 *     duration: recording.durationMs,
 *   });
 * }
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
 *
 *     const res = await fetch("/api/upload", { method: "POST", body: formData });
 *     return res.json();
 *   },
 * });
 * ```
 *
 * @module storage
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core interface
  StorageUploader,
  StorageUploadResult,
  StorageUploadOptions,
  PlaybackUrlOptions,
  StorageListOptions,

  // S3 types
  S3UploaderConfig,
  S3Credentials,

  // Custom types
  CustomUploaderConfig,
  CustomUploadFn,
  CustomGetUrlFn,
  CustomDeleteFn,

  // Error types
  StorageErrorCode,
} from "./types";

// =============================================================================
// Error Class & Utilities
// =============================================================================

export { StorageError, getContentType, generateStoragePath } from "./types";

// =============================================================================
// S3 Uploader
// =============================================================================

export { S3Uploader, createS3Uploader } from "./uploaders/s3";

// =============================================================================
// Custom Uploader
// =============================================================================

export {
  CustomUploader,
  createCustomUploader,
  buildFormDataUpload,
} from "./uploaders/custom";
export type { FormDataUploadOptions } from "./uploaders/custom";
