/**
 * Object storage abstraction. Phase 0 uses an in-memory stub for tests and a
 * Cloudflare R2 binding in the deployed Worker; both implement this interface so
 * the service code is storage-agnostic (Requirement 5, spec task 10.1).
 */
export interface ObjectStorage {
  /** Store bytes under a key; return the public URL to serve them (via CDN). */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

/** In-memory storage for tests. Records puts/deletes; returns a fake public URL. */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  constructor(private readonly publicBaseUrl = 'https://cdn.test/media') {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    this.objects.set(key, { bytes, contentType });
    return `${this.publicBaseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
