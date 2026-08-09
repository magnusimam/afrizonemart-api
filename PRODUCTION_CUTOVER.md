# Supplier Portal — Production Cutover Runbook

Everything needed to take the supplier portal live. Work top to bottom; each
step says **who** does it and whether it's blocking.

> Status legend: ✅ ready · ⏳ needs an input/decision · �︎ Magnus / out of supplier scope

---

## 1. Environment variables (prod API)

Set these on the production API before anything else.

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | prod Postgres | — |
| `JWT_SECRET` | strong secret | **not** the dev value |
| `WEB_URL` | `https://afrizonemart.com` (storefront) | used in all email links (set-password, dashboard, calendar) — must be the real domain or invites/links break |
| `API_PUBLIC_URL` | `https://api.afrizonemart.com` | base for the orientation video stream fallback |
| `CORS_ORIGINS` | include the prod web origin | — |
| `RESEND_API_KEY` | prod key | ⏳ confirm; emails fall back to Console provider if unset |
| `EMAIL_FROM` | `Afrizonemart <no-reply@afrizonemart.com>` | domain must be verified in Resend |
| `ORIENTATION_LIVE_HOUR_UTC` | `20` | 21:00 WAT = 9 PM WAT |
| `ORIENTATION_JOIN_WINDOW_MINS` | `20` | join window |
| `ORIENTATION_VIDEO_URL` | CDN/R2 URL of the recording | ⏳ host the 708 MB mp4 off-box; if unset the API streams the local file (dev only) |

The dev `.env` currently carries the correct orientation values (20 / 20).

---

## 2. Database migration  ✅ (fixed 2026-08-08)

**Do not run `prisma db push` on prod.** `npx prisma migrate deploy` is now the
correct and only command; Railway already runs it in `railway.toml`'s
`startCommand`.

The history had drifted badly — several models (`User.permissions`, the `STAFF`
role, the CMS/blog tables, `ServiceToken`, and all six supplier models) reached
dev *and prod* through `db push` and were never captured as migrations. A
from-scratch `migrate deploy` failed at
`20260511150000_grant_interns_products_write`, earlier than the `brand_logo`
problem previously recorded here. Three changes fixed it:

1. `20260505120000_add_job_title_to_user` — backfills the `STAFF` enum value and
   `User.permissions[]` that `db push` had added invisibly.
2. `20260505160000_brand_logo` — a hand-patch had recreated
   `ProductImageSubmission` in its *final* shape, including `payoutId`, which
   made `20260518120000_intern_payouts` fail with "column already exists" on a
   fresh database. The table is now created in its true historical shape.
3. `20260808000000_supplier_portal_cms_service_tokens` — new. Creates the 13
   drifted tables, 8 enums, `Product.assignedInternId`, and drops the stale
   `Order_deliveryOtp_idx`.

Editing the two historical files is safe for prod: `migrate deploy` does not
verify checksums of migrations already recorded as applied (verified
empirically), and it will not re-run them.

Every statement in the new migration is **idempotent** (`IF NOT EXISTS`, plus
`DO $$ … EXCEPTION WHEN duplicate_object` for enums and foreign keys). This
matters because prod already has the CMS/blog/`ServiceToken` tables but not the
supplier ones — and `startCommand` chains with `&&`, so one "already exists"
error would stop the API from booting at all.

Verified against Postgres 3 ways: fresh database (54 historical + 1 new all
apply, then `migrate diff` reports *No difference detected*), full re-run on an
already-complete database (no errors), and a prod-shaped database with CMS
present and supplier absent (creates only what's missing, ends with zero drift).
The API was then booted against the migration-built database and the whole
supplier journey exercised — register → apply → stage save → PIQ create →
submit → `UNDER_REVIEW`.

> Local dev note: the dev database has **no `_prisma_migrations` table at all**
> (it was built entirely by `db push`), which is why none of this surfaced
> sooner. It keeps working as-is. To put it on the migration history, baseline
> it with `npx prisma migrate resolve --applied <name>` for each migration
> rather than running `deploy` against it.

---

## 3. Deploy the API + web  ✅ build / �︎ infra
- API: `npm ci && npm run build && npm run start` (or container). `npm run build`
  must pass (`tsc && tsc-alias`).
- Web (afrizonemart-v2): standard Next 14 build/deploy.
- Smoke: `GET /api/health` → 200.

---

## 4. Staff access — scoped, not ADMIN  ✅
Do **not** use `make-admin`. Grant each department only its capability:

```
npm run grant-supplier-caps -- sourcing@afrizonemart.com suppliers.review
npm run grant-supplier-caps -- visits@afrizonemart.com  suppliers.visits
npm run grant-supplier-caps -- qc@afrizonemart.com      suppliers.audit
npm run grant-supplier-caps -- procurement@afrizonemart.com suppliers.trade
# or everything for a portal lead:
npm run grant-supplier-caps -- lead@afrizonemart.com    all
```

- `suppliers.review` → Supplier PIQs + Orientation & calls pages
- `suppliers.visits` → Facility visits page
- `suppliers.audit`  → Product audits page
- `suppliers.trade`  → Activation & trade (publish listings + purchase orders)

**Revert the test hack:** `adia@adiafoods.ng` was promoted to ADMIN for dev
testing. On prod, ensure that account is a normal supplier:
`npm run make-admin -- adia@adiafoods.ng CUSTOMER` (or don't create it at all).

---

## 5. Bulk-import the existing EOI/PIQ suppliers  ✅ (run on prod)
Run from the **prod** environment so generated set-password links + invite
emails point at the real domain.

```
# 1. Dry run — review the report, no writes
npx tsx scripts/import-suppliers.ts
#    → data/imports/dry-run-report.csv, manual-skip.csv, verify-overmerge.csv

# 2. Commit the IMPORT bucket
npx tsx scripts/import-suppliers.ts --commit

# 3. Invites — dry run first
npx tsx scripts/invite-suppliers.ts
#    test a single address end to end:
npx tsx scripts/invite-suppliers.ts --commit --only=you@afrizonemart.com
#    then send all:
npx tsx scripts/invite-suppliers.ts --commit
```

`data/imports/` holds supplier PII and is git-ignored — copy the CSVs to the
prod box out of band; don't commit them.

---

## 6. Orientation video  ⏳
Upload the recording to R2/CDN and set `ORIENTATION_VIDEO_URL`. The chat
transcript is already baked into the web build
(`src/lib/supplier/orientation-chat.ts`). Verify the room renders at 21:00 WAT.

---

## 7. Post-cutover smoke checklist
- [ ] Existing AZM account logs in → supplier dashboard (if it has a profile)
- [ ] A new maker can Apply → account created + signed in
- [ ] Imported supplier uses set-password link → sets password → sees their stage + products
- [ ] PIQ submit → acknowledgement email; admin approve/request-changes → email
- [ ] Facility visit request → admin confirm → email + supplier sees CONFIRMED
- [ ] Review call: admin schedule → email + calendar links; reschedule blocked <24h
- [ ] Orientation goes live 21:00 WAT; comment posts → admin sees it
- [ ] Audit: admin completes a category template → score/outcome → email → supplier report + PDF
- [ ] All transactional emails show as SENT in `/admin/notifications`

---

## 8. Known follow-ups (not blocking launch)
- ⏳ **Drive → R2 image migration** — **tool built**: `npm run migrate-drive-images`
  (dry-run default; `--commit`; `--limit=N`). Deep-walks supplier `eoiAnswers`/
  `stageAnswers` + PIQ `answers`, downloads each Drive file, re-hosts via the
  uploads service (→ R2 when `UPLOADS_BACKEND=r2`), and rewrites the stored URL.
  Dry-run found **868 links** (63 suppliers + 91 PIQs). **Blocked on source
  access**: the Google Forms uploads are private (the public-download probe
  returns Google's HTML access page), so to run it you must EITHER
    (a) share the Form's responses Drive folder as "anyone with the link", OR
    (b) set `GDRIVE_TOKEN` to an OAuth / service-account access token with
        `drive.readonly` (the script then pulls via the Drive API).
  Plus set the R2 envs for the destination. Report → `data/imports/drive-migration-report.csv`.
  **Run 1 (2026-06-21):** R2 wired + verified (uploads + public serve at
  images.afrizonemart.com). **229 images migrated to R2; 78 PIQs updated.**
  629 failed, almost all because their Drive folder wasn't shared: the EOI
  `product_images` folder + the PIQ `promo_materials` / `certification_docs` /
  `efficacy_upload` / `toxicology_upload` question-folders (each Google Forms
  file-upload question is its OWN sub-folder). **To finish: share BOTH forms'
  top-level "(File responses)" folders as "anyone with the link" so it cascades
  to every question sub-folder, then re-run `--commit`** (it only retries the
  links still on Drive). The tool now also re-hosts non-images (PDF certs/tox/
  efficacy via raw passthrough) and oversized/HEIC originals, so the re-run
  captures documents too. NOTE: switching `UPLOADS_BACKEND=r2` makes ALL uploads
  (listing photos, admin product images) go to R2.
- ⏳ **Stages 8/9/10 live** — Activation/Listing, Trade Engagement, Continuous
  need real listing + purchase-order data from the commerce side.
- 🔪 **Delete dev-only seed** `scripts/seed-supplier.ts` test account before/after launch as desired.
- ⏳ **Orientation = one-time live gate** (deferred per request): once a supplier
  watches the orientation through and clicks **Mark orientation complete**, the
  live/countdown should no longer be accessible — Stage 5 should show only
  "Orientation complete · move to next" (it's a live, no re-watching). Wire this
  at production: in `Stage5Orientation`, gate the Step-2 webinar on the Stage-5
  completion flag (already fetched by `OrientationComplete`) so a completed
  supplier never re-enters the room.

---

## 9. Machine access — B.I.L.L.I.E. (added 2026-07-27)

The voice assistant reads the supplier network over `/api/billie` using a
**service token**, not a user login (the 15-minute access token + httpOnly
refresh cookie doesn't suit a daemon).

- Mint on prod: `npx tsx scripts/create-service-token.ts --name=billie-voice-assistant --scopes=suppliers.read`
- The plaintext token prints **once**. Put it in Billie's environment as
  `AFRIZONEMART_BILLIE_TOKEN`; set `AFRIZONEMART_BASE_URL` to the prod API.
- Read-only by default: any non-GET is refused at the middleware, before the
  route runs. Rotate by re-running the same command; revoke with `--revoke`.
- Capability manifest for Billie's `capabilities/` dir: `afrizonemart-suppliers.md`.

## 10. Pre-deploy items closed (2026-07-27)

- ✅ **§8 one-time orientation gate** — done. A supplier who has completed
  Stage 5 can no longer re-enter the live room.
- ✅ **Stage locking** — `StageAccessGate` and the journey map now actually
  block stages beyond `currentStage` (they previously did not, despite being
  documented as done).
- ✅ **Demo auth backdoors removed** from the web app (`demo@azm.com` login
  bypass + `DEMO_SUPPLIER` profile). These were uncommitted local edits.
- ✅ **Dev seed scripts** (`seed-supplier`, `seed-amineru`) now refuse to run
  when `NODE_ENV=production` — they create accounts with a password published
  in the source. Deleting them entirely is still the cleaner endgame.
- ⏳ **Still open:** `adia@adiafoods.ng` remains role ADMIN from dev testing
  (§4), the Drive→R2 re-run needs the two Forms folders shared (§8), and
  `RESEND_API_KEY` is unset so invites currently log to console rather than
  send.

### Database read access (for humans)
`azm_readonly` — a SELECT-only Postgres role, denied the `ServiceToken` table —
is set up for Beekeeper Studio. Connection details and a table-by-table guide
to where form answers live: `DB_ACCESS.md`. Create a fresh password for this
role on the production database; don't carry the local one over.
