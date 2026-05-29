# Cloud DB backup setup (R2 daily cron)

This is the cloud tier of the 3-2-1 backup strategy. A Railway **cron
service** runs `scripts/backup-db-cloud.mjs` daily, dumps the Postgres
DB, gzips it, and uploads to a private Cloudflare R2 bucket.

Why a separate Railway service (instead of running inside the API)?
The cron has its own container (`Dockerfile.backup`) with
`postgresql-client` so we don't bloat or risk every API deploy. It
also keeps running on schedule even if the API is mid-redeploy.

---

## One-time setup

### 1. Create the R2 backup bucket

In the Cloudflare dashboard → R2:
1. **Create a new bucket** — name it something like
   `afrizonemart-db-backups`. **Do not** reuse the product-images
   bucket; isolation is the whole point.
2. **Settings → Lifecycle rules** → add: delete objects under prefix
   `daily/` older than e.g. 90 days. (Belt-and-suspenders — the
   script also prunes via `BACKUP_KEEP_DAILY`.)
3. **R2 API Tokens** → create a new token:
   - Permissions: **Object Read & Write**
   - Specify bucket(s): **the new backup bucket only**
   - Save the **Access Key ID** + **Secret Access Key** somewhere
     safe (1Password). They show once.

### 2. Create the cron service on Railway

In the Railway dashboard → project **afrizonemart-prod**:

1. **+ New → GitHub Repo → `magnusimam/afrizonemart-api`**
2. After it creates, open the new service → **Settings**:
   - **Service name:** `backup`
   - **Source → Watch Paths:** `Dockerfile.backup` and
     `scripts/backup-db-cloud.mjs` (so deploys only fire when the
     backup code actually changes)
   - **Build → Builder:** Dockerfile
   - **Build → Dockerfile Path:** `Dockerfile.backup`
   - **Deploy → Cron Schedule:** `0 3 * * *` (3am UTC daily — pick a
     quiet hour for the DB)
   - **Deploy → Restart Policy:** `Never` (cron jobs shouldn't loop)

3. **Variables tab** — set:
   ```
   DATABASE_URL                  = ${{Postgres.DATABASE_URL}}
   R2_ACCOUNT_ID                 = <your Cloudflare account ID>
   R2_BACKUP_BUCKET              = afrizonemart-db-backups
   R2_BACKUP_ACCESS_KEY_ID       = <from step 1.3>
   R2_BACKUP_SECRET_ACCESS_KEY   = <from step 1.3>
   BACKUP_KEEP_DAILY             = 30
   ```
   `DATABASE_URL` references the Postgres service variable so you
   don't paste credentials — Railway resolves it at runtime.

4. **Deploy** the service. The first deploy builds the image; nothing
   runs until the cron tick fires.

5. **Manually trigger the first run** to verify: Railway dashboard →
   backup service → **Deploy** menu → **Trigger** (or push a tiny
   commit). Watch the logs — expect:
   ```
   [backup] starting daily DB backup → R2
   [backup] dumped X.XX MB
   [backup] upload OK
   [backup] prune complete — kept N, deleted 0, total now N
   [backup] done in Ys
   ```

6. Verify the object lands in R2 (Cloudflare dashboard → bucket →
   `daily/afrizonemart-YYYY-MM-DD_HHmm.sql.gz`).

---

## To restore from a cloud dump

Download the object from R2, then:

```bash
gunzip < afrizonemart-2026-MM-DD_HHmm.sql.gz | psql $TARGET_DATABASE_URL
```

Use a throwaway/staging DB for the first restore test — never restore
straight into prod the first time you try this. The dump is
`--no-owner --no-privileges` so it lands cleanly on any Postgres role.

---

## Cost

Negligible. A ~10 MB compressed dump × 30 retained = 300 MB stored at
R2's $0.015/GB/month = **~$0.005/month**. Class A (write) operations
are 1/day = 30/month, free under R2's 1M ops/month tier.

The cron container runs ~5–30 seconds/day on Railway — sub-cent.
