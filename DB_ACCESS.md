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
SELECT section, question, answer
FROM v_piq_answer
WHERE piq_id = 'paste-a-piq-id-here'
ORDER BY question_position;
```

What's waiting on a review:

```sql
SELECT p.name, p.status, p.completion, s."companyName"
FROM "ProductPIQ" p
JOIN "SupplierProfile" s ON s.id = p."supplierId"
WHERE p.status IN ('SUBMITTED', 'UNDER_REVIEW')
ORDER BY p."updatedAt" DESC;
```

## Don't read the JSON columns directly — use the views

`answers`, `eoiAnswers` and `stageAnswers` are JSONB keyed by form field id
(`product_name`, `shelf_life`). Beekeeper shows each as one opaque cell, and the
field ids are only documented in TypeScript. Two views unpack them:

| View | One row per | Use it for |
|---|---|---|
| `v_piq_answer` | answered PIQ question | Everything about products |
| `v_supplier_answer` | answered EOI / stage-form question | Company-level answers |

Both are **long format** — a row per answer, not a column per question — so they
keep working when questions are added or removed. Answers are already rendered
as text: arrays join with ` | `, empty strings come back as `NULL`.

Question text comes from the `PIQQuestion` catalogue, mirrored from
`piq-config.ts` in afrizonemart-v2. **When that config changes**, regenerate and
put the output in a new migration:

```bash
node scripts/gen-piq-catalog.mjs      # in afrizonemart-v2
```

Everything one supplier has ever answered:

```sql
SELECT product, section, question, answer
FROM v_piq_answer
WHERE company = 'Adia Foods'
ORDER BY product, question_position;
```

Compare one answer across every supplier — the thing raw JSON makes painful:

```sql
SELECT company, product, answer AS shelf_life
FROM v_piq_answer
WHERE question_id = 'shelf_life'
ORDER BY company;
```

Required questions a product still hasn't answered:

```sql
SELECT p.name AS product, q."sectionTitle" AS section, q.label AS missing
FROM "ProductPIQ" p
CROSS JOIN "PIQQuestion" q
LEFT JOIN v_piq_answer v
       ON v.piq_id = p.id AND v.question_id = q.id AND v.answer IS NOT NULL
WHERE q.required AND v.question_id IS NULL
ORDER BY p.name, q."position";
```

Certifications claimed across the network. Multiselect answers arrive as one
` | `-joined string, so split them before counting — grouping on `answer`
directly would count `NAFDAC | SON` as its own category:

```sql
SELECT trim(cert) AS certification, count(DISTINCT company) AS suppliers
FROM v_piq_answer, unnest(string_to_array(answer, ' | ')) AS cert
WHERE question_id = 'quality_marks' AND answer IS NOT NULL
GROUP BY 1 ORDER BY suppliers DESC, certification;
```

> **Charts, or letting non-technical staff self-serve?** Beekeeper is a SQL
> client — one desktop app, one person, needs database credentials. Point
> [Metabase](https://www.metabase.com/) at these same views instead and sourcing
> or QC can build their own dashboards without SQL or a DB login. The views are
> the part that matters; either tool sits on top of them.
