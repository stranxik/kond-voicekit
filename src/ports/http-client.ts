/**
 * HTTP Client Port - Abstraction for HTTP requests
 *
 * This port allows the SDK to be:
 * - Testable: Mock HTTP for unit tests
 * - Framework-agnostic: Swap fetch for axios, ky, etc.
 * - Server-side compatible: Use node-fetch or undici
 */

/**
 * HTTP request configuration
 */
export interface HttpRequest {
  /** Full URL to request */
  url: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON.stringify'd for objects) */
  body?: unknown;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Request credentials mode */
  credentials?: RequestCredentials;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse {
  /** Whether the request was successful (status 200-299) */
  ok: boolean;
  /** HTTP status code */
  status: number;
  /** Status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Response body as ReadableStream (for streaming) */
  body: ReadableStream<Uint8Array> | null;
  /** Parse response as JSON */
  json<T>(): Promise<T>;
  /** Parse response as text */
  text(): Promise<string>;
  /** Parse response as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * HTTP Client Port Interface
 *
 * Implement this interface to provide custom HTTP handling:
 * - Add authentication headers
 * - Add logging/metrics
 * - Use different HTTP libraries
 * - Mock for testing
 */
export interface HttpClientPort {
  /**
   * Make an HTTP request
   * @param request - Request configuration
   * @returns Promise resolving to the response
   * @throws NetworkError on connection failure
   */
  request(request: HttpRequest): Promise<HttpResponse>;
}
