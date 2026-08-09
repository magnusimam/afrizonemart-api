/**
 * Storage backend interface for the uploads module.
 *
 * The HTTP layer never touches the storage backend directly — it goes
 * through the service which picks an implementation based on env.
 * Adding a new backend (R2, S3, GCS, Azure) is a matter of writing a
 * new class that implements this interface and wiring it in
 * `service.ts`.
 */
export interface PutResult {
  url: string;
  key: string;
}

export interface UploadStorage {
  /**
   * Persist a buffer under the given key and return the publicly-
   * accessible URL. `contentDisposition` is optional — set it to
   * `attachment; filename="..."` so a plain `<a href>` reliably
   * force-downloads instead of navigating inline (browsers don't
   * consistently honor the `download` attribute cross-origin).
   */
  put(
    key: string,
    body: Buffer,
    contentType: string,
    contentDisposition?: string,
  ): Promise<PutResult>;

  /** Remove a previously-stored object. No-op if it doesn't exist. */
  delete(key: string): Promise<void>;
}
