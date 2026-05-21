import { randomBytes } from 'node:crypto';
import path from 'node:path';

// 24-char URL-safe random key — cuid-shaped without the ESM-only dep.
const createId = (): string => randomBytes(12).toString('hex');
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { LocalDiskStorage } from './storage/local-disk';
import { R2Storage } from './storage/r2';
import type { UploadStorage } from './storage/types';
import { sniffImageMime } from './sniff';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const ALLOWED_FOLDERS = new Set([
  'products',
  'categories',
  'about',
  'reviews',
  'sellers',
  'avatars',
  'misc',
]);

let storageInstance: UploadStorage | null = null;
function storage(): UploadStorage {
  if (storageInstance) return storageInstance;
  if (env.UPLOADS_BACKEND === 'r2') {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET ||
      !env.R2_PUBLIC_URL_BASE
    ) {
      throw new Error(
        'UPLOADS_BACKEND=r2 but R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, or R2_PUBLIC_URL_BASE is missing.',
      );
    }
    storageInstance = new R2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicUrlBase: env.R2_PUBLIC_URL_BASE,
    });
  } else {
    storageInstance = new LocalDiskStorage(env.UPLOADS_LOCAL_DIR, env.UPLOADS_PUBLIC_URL_BASE);
  }
  return storageInstance;
}

export interface UploadInput {
  buffer: Buffer;
  mimeType: string;
  size: number;
  folder?: string;
  originalName?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  contentType: string;
  size: number;
  originalName?: string;
}

export async function uploadImage(input: UploadInput): Promise<UploadResult> {
  if (input.size > env.UPLOADS_MAX_BYTES) {
    throw HttpError.badRequest(
      `File too large (${input.size} bytes). Max ${env.UPLOADS_MAX_BYTES} bytes.`,
    );
  }

  // Phase 11.3 (audit H8): NEVER trust the client's Content-Type
  // header. Sniff the magic bytes off the buffer and use the sniffed
  // MIME both for the allowlist check and for the storage write —
  // the client header is only used as an early-fail signal.
  const sniffed = sniffImageMime(input.buffer);
  if (!sniffed) {
    throw HttpError.badRequest(
      'File contents are not a recognised image (jpeg, png, webp, avif, gif).',
    );
  }
  if (!ALLOWED_MIME.has(sniffed)) {
    throw HttpError.badRequest(
      `Unsupported image type "${sniffed}". Allowed: ${[...ALLOWED_MIME].join(', ')}.`,
    );
  }
  if (input.mimeType && input.mimeType !== sniffed) {
    // Optional but useful: log mismatch so a flood of declared-png /
    // sniffed-jpeg hits is visible in monitoring. Not fatal — we
    // already use the sniffed value.
    // (intentionally not throwing — a few legit clients mislabel.)
  }

  const folder = input.folder && ALLOWED_FOLDERS.has(input.folder) ? input.folder : 'misc';
  const ext = MIME_TO_EXT[sniffed];
  const key = `${folder}/${createId()}.${ext}`;

  const { url } = await storage().put(key, input.buffer, sniffed);

  return {
    url,
    key,
    contentType: sniffed,
    size: input.size,
    ...(input.originalName ? { originalName: path.basename(input.originalName) } : {}),
  };
}

export function deleteImage(key: string): Promise<void> {
  return storage().delete(key);
}
