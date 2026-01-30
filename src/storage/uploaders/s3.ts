/**
 * S3 Storage Uploader
 *
 * Lightweight S3 client that works in browser environments using fetch.
 * Compatible with AWS S3 and S3-compatible storage (R2, MinIO, etc.)
 *
 * @example Basic Usage
 * ```typescript
 * import { createS3Uploader } from "@kond.studio/voicekit";
 *
 * const storage = createS3Uploader({
 *   bucket: "my-recordings",
 *   region: "us-east-1",
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   },
 *   prefix: "recordings/",
 * });
 *
 * // In your onRecordingStop callback:
 * const result = await storage.upload(recording);
 * console.log("Uploaded:", result.url);
 * ```
 *
 * @example S3-Compatible (Cloudflare R2)
 * ```typescript
 * const storage = createS3Uploader({
 *   bucket: "my-bucket",
 *   region: "auto",
 *   endpoint: "https://xxx.r2.cloudflarestorage.com",
 *   credentials: { ... },
 *   forcePathStyle: true,
 * });
 * ```
 */

import type { RecordingResult } from "../../ports/recording";
import type {
  StorageUploader,
  StorageUploadResult,
  StorageUploadOptions,
  PlaybackUrlOptions,
  S3UploaderConfig,
} from "../types";
import { StorageError, getContentType, generateStoragePath } from "../types";

// =============================================================================
// AWS Signature V4 Implementation (Browser-compatible)
// =============================================================================

/**
 * Compute HMAC-SHA256 using Web Crypto API
 */
async function hmacSha256(
  key: ArrayBuffer,
  message: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

/**
 * Compute SHA-256 hash
 */
async function sha256(data: ArrayBuffer | string): Promise<string> {
  const buffer =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return arrayBufferToHex(hash);
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get signing key for AWS Signature V4
 */
async function getSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode(`AWS4${secretAccessKey}`).buffer as ArrayBuffer,
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Create AWS Signature V4 authorization header
 */
async function createAuthorizationHeader(options: {
  method: string;
  host: string;
  path: string;
  query?: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
  datetime: string;
}): Promise<string> {
  const {
    method,
    host,
    path,
    query,
    headers,
    payloadHash,
    accessKeyId,
    secretAccessKey,
    region,
    service,
    datetime,
  } = options;

  const dateStamp = datetime.substring(0, 8);

  // Canonical headers (must be sorted)
  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k.toLowerCase()] || headers[k]}`)
    .join("\n");
  const signedHeaders = signedHeaderKeys.join(";");

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    query || "",
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  // String to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    datetime,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  // Calculate signature
  const signingKey = await getSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    service
  );
  const signature = arrayBufferToHex(await hmacSha256(signingKey, stringToSign));

  // Authorization header
  return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// =============================================================================
// S3 Uploader Implementation
// =============================================================================

/**
 * S3 Storage Uploader
 *
 * Uses AWS Signature V4 for authentication and fetch API for requests.
 */
export class S3Uploader implements StorageUploader {
  readonly name = "S3Uploader";

  private config: Required<
    Pick<S3UploaderConfig, "bucket" | "region" | "credentials">
  > &
    S3UploaderConfig;

  constructor(config: S3UploaderConfig) {
    // Validate required fields
    if (!config.bucket) {
      throw new StorageError("S3 bucket is required", "INVALID_CONFIG");
    }
    if (!config.region) {
      throw new StorageError("S3 region is required", "INVALID_CONFIG");
    }
    if (!config.credentials?.accessKeyId || !config.credentials?.secretAccessKey) {
      throw new StorageError("S3 credentials are required", "INVALID_CONFIG");
    }

    this.config = {
      ...config,
      endpoint:
        config.endpoint ||
        `https://s3.${config.region}.amazonaws.com`,
      forcePathStyle: config.forcePathStyle ?? false,
      prefix: config.prefix || "",
      urlExpiry: config.urlExpiry || 3600,
      publicBucket: config.publicBucket ?? false,
      debug: config.debug ?? false,
    };
  }

  /**
   * Get host for S3 requests
   */
  private getHost(): string {
    const url = new URL(this.config.endpoint!);
    if (this.config.forcePathStyle) {
      return url.host;
    }
    return `${this.config.bucket}.${url.host}`;
  }

  /**
   * Get base URL for S3 requests
   */
  private getBaseUrl(): string {
    const url = new URL(this.config.endpoint!);
    if (this.config.forcePathStyle) {
      return `${url.protocol}//${url.host}/${this.config.bucket}`;
    }
    return `${url.protocol}//${this.config.bucket}.${url.host}`;
  }

  /**
   * Log debug message
   */
  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[S3Uploader]", ...args);
    }
  }

  /**
   * Upload a recording to S3
   */
  async upload(
    recording: RecordingResult,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const startTime = Date.now();

    // Generate path
    const path =
      options?.path ||
      generateStoragePath(
        recording,
        options?.prefix || this.config.prefix
      );

    const contentType =
      options?.contentType || getContentType(recording.format);
    const cacheControl = options?.cacheControl || "private, max-age=31536000";

    this.log("Uploading", path, recording.sizeBytes, "bytes");

    try {
      // Read blob as ArrayBuffer
      const body = await recording.audioBlob.arrayBuffer();
      const payloadHash = await sha256(body);

      // Prepare request
      const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const host = this.getHost();
      const urlPath = this.config.forcePathStyle
        ? `/${this.config.bucket}/${path}`
        : `/${path}`;

      const headers: Record<string, string> = {
        host,
        "content-type": contentType,
        "content-length": recording.sizeBytes.toString(),
        "cache-control": cacheControl,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": datetime,
      };

      // Add session token if present
      if (this.config.credentials.sessionToken) {
        headers["x-amz-security-token"] = this.config.credentials.sessionToken;
      }

      // Add custom metadata
      if (options?.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          headers[`x-amz-meta-${key.toLowerCase()}`] = value;
        }
      }

      // Create authorization header
      const authorization = await createAuthorizationHeader({
        method: "PUT",
        host,
        path: urlPath,
        headers,
        payloadHash,
        accessKeyId: this.config.credentials.accessKeyId,
        secretAccessKey: this.config.credentials.secretAccessKey,
        sessionToken: this.config.credentials.sessionToken,
        region: this.config.region,
        service: "s3",
        datetime,
      });

      headers.authorization = authorization;

      // Execute request
      const url = `${this.getBaseUrl()}/${path}`;
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body,
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.log("Upload failed:", response.status, errorText);
        throw new StorageError(
          `S3 upload failed: ${response.status} ${response.statusText}`,
          response.status === 403 ? "ACCESS_DENIED" : "UPLOAD_FAILED"
        );
      }

      const etag = response.headers.get("etag")?.replace(/"/g, "") || undefined;

      this.log("Upload complete in", Date.now() - startTime, "ms");

      return {
        path,
        url: await this.getPlaybackUrl(path),
        sizeBytes: recording.sizeBytes,
        uploadedAt: new Date().toISOString(),
        etag,
        metadata: options?.metadata,
      };
    } catch (error) {
      if (error instanceof StorageError) throw error;

      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("abort") || message.includes("cancel")) {
        throw new StorageError("Upload cancelled", "CANCELLED", error as Error);
      }

      throw new StorageError(`S3 upload failed: ${message}`, "UPLOAD_FAILED", error as Error);
    }
  }

  /**
   * Get a playback URL for a stored recording
   */
  async getPlaybackUrl(
    path: string,
    options?: PlaybackUrlOptions
  ): Promise<string> {
    // For public buckets, return direct URL
    if (this.config.publicBucket) {
      return `${this.getBaseUrl()}/${path}`;
    }

    // Generate presigned URL
    const expiresIn = options?.expiresIn || this.config.urlExpiry!;
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = datetime.substring(0, 8);

    const host = this.getHost();
    const urlPath = this.config.forcePathStyle
      ? `/${this.config.bucket}/${path}`
      : `/${path}`;

    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;

    // Query parameters for presigned URL
    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.credentials.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": datetime,
      "X-Amz-Expires": expiresIn.toString(),
      "X-Amz-SignedHeaders": "host",
    });

    if (this.config.credentials.sessionToken) {
      queryParams.set("X-Amz-Security-Token", this.config.credentials.sessionToken);
    }

    if (options?.disposition) {
      const filename = options.filename || path.split("/").pop() || "recording";
      queryParams.set(
        "response-content-disposition",
        `${options.disposition}; filename="${filename}"`
      );
    }

    // Sort and stringify query
    const sortedParams = new URLSearchParams(
      [...queryParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
    const query = sortedParams.toString();

    // Create signature
    const headers = { host };
    const payloadHash = "UNSIGNED-PAYLOAD";

    const canonicalRequest = [
      "GET",
      urlPath,
      query,
      `host:${host}\n`,
      "host",
      payloadHash,
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      credentialScope,
      await sha256(canonicalRequest),
    ].join("\n");

    const signingKey = await getSigningKey(
      this.config.credentials.secretAccessKey,
      dateStamp,
      this.config.region,
      "s3"
    );
    const signature = arrayBufferToHex(await hmacSha256(signingKey, stringToSign));

    queryParams.set("X-Amz-Signature", signature);

    return `${this.getBaseUrl()}/${path}?${queryParams.toString()}`;
  }

  /**
   * Delete a recording from S3
   */
  async delete(path: string): Promise<void> {
    this.log("Deleting", path);

    try {
      const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const host = this.getHost();
      const urlPath = this.config.forcePathStyle
        ? `/${this.config.bucket}/${path}`
        : `/${path}`;

      const payloadHash = await sha256("");

      const headers: Record<string, string> = {
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": datetime,
      };

      if (this.config.credentials.sessionToken) {
        headers["x-amz-security-token"] = this.config.credentials.sessionToken;
      }

      const authorization = await createAuthorizationHeader({
        method: "DELETE",
        host,
        path: urlPath,
        headers,
        payloadHash,
        accessKeyId: this.config.credentials.accessKeyId,
        secretAccessKey: this.config.credentials.secretAccessKey,
        sessionToken: this.config.credentials.sessionToken,
        region: this.config.region,
        service: "s3",
        datetime,
      });

      headers.authorization = authorization;

      const url = `${this.getBaseUrl()}/${path}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers,
      });

      // S3 returns 204 for successful delete (even if object didn't exist)
      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        this.log("Delete failed:", response.status, errorText);
        throw new StorageError(
          `S3 delete failed: ${response.status} ${response.statusText}`,
          response.status === 403 ? "ACCESS_DENIED" : "DELETE_FAILED"
        );
      }

      this.log("Delete complete");
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        `S3 delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_FAILED",
        error as Error
      );
    }
  }

  /**
   * Check if a recording exists in S3
   */
  async exists(path: string): Promise<boolean> {
    try {
      const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const host = this.getHost();
      const urlPath = this.config.forcePathStyle
        ? `/${this.config.bucket}/${path}`
        : `/${path}`;

      const payloadHash = await sha256("");

      const headers: Record<string, string> = {
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": datetime,
      };

      if (this.config.credentials.sessionToken) {
        headers["x-amz-security-token"] = this.config.credentials.sessionToken;
      }

      const authorization = await createAuthorizationHeader({
        method: "HEAD",
        host,
        path: urlPath,
        headers,
        payloadHash,
        accessKeyId: this.config.credentials.accessKeyId,
        secretAccessKey: this.config.credentials.secretAccessKey,
        sessionToken: this.config.credentials.sessionToken,
        region: this.config.region,
        service: "s3",
        datetime,
      });

      headers.authorization = authorization;

      const url = `${this.getBaseUrl()}/${path}`;
      const response = await fetch(url, {
        method: "HEAD",
        headers,
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an S3 storage uploader
 *
 * @example AWS S3
 * ```typescript
 * const storage = createS3Uploader({
 *   bucket: "my-recordings",
 *   region: "us-east-1",
 *   credentials: {
 *     accessKeyId: "AKIA...",
 *     secretAccessKey: "...",
 *   },
 * });
 * ```
 *
 * @example Cloudflare R2
 * ```typescript
 * const storage = createS3Uploader({
 *   bucket: "my-bucket",
 *   region: "auto",
 *   endpoint: "https://xxx.r2.cloudflarestorage.com",
 *   forcePathStyle: true,
 *   credentials: { ... },
 * });
 * ```
 *
 * @example MinIO / Self-hosted
 * ```typescript
 * const storage = createS3Uploader({
 *   bucket: "recordings",
 *   region: "us-east-1",
 *   endpoint: "https://minio.example.com",
 *   forcePathStyle: true,
 *   credentials: { ... },
 * });
 * ```
 */
export function createS3Uploader(config: S3UploaderConfig): S3Uploader {
  return new S3Uploader(config);
}
