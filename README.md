# Afrizonemart API

Node.js + Express + TypeScript + Prisma + PostgreSQL backend for Afrizonemart 2.0.

This project is the implementation of the **API-First** principle from the
[ARCHITECTURE_TRACKER](../afrizonemart-v2/ARCHITECTURE_TRACKER.md). Every
core function (products, orders, payments, customers, sellers, etc.) lives
behind an API endpoint — the Next.js website, future mobile app, WhatsApp
bot, and partner integrations all consume the same endpoints.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in DATABASE_URL + JWT_SECRET
cp .env.example .env

# 3. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 4. Start dev server
npm run dev
# → http://localhost:4000/api/health
```

## Folder structure (DDD — Principle #7)

```
afrizonemart-api/
├── prisma/
│   └── schema.prisma            # Postgres schema, generates the client
├── src/
│   ├── server.ts                # Express entry: wiring, middleware, routes
│   ├── config/
│   │   └── env.ts               # Typed env loader (Zod)
│   ├── infra/
│   │   ├── logger.ts            # Winston JSON logger
│   │   ├── sentry.ts            # Sentry init
│   │   ├── prisma.ts            # Prisma client singleton
│   │   └── eventBus.ts          # In-process domain event bus
│   ├── middleware/
│   │   ├── error-handler.ts     # HttpError class + central error formatter
│   │   ├── request-logger.ts    # Per-request structured log
│   │   └── auth.ts              # JWT verifier (requireAuth / optionalAuth)
│   ├── modules/                 # ONE FOLDER PER DOMAIN
│   │   ├── health/
│   │   │   ├── controller.ts
│   │   │   └── routes.ts
│   │   └── products/
│   │       ├── product.schema.ts   # Zod input schemas
│   │       ├── repository.ts       # Prisma queries
│   │       ├── service.ts          # Business logic + event emits
│   │       ├── controller.ts       # HTTP layer (validates, calls service)
│   │       └── routes.ts           # Express Router
│   └── types/
└── README.md
```

## Module conventions

Every domain module follows the same shape:

| File             | Job                                                |
| ---------------- | -------------------------------------------------- |
| `*.schema.ts`    | Zod input/output schemas                           |
| `repository.ts`  | Prisma queries — only this file imports `prisma`   |
| `service.ts`     | Business logic, event emits, calls repository      |
| `controller.ts`  | HTTP handler — validates request, calls service    |
| `routes.ts`      | Express Router mapping HTTP verbs to handlers      |

**Hard rules:**
- Controllers never touch Prisma. (Principle #6 — Separation of Concerns)
- Services never touch `req` / `res`.
- Cross-module communication uses the event bus, never direct imports of
  another module's service. (Principle #5 — Event-Driven)

## Architecture commitments this project honours

| # | Principle / Rule | Where in code |
| - | ---------------- | ------------- |
| 1 | API-First | All endpoints live here, before any UI consumes them |
| 5 | Event-Driven | `src/infra/eventBus.ts` |
| 6 | Separation of Concerns | controller → service → repository layering |
| 7 | DDD | `src/modules/<domain>/` folders |
| 8 | Infrastructure as Code | `railway.toml`, `prisma/schema.prisma`, `.env.example` |
| 9 | Modular | Each module is self-contained |
| 10 | Observability | `src/infra/logger.ts` + `src/infra/sentry.ts` + `request-logger` |
| B1 | Code-level API-First | Endpoints exist before frontend integration |
| B2 | TypeScript Everywhere | strict mode, Zod for runtime validation |
| B5 | Event-Driven Side Effects | `eventBus.emit('order.placed', ...)` |
| B9 | Environment Variables | Typed `env` from `src/config/env.ts` |
| B10 | Observability | Per-request log + Sentry capture |

## Endpoints

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| GET    | `/api/health`         | Liveness + DB connectivity   |
| GET    | `/api/products`       | List products (filterable)   |
| GET    | `/api/products/:slug` | Single product by slug       |

More modules land iteratively (auth → cart → orders → payments → ...).

## Deployment

Hosted on Railway. The `railway.toml` in this repo is the deployment manifest
(Principle #8). Connect a GitHub repo to Railway and pushes to `main` deploy
automatically. Add a Postgres add-on in Railway and it injects `DATABASE_URL`
at runtime.

## Adding a new module

1. Create `src/modules/<name>/` with the 5 files above
2. Add the Prisma model(s) in `prisma/schema.prisma`
3. Run `npm run prisma:migrate -- --name add_<name>`
4. Mount the router in `src/server.ts`:
   `app.use('/api/<name>', <name>Routes);`
5. Tick the relevant box in `ARCHITECTURE_TRACKER.md`
