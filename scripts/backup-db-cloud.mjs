#!/usr/bin/env node
/**
 * Daily cloud DB backup → Cloudflare R2.
 *
 * Designed to run as a Railway "cron service" pointed at this same
 * repo via `Dockerfile.backup`. Runs once per cron tick, then exits.
 *
 * The cloud tier of the 3-2-1 strategy:
 *   • Railway native snapshot   → "I broke prod" (managed by Railway)
 *   • THIS — R2 cloud dump      → "Railway is gone"
 *   • Local script (backup-db-local.ps1) → "internet + accounts gone"
 *
 * Why a separate R2 bucket (not the product-images bucket)?
 *   Blast-radius isolation. If the app's R2 credentials are leaked or
 *   compromised, the attacker can't reach the backups. Even better:
 *   issue a dedicated R2 API token scoped to JUST this backup bucket,
 *   and consider write-only permissions so the cron can put but not
 *   list/get — old dumps get pruned via a Cloudflare lifecycle rule
 *   instead of code.
 *
 * Required env vars:
 *   DATABASE_URL              — Railway Postgres (use the internal URL)
 *   R2_ACCOUNT_ID             — Cloudflare account ID
 *   R2_BACKUP_BUCKET          — separate bucket, NOT the images one
 *   R2_BACKUP_ACCESS_KEY_ID
 *   R2_BACKUP_SECRET_ACCESS_KEY
 *
 * Optional:
 *   BACKUP_KEEP_DAILY         — how many recent dumps to keep (default 30)
 *
 * Exits 0 on success, non-zero on failure (so Railway logs surface it).
 */
import { spawn } from 'node:child_process';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const REQUIRED = [
  'DATABASE_URL',
  'R2_ACCOUNT_ID',
  'R2_BACKUP_BUCKET',
  'R2_BACKUP_ACCESS_KEY_ID',
  'R2_BACKUP_SECRET_ACCESS_KEY',
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[backup] missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const KEEP = Number.parseInt(process.env.BACKUP_KEEP_DAILY ?? '30', 10);
if (!Number.isFinite(KEEP) || KEEP < 1) {
  console.error('[backup] BACKUP_KEEP_DAILY must be a positive integer');
  process.exit(1);
}

/// Build the key from a timestamp so two dumps in the same minute
/// don't overwrite each other. `daily/` prefix lets us list cleanly
/// for pruning.
function buildKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `daily/afrizonemart-${stamp}.sql.gz`;
}

/// Run pg_dump and buffer the gzipped output. Stays in memory because
/// the catalog is small (~MBs). If the DB grows past ~100 MB, switch
/// to streaming the multipart upload via @aws-sdk/lib-storage.
function pgDumpToBuffer(databaseUrl) {
  return new Promise((resolve, reject) => {
    /// --no-owner / --no-privileges → portable dump. Restorable on
    /// any Postgres without matching role names.
    const args = [
      '--format=plain',
      '--compress=9',
      '--no-owner',
      '--no-privileges',
      databaseUrl,
    ];
    const proc = spawn('pg_dump', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    const stderrChunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => stderrChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        const err = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 500)}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

/// Prune objects in `daily/` to the last KEEP. Sort by LastModified
/// desc, delete the tail. Uses ListObjectsV2 with continuation so it
/// scales past 1000 objects (we'll never hit that, but harmless).
async function pruneOldDumps(s3, bucket, keep) {
  /** @type {Array<{Key:string, LastModified?:Date}>} */
  const all = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'daily/',
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) all.push({ Key: o.Key, LastModified: o.LastModified });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  all.sort((a, b) => {
    const at = a.LastModified?.getTime() ?? 0;
    const bt = b.LastModified?.getTime() ?? 0;
    return bt - at;
  });
  const toDelete = all.slice(keep);
  for (const obj of toDelete) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    console.log(`[backup] pruned ${obj.Key}`);
  }
  return { total: all.length, deleted: toDelete.length, kept: all.length - toDelete.length };
}

async function main() {
  const started = Date.now();
  console.log('[backup] starting daily DB backup → R2');

  console.log('[backup] pg_dump streaming…');
  const buf = await pgDumpToBuffer(process.env.DATABASE_URL);
  if (buf.length < 1024) {
    throw new Error(`pg_dump produced only ${buf.length} bytes — refusing to upload`);
  }
  const mb = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`[backup] dumped ${mb} MB`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_BACKUP_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_BACKUP_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.R2_BACKUP_BUCKET;
  const key = buildKey();

  console.log(`[backup] uploading to s3://${bucket}/${key}`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
    }),
  );
  console.log('[backup] upload OK');

  console.log('[backup] pruning old dumps…');
  const prune = await pruneOldDumps(s3, bucket, KEEP);
  console.log(
    `[backup] prune complete — kept ${prune.kept}, deleted ${prune.deleted}, total now ${prune.kept}`,
  );

  const took = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[backup] done in ${took}s`);
}

main().catch((err) => {
  console.error('[backup] FAILED:', err?.message ?? err);
  process.exit(1);
});
