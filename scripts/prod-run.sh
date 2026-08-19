#!/usr/bin/env bash
#
# Run a script against PRODUCTION from your own machine.
#
#   ./scripts/prod-run.sh npx tsx scripts/invite-suppliers.ts
#   ./scripts/prod-run.sh npx tsx scripts/invite-suppliers.ts --commit
#
# Why this exists instead of plain `railway run`:
#
# `railway run` injects the api service's variables, and its DATABASE_URL points
# at `postgres.railway.internal` — a hostname that only resolves INSIDE
# Railway's private network. From a laptop it fails with "Can't reach database
# server", which is easy to misread as the database being down.
#
# Railway also exposes the same database over a public TCP proxy. This reads
# that URL from the Postgres service and substitutes it, so the command gets
# production's email keys and secrets AND a database it can actually open.
#
# The password never lands in your shell history or in a file: it is read into
# a variable inside the child shell and used there.
#
# Scripts that only send email (invite-suppliers) work under plain `railway
# run`. Anything that touches the database needs this.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: ./scripts/prod-run.sh <command...>" >&2
  echo "e.g.   ./scripts/prod-run.sh npx tsx scripts/invite-suppliers.ts" >&2
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. npm i -g @railway/cli && railway login" >&2
  exit 1
fi

# Confirm what we are pointed at before doing anything. Running the wrong
# environment is the failure this whole script exists to make unlikely.
echo "── target ──────────────────────────────────────"
railway status 2>/dev/null | sed 's/^/  /'
echo "────────────────────────────────────────────────"

PUBLIC_DB=$(
  railway variables --service Postgres --json 2>/dev/null |
    python -c "import sys,json;print(json.load(sys.stdin).get('DATABASE_PUBLIC_URL',''))"
)

if [ -z "$PUBLIC_DB" ]; then
  echo "Could not read DATABASE_PUBLIC_URL from the Postgres service." >&2
  echo "Check: railway variables --service Postgres" >&2
  exit 1
fi

export AZM_PROD_DB="$PUBLIC_DB"

# railway run sets DATABASE_URL to the internal host; overriding it on the
# child command's own line is what makes ours win.
# %q-quote every argument. Plain $* re-splits on spaces inside bash -c,
# which silently truncated --signed-by="Obinna Okehie" to "Obinna" --
# a legal signature, cut in half without an error.
QUOTED=$(printf '%q ' "$@")
railway run -- bash -c "DATABASE_URL=\"\$AZM_PROD_DB\" $QUOTED"
