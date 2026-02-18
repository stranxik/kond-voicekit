/**
 * Custom Storage Uploader
 *
 * A flexible adapter that accepts user-provided functions for storage operations.
 * Use this when you need to integrate with your own backend or a provider
 * not covered by built-in adapters.
 *
 * @example Basic Usage (POST to your API)
 * ```typescript
 * import { createCustomUploader } from "@kond.studio/voicekit";
 *
 * const storage = createCustomUploader({
 *   upload: async (recording, options) => {
 *     const formData = new FormData();
 *     formData.append("audio", recording.audioBlob, `${recording.sessionId}.${recording.format}`);
 *     formData.append("sessionId", recording.sessionId);
 *     formData.append("duration", recording.durationMs.toString());
 *
 *     const response = await fetch("/api/recordings", {
 *       method: "POST",
 *       body: formData,
 *       signal: options?.signal,
 *     });
 *
 *     if (!response.ok) throw new Error("Upload failed");
 *
 *     const data = await response.json();
 *     return {
 *       path: data.id,
 *       url: data.playbackUrl,
 *       sizeBytes: recording.sizeBytes,
 *       uploadedAt: new Date().toISOString(),
 *     };
 *   },
 * });
 * ```
 *
 * @example With Delete Support
 * ```typescript
 * const storage = createCustomUploader({
 *   name: "MyBackendStorage",
 *
 *   upload: async (recording) => {
 *     const res = await fetch("/api/recordings", { method: "POST", ... });
 *     return res.json();
 *   },
 *
 *   getPlaybackUrl: async (path) => {
 *     const res = await fetch(`/api/recordings/${path}/url`);
 *     const data = await res.json();
 *     return data.url;
 *   },
 *
 *   delete: async (path) => {
 *     await fetch(`/api/recordings/${path}`, { method: "DELETE" });
 *   },
 * });
 * ```
 *
 * @example Supabase Storage (without official SDK)
 * ```typescript
 * const storage = createCustomUploader({
 *   name: "SupabaseStorage",
 *
 *   upload: async (recording) => {
 *     const path = `recordings/${recording.sessionId}.${recording.format}`;
 *
 *     const response = await fetch(
 *       `${SUPABASE_URL}/storage/v1/object/recordings/${path}`,
 *       {
 *         method: "POST",
 *         headers: {
 *           Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
 *           "Content-Type": recording.format === "webm" ? "audio/webm" : "audio/wav",
 *         },
 *         body: recording.audioBlob,
 *       }
 *     );
 *
 *     if (!response.ok) throw new Error("Upload failed");
 *
 *     return {
 *       path,
 *       url: `${SUPABASE_URL}/storage/v1/object/public/recordings/${path}`,
 *       sizeBytes: recording.sizeBytes,
 *       uploadedAt: new Date().toISOString(),
 *     };
 *   },
 * });
 * ```
 */

import type { RecordingResult } from "../../ports/recording";
import type {
  StorageUploader,
  StorageUploadResult,
  StorageUploadOptions,
  PlaybackUrlOptions,
  StorageListOptions,
  CustomUploaderConfig,
} from "../types";
import { StorageError } from "../types";

// =============================================================================
// Custom Uploader Implementation
// =============================================================================

/**
 * Custom Storage Uploader
 *
 * Wraps user-provided functions into a StorageUploader interface.
 */
export class CustomUploader implements StorageUploader {
  readonly name: string;

  private config: CustomUploaderConfig;

  constructor(config: CustomUploaderConfig) {
    if (!config.upload) {
      throw new StorageError(
        "CustomUploader requires an upload function",
        "INVALID_CONFIG"
      );
    }

    this.name = config.name || "CustomUploader";
    this.config = config;
  }

  /**
   * Upload a recording using the custom upload function
   */
  async upload(
    recording: RecordingResult,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      return await this.config.upload(recording, options);
    } catch (error) {
      if (error instanceof StorageError) throw error;

      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("abort") || message.includes("cancel")) {
        throw new StorageError("Upload cancelled", "CANCELLED", error as Error);
      }

      throw new StorageError(
        `Custom upload failed: ${message}`,
        "UPLOAD_FAILED",
        error as Error
      );
    }
  }

  /**
   * Get a playback URL
   *
   * If no custom function provided, returns the path as-is
   */
  async getPlaybackUrl(
    path: string,
    options?: PlaybackUrlOptions
  ): Promise<string> {
    if (this.config.getPlaybackUrl) {
      try {
        return await this.config.getPlaybackUrl(path, options);
      } catch (error) {
        throw new StorageError(
          `Failed to get playback URL: ${error instanceof Error ? error.message : "Unknown error"}`,
          "UNKNOWN",
          error as Error
        );
      }
    }

    // Default: return path as-is (user may handle URL generation elsewhere)
    return path;
  }

  /**
   * Delete a recording
   *
   * Throws if no custom delete function provided
   */
  async delete(path: string): Promise<void> {
    if (!this.config.delete) {
      throw new StorageError(
        "Delete not implemented for this custom uploader. Provide a delete function in config.",
        "DELETE_FAILED"
      );
    }

    try {
      await this.config.delete(path);
    } catch (error) {
      if (error instanceof StorageError) throw error;

      throw new StorageError(
        `Custom delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_FAILED",
        error as Error
      );
    }
  }

  /**
   * Check if a recording exists
   */
  async exists(path: string): Promise<boolean> {
    if (!this.config.exists) {
      // Can't determine - assume it might exist
      return true;
    }

    try {
      return await this.config.exists(path);
    } catch {
      return false;
    }
  }

  /**
   * List recordings
   */
  async list(prefix: string, options?: StorageListOptions): Promise<string[]> {
    if (!this.config.list) {
      throw new StorageError(
        "List not implemented for this custom uploader. Provide a list function in config.",
        "UNKNOWN"
      );
    }

    try {
      return await this.config.list(prefix, options);
    } catch (error) {
      throw new StorageError(
        `Custom list failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UNKNOWN",
        error as Error
      );
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a custom storage uploader
 *
 * @example Minimal (upload only)
 * ```typescript
 * const storage = createCustomUploader({
 *   upload: async (recording) => {
 *     const formData = new FormData();
 *     formData.append("audio", recording.audioBlob);
 *
 *     const res = await fetch("/api/upload", { method: "POST", body: formData });
 *     const data = await res.json();
 *
 *     return {
 *       path: data.id,
 *       url: data.url,
 *       sizeBytes: recording.sizeBytes,
 *       uploadedAt: new Date().toISOString(),
 *     };
 *   },
 * });
 * ```
 *
 * @example Full implementation
 * ```typescript
 * const storage = createCustomUploader({
 *   name: "MyStorageProvider",
 *
 *   upload: async (recording, options) => { ... },
 *   getPlaybackUrl: async (path, options) => { ... },
 *   delete: async (path) => { ... },
 *   exists: async (path) => { ... },
 *   list: async (prefix, options) => { ... },
 * });
 * ```
 */
export function createCustomUploader(
  config: CustomUploaderConfig
): CustomUploader {
  return new CustomUploader(config);
}

// =============================================================================
// Helper: FormData Upload Builder
// =============================================================================

/**
 * Options for buildFormDataUpload helper
 */
export interface FormDataUploadOptions {
  /** API endpoint URL */
  endpoint: string;

  /** HTTP method @default "POST" */
  method?: "POST" | "PUT";

  /** Additional headers */
  headers?: Record<string, string>;

  /** Field name for the audio file @default "audio" */
  audioFieldName?: string;

  /** Additional form fields to include */
  additionalFields?: Record<string, string>;

  /** Function to extract result from response */
  parseResponse?: (response: Response) => Promise<StorageUploadResult>;
}

/**
 * Build a simple FormData-based upload function
 *
 * This is a helper for the most common custom uploader pattern:
 * POST a FormData with the audio file to an API endpoint.
 *
 * @example
 * ```typescript
 * const storage = createCustomUploader({
 *   upload: buildFormDataUpload({
 *     endpoint: "/api/recordings",
 *     additionalFields: {
 *       userId: "123",
 *     },
 *     parseResponse: async (res) => {
 *       const data = await res.json();
 *       return {
 *         path: data.id,
 *         url: data.url,
 *         sizeBytes: data.size,
 *         uploadedAt: data.createdAt,
 *       };
 *     },
 *   }),
 * });
 * ```
 */
export function buildFormDataUpload(
  opts: FormDataUploadOptions
): (
  recording: RecordingResult,
  options?: StorageUploadOptions
) => Promise<StorageUploadResult> {
  return async (recording, options) => {
    const formData = new FormData();

    // Add audio file
    const filename = `${recording.sessionId}.${recording.format}`;
    formData.append(
      opts.audioFieldName || "audio",
      recording.audioBlob,
      filename
    );

    // Add standard metadata
    formData.append("sessionId", recording.sessionId);
    formData.append("format", recording.format);
    formData.append("duration", recording.durationMs.toString());
    formData.append("size", recording.sizeBytes.toString());

    // Add additional fields
    if (opts.additionalFields) {
      for (const [key, value] of Object.entries(opts.additionalFields)) {
        formData.append(key, value);
      }
    }

    // Add custom metadata
    if (options?.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        formData.append(`meta_${key}`, value);
      }
    }

    const response = await fetch(opts.endpoint, {
      method: opts.method || "POST",
      headers: opts.headers,
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new StorageError(
        `Upload failed: ${response.status} - ${errorText}`,
        response.status === 403 ? "ACCESS_DENIED" : "UPLOAD_FAILED"
      );
    }

    // Parse response
    if (opts.parseResponse) {
      return opts.parseResponse(response);
    }

    // Default parsing (assumes JSON with { path, url } or { id, url })
    const data = await response.json();
    return {
      path: data.path || data.id || recording.sessionId,
      url: data.url || data.playbackUrl || "",
      sizeBytes: recording.sizeBytes,
      uploadedAt: data.createdAt || data.uploadedAt || new Date().toISOString(),
      metadata: options?.metadata,
    };
  };
}
