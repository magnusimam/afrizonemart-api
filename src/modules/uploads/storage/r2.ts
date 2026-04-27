import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PutResult, UploadStorage } from './types';

/**
 * Cloudflare R2 storage backend.
 *
 * R2 speaks the S3 API. We use `@aws-sdk/client-s3` pointed at R2's
 * `https://<account-id>.r2.cloudflarestorage.com` endpoint with R2-issued
 * access keys. The bucket itself is served publicly via either:
 *   - a custom domain (recommended: `images.afrizonemart.com`), or
 *   - R2's `<bucket>.<account>.r2.dev` URL (fine for testing).
 *
 * `publicUrlBase` is whatever URL prefix returns the object — we just
 * concatenate `<base>/<key>`.
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrlBase: string;
}

export class R2Storage implements UploadStorage {
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor(cfg: R2Config) {
    this.bucket = cfg.bucket;
    this.publicUrlBase = cfg.publicUrlBase.replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // 1-year browser cache; objects are immutable (cuid keys).
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return {
      key,
      url: `${this.publicUrlBase}/${key.replace(/^\/+/, '')}`,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
