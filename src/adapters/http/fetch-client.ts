/**
 * Fetch HTTP Client Adapter
 *
 * Default implementation of HttpClientPort using the Fetch API.
 * Works in browsers and modern Node.js (18+).
 */

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../ports/http-client";

/**
 * Configuration for FetchHttpClient
 */
export interface FetchHttpClientConfig {
  /** Base URL to prepend to relative URLs */
  baseUrl?: string;
  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>;
  /** Default credentials mode */
  credentials?: RequestCredentials;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Default HTTP client using the Fetch API
 */
export class FetchHttpClient implements HttpClientPort {
  private config: FetchHttpClientConfig;

  constructor(config: FetchHttpClientConfig = {}) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    // Build full URL
    const url = this.buildUrl(req.url);

    // Merge headers
    const headers: Record<string, string> = {
      ...this.config.defaultHeaders,
      ...req.headers,
    };

    // Add Content-Type for JSON body
    if (req.body && typeof req.body === "object" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Build body
    let body: string | undefined;
    if (req.body !== undefined) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.config.timeout);

    // Combine with user signal if provided
    const signal = req.signal
      ? this.combineSignals(req.signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body,
        signal,
        credentials: req.credentials ?? this.config.credentials,
      });

      clearTimeout(timeoutId);

      return this.wrapResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private buildUrl(url: string): string {
    // If URL is absolute, use as-is
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    // If we have a base URL, prepend it
    if (this.config.baseUrl) {
      const base = this.config.baseUrl.endsWith("/")
        ? this.config.baseUrl.slice(0, -1)
        : this.config.baseUrl;
      const path = url.startsWith("/") ? url : `/${url}`;
      return `${base}${path}`;
    }
    // Return as-is (relative URL)
    return url;
  }

  private wrapResponse(response: Response): HttpResponse {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      json: <T>() => response.json() as Promise<T>,
      text: () => response.text(),
      arrayBuffer: () => response.arrayBuffer(),
    };
  }

  private combineSignals(userSignal: AbortSignal, timeoutSignal: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const abort = () => controller.abort();

    userSignal.addEventListener("abort", abort, { once: true });
    timeoutSignal.addEventListener("abort", abort, { once: true });

    // If either is already aborted, abort immediately
    if (userSignal.aborted || timeoutSignal.aborted) {
      controller.abort();
    }

    return controller.signal;
  }
}

/**
 * Create a FetchHttpClient instance
 */
export function createFetchHttpClient(config?: FetchHttpClientConfig): FetchHttpClient {
  return new FetchHttpClient(config);
}
