/**
 * Upload the Stage-5 orientation recording to Cloudflare R2.
 *
 *   npx tsx scripts/upload-orientation-video.ts              (dry run)
 *   npx tsx scripts/upload-orientation-video.ts --commit
 *   npx tsx scripts/upload-orientation-video.ts --commit --file=./video/x.mp4
 *
 * Why this exists: `/video/` is gitignored, so the recording never reaches the
 * Railway deploy. In production `/api/orientation/video` therefore 404s and
 * Stage 5 shows no video at all. Setting ORIENTATION_VIDEO_URL to a public R2
 * URL bypasses that route entirely (orientation.service.ts:43).
 *
 * Multipart, streamed a part at a time: the file is ~708 MB and the existing
 * R2Storage.put() takes a whole Buffer, which would mean holding the entire
 * recording in memory. Written against @aws-sdk/client-s3 directly rather than
 * pulling in @aws-sdk/lib-storage for one script.
 *
 * The key is stable rather than content-hashed, so re-uploading a corrected
 * recording keeps the same URL and ORIENTATION_VIDEO_URL never has to change.
 * That is also why the cache is a week rather than the immutable year used for
 * cuid-keyed uploads: a replaced object has to be able to win eventually.
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { env } from '@/config/env';

const COMMIT = process.argv.includes('--commit');
const fileArg = process.argv.find((a) => a.startsWith('--file='));

/** R2 requires every part except the last to be >= 5 MiB. 64 MiB keeps the
 *  part count low (~12 for 708 MB) without a large memory footprint. */
const PART_SIZE = 64 * 1024 * 1024;

const KEY = 'orientation/afrizonemart-supplier-orientation.mp4';

function requireR2() {
  const missing = (
    [
      ['R2_ACCOUNT_ID', env.R2_ACCOUNT_ID],
      ['R2_ACCESS_KEY_ID', env.R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', env.R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET', env.R2_BUCKET],
      ['R2_PUBLIC_URL_BASE', env.R2_PUBLIC_URL_BASE],
    ] as const
  ).filter(([, v]) => !v);
  if (missing.length) {
    console.error('Missing R2 configuration:');
    for (const [name] of missing) console.error(`   ${name}`);
    process.exit(1);
  }
}

/** Read exactly one part off disk. A stream per part keeps peak memory at
 *  PART_SIZE rather than the size of the file. */
function readPart(file: string, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    createReadStream(file, { start, end })
      .on('data', (c) => chunks.push(c as Buffer))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const file = path.resolve(
    process.cwd(),
    fileArg ? fileArg.slice('--file='.length) : env.ORIENTATION_VIDEO_PATH,
  );

  if (!existsSync(file)) {
    console.error(`No file at ${file}`);
    console.error('Pass --file=./path/to/video.mp4 if it lives elsewhere.');
    process.exit(1);
  }

  requireR2();

  const size = statSync(file).size;
  const parts = Math.ceil(size / PART_SIZE);
  const publicUrl = `${env.R2_PUBLIC_URL_BASE!.replace(/\/$/, '')}/${KEY}`;

  console.log(`File     ${file}`);
  console.log(`Size     ${mb(size)} in ${parts} part(s)`);
  console.log(`Bucket   ${env.R2_BUCKET}`);
  console.log(`Key      ${KEY}`);
  console.log(`URL      ${publicUrl}`);

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing uploaded. Add --commit to upload.)');
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: env.R2_BUCKET!,
      Key: KEY,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=604800',
    }),
  );
  const uploadId = created.UploadId!;
  console.log(`\nMultipart upload started (${uploadId.slice(0, 12)}…)`);

  const completed: { ETag: string; PartNumber: number }[] = [];
  try {
    for (let i = 0; i < parts; i++) {
      const start = i * PART_SIZE;
      const end = Math.min(start + PART_SIZE, size) - 1;
      const body = await readPart(file, start, end);

      const res = await client.send(
        new UploadPartCommand({
          Bucket: env.R2_BUCKET!,
          Key: KEY,
          UploadId: uploadId,
          PartNumber: i + 1,
          Body: body,
        }),
      );
      completed.push({ ETag: res.ETag!, PartNumber: i + 1 });
      const pct = (((i + 1) / parts) * 100).toFixed(0);
      console.log(`   part ${i + 1}/${parts}  ${mb(body.length)}  ${pct}%`);
    }

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: env.R2_BUCKET!,
        Key: KEY,
        UploadId: uploadId,
        MultipartUpload: { Parts: completed },
      }),
    );
  } catch (err) {
    // An abandoned multipart upload keeps billing for its parts, so clean up
    // rather than leaving orphans behind on a failed run.
    console.error(`\nUpload failed: ${(err as Error).message}`);
    await client
      .send(
        new AbortMultipartUploadCommand({
          Bucket: env.R2_BUCKET!,
          Key: KEY,
          UploadId: uploadId,
        }),
      )
      .catch(() => undefined);
    process.exit(1);
  }

  // Read it back from R2 itself: a successful PUT is not proof the object is
  // retrievable at the size we think it is.
  const head = await client.send(
    new HeadObjectCommand({ Bucket: env.R2_BUCKET!, Key: KEY }),
  );
  console.log(`\nUploaded. R2 reports ${mb(head.ContentLength ?? 0)} (${head.ContentType}).`);
  if (head.ContentLength !== size) {
    console.error(`⚠ Size mismatch — local ${size}, remote ${head.ContentLength}.`);
    process.exit(1);
  }

  console.log('\nSet this on the Railway api service:');
  console.log(`   ORIENTATION_VIDEO_URL=${publicUrl}`);
  console.log(
    '\nThen check the public URL serves it, and that a Range request works\n' +
      '(the player seeks to sync with the "live" position):\n' +
      `   curl -sI "${publicUrl}" | head -5\n` +
      `   curl -s -o /dev/null -w "%{http_code}\\n" -H "Range: bytes=0-1023" "${publicUrl}"\n` +
      '   → expect 200 then 206.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
