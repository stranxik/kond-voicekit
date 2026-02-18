/**
 * Model Cache - IndexedDB storage for ONNX models
 *
 * Caches ONNX models in IndexedDB to avoid re-downloading on every page load.
 * The turn-detector model is ~100-150MB, so caching is critical for UX.
 */

const DB_NAME = "voicekit-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";

/**
 * Metadata stored alongside model data
 */
export interface ModelMetadata {
  /** Model identifier (e.g., "turn-detector-q8") */
  modelId: string;
  /** Model version for cache invalidation */
  version: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Timestamp when cached */
  cachedAt: number;
  /** Source URL */
  sourceUrl: string;
}

/**
 * Stored model entry in IndexedDB
 */
interface StoredModel {
  modelId: string;
  data: ArrayBuffer;
  metadata: ModelMetadata;
}

/**
 * Model Cache using IndexedDB
 *
 * Provides persistent storage for ONNX models to enable:
 * - Fast subsequent loads (~100ms vs ~10s download)
 * - Offline capability after first load
 * - Automatic cache invalidation via version
 */
export class ModelCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Initialize the IndexedDB connection
   * Safe to call multiple times - will only open once
   */
  async init(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.isInitialized && this.db) {
      return;
    }

    this.initPromise = this.openDatabase();
    await this.initPromise;
  }

  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check IndexedDB availability
      if (typeof indexedDB === "undefined") {
        console.warn("[ModelCache] IndexedDB not available");
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn("[ModelCache] Failed to open database:", request.error);
        // Don't reject - cache is optional, app can work without it
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "modelId" });
          // Index for version-based cache invalidation
          store.createIndex("version", "metadata.version", { unique: false });
        }
      };
    });
  }

  /**
   * Get a cached model by ID
   *
   * @param modelId - Unique model identifier
   * @param expectedVersion - Optional version for cache validation
   * @returns Model ArrayBuffer or null if not cached/outdated
   */
  async getModel(modelId: string, expectedVersion?: string): Promise<ArrayBuffer | null> {
    await this.init();

    if (!this.db) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(modelId);

        request.onerror = () => {
          console.warn("[ModelCache] Failed to get model:", request.error);
          resolve(null);
        };

        request.onsuccess = () => {
          const result = request.result as StoredModel | undefined;

          if (!result) {
            resolve(null);
            return;
          }

          // Version check for cache invalidation
          if (expectedVersion && result.metadata.version !== expectedVersion) {
            console.log(
              `[ModelCache] Version mismatch for ${modelId}: cached=${result.metadata.version}, expected=${expectedVersion}`
            );
            resolve(null);
            return;
          }

          resolve(result.data);
        };
      } catch (error) {
        console.warn("[ModelCache] Error reading model:", error);
        resolve(null);
      }
    });
  }

  /**
   * Store a model in the cache
   *
   * @param modelId - Unique model identifier
   * @param buffer - Model data
   * @param metadata - Model metadata (version, source URL, etc.)
   */
  async setModel(
    modelId: string,
    buffer: ArrayBuffer,
    metadata: Omit<ModelMetadata, "modelId" | "sizeBytes" | "cachedAt">
  ): Promise<void> {
    await this.init();

    if (!this.db) {
      console.warn("[ModelCache] Database not available, skipping cache");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const entry: StoredModel = {
          modelId,
          data: buffer,
          metadata: {
            ...metadata,
            modelId,
            sizeBytes: buffer.byteLength,
            cachedAt: Date.now(),
          },
        };

        const request = store.put(entry);

        request.onerror = () => {
          console.warn("[ModelCache] Failed to store model:", request.error);
          // Don't reject - caching is optional
          resolve();
        };

        request.onsuccess = () => {
          console.log(
            `[ModelCache] Cached model ${modelId} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`
          );
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error storing model:", error);
        resolve();
      }
    });
  }

  /**
   * Check if a model exists in cache
   *
   * @param modelId - Model identifier
   * @param expectedVersion - Optional version check
   * @returns True if model is cached (and version matches if specified)
   */
  async hasModel(modelId: string, expectedVersion?: string): Promise<boolean> {
    const model = await this.getModel(modelId, expectedVersion);
    return model !== null;
  }

  /**
   * Delete a model from cache
   *
   * @param modelId - Model identifier
   */
  async deleteModel(modelId: string): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(modelId);

        request.onerror = () => {
          console.warn("[ModelCache] Failed to delete model:", request.error);
          resolve();
        };

        request.onsuccess = () => {
          console.log(`[ModelCache] Deleted model ${modelId}`);
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error deleting model:", error);
        resolve();
      }
    });
  }

  /**
   * Clear all cached models
   */
  async clear(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => {
          console.warn("[ModelCache] Failed to clear cache:", request.error);
          resolve();
        };

        request.onsuccess = () => {
          console.log("[ModelCache] Cache cleared");
          resolve();
        };
      } catch (error) {
        console.warn("[ModelCache] Error clearing cache:", error);
        resolve();
      }
    });
  }

  /**
   * Get cache metadata for all stored models
   */
  async getMetadata(): Promise<ModelMetadata[]> {
    await this.init();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = () => {
          console.warn("[ModelCache] Failed to get metadata:", request.error);
          resolve([]);
        };

        request.onsuccess = () => {
          const entries = request.result as StoredModel[];
          resolve(entries.map((e) => e.metadata));
        };
      } catch (error) {
        console.warn("[ModelCache] Error getting metadata:", error);
        resolve([]);
      }
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }
}

/**
 * Singleton instance for convenience
 */
let defaultCache: ModelCache | null = null;

export function getModelCache(): ModelCache {
  if (!defaultCache) {
    defaultCache = new ModelCache();
  }
  return defaultCache;
}
