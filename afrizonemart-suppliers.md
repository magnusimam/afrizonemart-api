---
name: afrizonemart-suppliers
kind: tool
status: live
summary: >
  Read-only view of the Afrizonemart supplier network — who the suppliers are,
  where each sits in the 10-stage onboarding journey, their products, audits,
  visits and purchase orders; use for any question about supplier onboarding
  status, pipeline health, or what is waiting on Divine's review.
access: read-only
base_url: http://localhost:4000
auth: bearer-token
credential: AFRIZONEMART_BILLIE_TOKEN
long_running: false
owner: Divine Itu
repo: https://github.com/Divineitu/afrizonemart-api
---

# Afrizonemart Supplier Network

> Example responses below are real shapes captured from the running service,
> with personal contact details replaced by placeholders. The live endpoints
> return real values in those fields — see "What Billie must never do".

## What it is

Afrizonemart is an African commerce platform. Behind the storefront sits a
**supplier network**: makers and manufacturers who are taken through a
structured 10-stage onboarding journey before their products go live.

This capability is a read-only window onto that network — the same data the
supplier portal and the AZM admin dashboard run on, served straight from the
API.

The 10 stages, in order:

1. Discovery · 2. Expression of Interest · 3. Registration & Profiling ·
4. Product Questionnaire (PIQ) · 5. Orientation · 6. Product Audit ·
7. Partnership · 8. Activation & Listing · 9. Trade Engagement ·
10. Continuous Engagement

A supplier sits at exactly one stage. Products (PIQs) move separately through
`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REVISION_REQUIRED | REJECTED`.

## Why it exists

Onboarding a supplier used to be email, spreadsheets and phone calls. The
portal automated it, which means the status of all 85 suppliers now lives in
one database instead of in Divine's head.

The bottleneck that remains is *knowing where things stand* without opening a
laptop and clicking through an admin dashboard. That is what this is for: so he
can ask, out loud, "how many products are waiting on me" or "where is Amineru
Foods" and get a straight answer.

Reach for this whenever the question is about **suppliers, onboarding
progress, product questionnaires, facility visits, product audits, or purchase
orders**. It is not the storefront — it knows nothing about shoppers, their
orders, payments, or the catalogue buyers browse.

## What Billie can do with it

- "How's the supplier network doing?" / "Give me the pipeline" → `GET /api/billie/overview`
- "What's waiting on my review?" → `GET /api/billie/overview` (read `actionQueue`) or `GET /api/billie/products?status=SUBMITTED`
- "Where is AB'S Menu?" / "Look up Amineru Foods" → `GET /api/billie/suppliers?query=amineru`
- "Tell me everything about that supplier" → `GET /api/billie/suppliers/{id}`
- "Who's at the audit stage?" → `GET /api/billie/suppliers?stage=6`
- "Which products need changes?" → `GET /api/billie/products?status=REVISION_REQUIRED`

Read a supplier's `stageName`, not their raw `stage` number — "Product
Questionnaire" means something out loud; "4" does not.

## What Billie must never do

- **Never approve, reject, or request changes on a PIQ.** Reviewing a product
  is a commercial judgement with a supplier's livelihood attached, and it fires
  an email to them the moment it happens. The token physically cannot do it
  (read-only, and no such endpoint is exposed here) — do not go looking for
  another route that can.
- **Never advance or move a supplier's stage.** Same reason: stage changes send
  transactional email and are visible to the supplier immediately.
- **Never read supplier contact details aloud in a shared or public setting**
  unless Divine explicitly asks. `email` and `phone` on the detail endpoint are
  personal data belonging to a third-party business, not to him.
- **Never quote a supplier's audit score or outcome to anyone but Divine.**
  A poor outcome is commercially sensitive.
- **Never state numbers as final financials.** `totalAmount` on a purchase
  order is an issued figure, not a settled payment.

## Operations

| Operation | Method & path | Parameters | Long-running |
|---|---|---|---|
| Pipeline overview | `GET /api/billie/overview` | none | no |
| Search suppliers | `GET /api/billie/suppliers` | `query` (string, matches company/contact/category/country), `stage` (int 1–10), `status` (`ACTIVE`\|`SUSPENDED`), `limit` (int, default 25, max 100) | no |
| One supplier in full | `GET /api/billie/suppliers/{id}` | `id` (string, path) | no |
| Products across network | `GET /api/billie/products` | `status` (PIQ status), `limit` (int, default 25, max 100) | no |
| Service health | `GET /api/health` | none — **no auth required** | no |

### `GET /api/health` → 200

```json
{"status":"ok","uptime_s":23,"database":"up","timestamp":"2026-07-27T11:59:06.441Z"}
```

### `GET /api/billie/overview` → 200

```json
{
  "suppliers": { "total": 85, "active": 85, "suspended": 0 },
  "byStage": [
    { "stage": 1, "stageName": "Discovery", "suppliers": 1 },
    { "stage": 3, "stageName": "Registration & Profiling", "suppliers": 39 },
    { "stage": 4, "stageName": "Product Questionnaire", "suppliers": 42 },
    { "stage": 5, "stageName": "Orientation", "suppliers": 2 },
    { "stage": 9, "stageName": "Trade Engagement", "suppliers": 1 }
  ],
  "products": {
    "total": 93,
    "byStatus": { "REVISION_REQUIRED": 1, "UNDER_REVIEW": 1, "SUBMITTED": 90, "DRAFT": 1 },
    "awaitingReview": 91
  },
  "actionQueue": {
    "piqsAwaitingReview": 91,
    "visitsAwaitingConfirmation": 0,
    "openPurchaseOrders": 0
  },
  "auditsCompleted": 1
}
```

`byStage` only lists stages that currently have suppliers in them — a missing
stage means zero, not an error.

### `GET /api/billie/suppliers?query=menu&limit=2` → 200

```json
{
  "count": 1,
  "suppliers": [
    {
      "id": "cmqb0n9hr001hkrm74pe315z1",
      "companyName": "AB’S Menu International Services Ltd",
      "contactName": "<contact name>",
      "country": "Rivers State, Nigeria",
      "category": "Food",
      "stage": 4,
      "stageName": "Product Questionnaire",
      "status": "ACTIVE",
      "products": 8,
      "joinedAt": "2026-06-12T14:22:44.175Z"
    }
  ]
}
```

### `GET /api/billie/suppliers/{id}` → 200

```json
{
  "id": "cmqb0n9hr001hkrm74pe315z1",
  "companyName": "AB’S Menu International Services Ltd",
  "contactName": "<contact name>",
  "email": "<contact email>",
  "phone": "<contact phone>",
  "country": "Rivers State, Nigeria",
  "region": null,
  "category": "Food",
  "cluster": null,
  "stage": 4,
  "stageName": "Product Questionnaire",
  "status": "ACTIVE",
  "legalName": null,
  "yearEstablished": null,
  "employees": null,
  "factoryType": null,
  "joinedAt": "2026-06-12T14:22:44.175Z",
  "products": [
    { "id": "cmqb0n9il001lkrm7qn6lg88e", "name": "Pepper soup Spice", "status": "SUBMITTED", "completion": 95, "updatedAt": "2026-06-21T22:46:16.306Z" },
    { "id": "cmqb0n9i9001jkrm7rhwt78md", "name": "Mixed Spice", "status": "REVISION_REQUIRED", "completion": 89, "updatedAt": "2026-06-21T21:16:22.298Z" }
  ],
  "facilityVisit": {
    "status": "CONFIRMED",
    "preferredDate": "2026-06-25",
    "confirmedDate": "2026-06-26T00:00:00.000Z",
    "window": "Morning 9-12"
  },
  "audit": null,
  "reviewCall": null,
  "purchaseOrders": []
}
```

`facilityVisit`, `audit`, `reviewCall` are `null` when that step hasn't
happened yet — say "no facility visit scheduled", never "the visit is null".

### `GET /api/billie/products?status=UNDER_REVIEW&limit=2` → 200

```json
{
  "count": 1,
  "products": [
    {
      "id": "cmqbijyoe0003lvc8p4dsy7ra",
      "name": "Autosave Test",
      "status": "UNDER_REVIEW",
      "completion": 12,
      "updatedAt": "2026-06-12T22:44:03.855Z",
      "supplierId": "cmqb0n9hr001hkrm74pe315z1",
      "supplier": "AB’S Menu International Services Ltd",
      "country": "Rivers State, Nigeria"
    }
  ]
}
```

## Failure modes

| Symptom | What it means | What Divine has to do |
|---|---|---|
| `GET /api/health` doesn't respond at all | The API is down or unreachable at `base_url`. Nothing supplier-related will work. | Restart the API service; if hosted, check the deployment |
| `/api/health` returns `"database":"down"` | API is up, Postgres isn't. Every read will fail. | Start the database (locally: `docker start azm-pg`) |
| `401 Missing Authorization header` | The token wasn't sent. | Check `AFRIZONEMART_BILLIE_TOKEN` is set in Billie's environment |
| `401 Invalid or revoked service token` | The token is wrong, or was revoked. | Mint a new one: `npx tsx scripts/create-service-token.ts --name=billie-voice-assistant --scopes=suppliers.read` |
| `401 Service token has expired` | The token passed its expiry date. | Same — rotate it with the script above |
| `403 This token is read-only` | Something attempted a write. This is the guard working correctly. | Nothing — but tell him, because Billie should never be attempting a write |
| `403 Missing required scope: suppliers.read` | Token exists but wasn't granted the scope. | Re-mint with `--scopes=suppliers.read` |
| `404 No supplier with that id` | The id is wrong or the supplier was deleted. | Search by name instead of guessing an id |
| Counts look wrong or stale | Reads are live, so this means the underlying data is wrong, not the API. | Check the admin dashboard |

Say "the Afrizonemart platform is down" only when `/api/health` fails. A 401
or 403 is Billie's own credential being wrong — a completely different problem,
and a different thing to tell him.

## Setup

Environment variables in **B.I.L.L.I.E.** (names only, never values):

- `AFRIZONEMART_BILLIE_TOKEN` — the service token, sent as
  `Authorization: Bearer <token>`
- `AFRIZONEMART_BASE_URL` — API base; `http://localhost:4000` today, the
  deployed API origin once it is hosted

On the **API** side no new configuration is required — the service-token table
is part of the schema, and tokens are minted with
`scripts/create-service-token.ts`.
