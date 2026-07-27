# Looking at the data yourself (Beekeeper Studio)

Everything a supplier fills in — the EOI form, the registration form, every
Product Information Questionnaire — lands in Postgres. This is how to open it
and read it directly, without going through the admin dashboard.

## Connect

[Beekeeper Studio](https://www.beekeeperstudio.io/) → **New Connection** →
**Postgres**:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5433` |
| Database | `afrizonemart` |
| User | `azm_readonly` |
| Password | see `.env` / ask the maintainer — **not stored in this repo** |

Save it as "Afrizonemart (read-only)".

The database runs in Docker. If the connection is refused, it isn't running:

```
docker start azm-pg
```

### Two accounts, on purpose

- **`azm_readonly`** — `SELECT` only. It physically cannot change or delete a
  row, so nothing you click by accident in a GUI can damage supplier data.
  Use this one. It is also denied access to the `ServiceToken` table, which
  holds API credential hashes.
- **`azm`** — full read-write, used by the API itself (credentials in `.env`).
  Only reach for it if you genuinely need to edit something, and prefer the
  admin dashboard over hand-editing rows.

To create or rotate the read-only role:

```sql
CREATE ROLE azm_readonly LOGIN PASSWORD '<pick-a-password>';
GRANT CONNECT ON DATABASE afrizonemart TO azm_readonly;
GRANT USAGE ON SCHEMA public TO azm_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO azm_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO azm_readonly;
REVOKE ALL ON "ServiceToken" FROM azm_readonly;
```

> When the database moves to a hosted server, generate a fresh password for the
> read-only role there rather than reusing the local one.

## Where the supplier data actually lives

| Table | What's in it |
|---|---|
| `SupplierProfile` | One row per supplier: company, contact, country, category, and `currentStage` (1–10). The spine of everything. |
| `SupplierProfile.eoiAnswers` | JSON — their original Expression of Interest answers, keyed by form field id. |
| `SupplierProfile.stageAnswers` | JSON — the journey forms, keyed by stage number: `"1"` Discovery, `"2"` EoI, `"3"` Registration. |
| `ProductPIQ` | One row per product. `status`, `completion` %, and `answers` (JSON) — the full questionnaire. |
| `ProductPIQ.feedback` / `.reviewSummary` | Reviewer notes when changes were requested. |
| `FacilityVisit` | Requested/confirmed site visits, with dates and the assigned lead. |
| `SupplierAudit` | The on-site product-commodity audit: per-checkpoint `responses`, `indicativeScore`, `outcome`, and CAPA. |
| `ReviewCall` | Stage-5 PIQ review calls — when scheduled, and reschedule state. |
| `OrientationComment` | What suppliers typed into the orientation live chat. |
| `PurchaseOrder` | Stage-9 orders issued to activated suppliers. |
| `User` | The login account behind each supplier (`SupplierProfile.userId` → `User.id`). Passwords are hashed. |
| `Notification` | Every transactional email sent, with delivery status. |
| `ServiceToken` | Hashed API credentials for machine consumers. Not readable by `azm_readonly`. |

### Useful starting queries

The whole pipeline at a glance:

```sql
SELECT "currentStage", count(*)
FROM "SupplierProfile"
GROUP BY "currentStage"
ORDER BY "currentStage";
```

Suppliers with their email and product count:

```sql
SELECT s."companyName", u.email, s."currentStage", count(p.id) AS products
FROM "SupplierProfile" s
JOIN "User" u ON u.id = s."userId"
LEFT JOIN "ProductPIQ" p ON p."supplierId" = s.id
GROUP BY s."companyName", u.email, s."currentStage"
ORDER BY s."companyName";
```

Read one product's questionnaire answers as readable rows:

```sql
SELECT key AS question_id, value AS answer
FROM "ProductPIQ", jsonb_each_text(answers::jsonb)
WHERE "ProductPIQ".id = 'paste-a-piq-id-here';
```

What's waiting on a review:

```sql
SELECT p.name, p.status, p.completion, s."companyName"
FROM "ProductPIQ" p
JOIN "SupplierProfile" s ON s.id = p."supplierId"
WHERE p.status IN ('SUBMITTED', 'UNDER_REVIEW')
ORDER BY p."updatedAt" DESC;
```

The JSON columns (`answers`, `eoiAnswers`, `stageAnswers`) are keyed by form
field ids like `product_name` or `shelf_life`. Beekeeper renders them as JSON —
click a cell to expand it.
