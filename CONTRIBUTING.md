# Contributing

## Workflow

We don't push to `main`. Every change goes through a feature branch + a pull request that's merged after CI passes.

```
git checkout -b feat/<short-description>
# or fix/<short-description>, chore/<short-description>

# ... make your changes ...

git add -A
git commit -m "concise message"

git push -u origin HEAD
```

The push triggers two things:

1. **Husky pre-push hook** runs locally — `prisma generate` + `tsc --noEmit`. If anything fails, the push is rejected. Fix and retry.
2. **GitHub Actions CI** runs the same checks (plus tests against a real Postgres) on the PR. The merge button is locked until CI is green.

Unlike the storefront, **Railway does not provide preview deployments on the free plan** — there's no preview URL to click through before merging.

## Reviewing your own change

Because there's no preview URL, the safety net is:

- **CI typecheck** — catches type errors and broken imports before merge.
- **CI test job** — runs `npm test` against a fresh Postgres with migrations applied. Add tests when you change critical paths (auth, checkout, payments, intern submissions).
- **Local dev against the dev database** — `npm run dev` and hit endpoints with curl/Postman. The dev DB is `shuttle.proxy.rlwy.net:45001` per `.env`.

For risky changes (schema, migrations, auth), run `npx prisma db push` against dev first, sanity-check, then push.

## Branch naming

| Prefix | When to use |
|---|---|
| `feat/` | A new feature or capability |
| `fix/` | A bug fix |
| `chore/` | Tooling, config, dependency bumps |
| `refactor/` | Internal cleanup, no behaviour change |

## Skipping the hook

If you absolutely must push without the local checks (e.g. work-in-progress branch you want a teammate to look at), use:

```
git push --no-verify
```

GitHub Actions still runs on the PR — `--no-verify` only skips the local hook, not the CI gate. The merge button still requires green CI.

## Schema changes

Migrations are the riskiest changes in this repo because they're irreversible in production.

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <descriptive-name>` against the dev DB. This creates the migration file and applies it.
3. Sanity-check by querying through the API.
4. Commit the migration file alongside the schema change. **Never** edit a migration file after it's been applied to production.
5. On merge to `main`, Railway runs `npx prisma migrate deploy` as part of the deploy script.

If a migration goes wrong in production, the recovery path is: write a new migration that reverses it. Don't try to roll back via `prisma migrate reset`.

## Why this exists

We've shipped breakages straight to production because main pushes go live instantly with nothing in between. The pre-push hook + PR + CI flow catches:

- TypeScript errors (everywhere)
- Test failures on critical paths
- Migration syntax errors (caught by `prisma generate`)
- Whether the change actually does what you think it does (you wrote a test, right?)

Cost: about 30 seconds of local check time per push, plus the discipline of opening a PR. Cheap insurance.
