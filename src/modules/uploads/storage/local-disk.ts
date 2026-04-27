import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PutResult, UploadStorage } from './types';

/**
 * Local-disk storage backend.
 *
 * Writes to `<rootDir>/<key>` (e.g. ./uploads/products/cuid.jpg) and
 * returns `<publicUrlBase>/<key>` as the URL. The express server serves
 * the rootDir at `/uploads/*` via express.static.
 *
 * Used in dev. Swap to `R2Storage` in prod by setting UPLOADS_BACKEND=r2.
 */
export class LocalDiskStorage implements UploadStorage {
  constructor(
    private readonly rootDir: string,
    private readonly publicUrlBase: string,
  ) {}

  async put(key: string, body: Buffer, _contentType: string): Promise<PutResult> {
    const target = path.join(this.rootDir, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return {
      key,
      url: `${this.publicUrlBase.replace(/\/$/, '')}/${key.replace(/^\/+/, '')}`,
    };
  }

  async delete(key: string): Promise<void> {
    const target = path.join(this.rootDir, key);
    try {
      await fs.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
