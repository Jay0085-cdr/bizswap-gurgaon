#!/usr/bin/env bash
# Regenerates seed.sql and pushes migrations + seed using only the DB password (no login needed).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /opt/homebrew/opt/node@22/bin ] && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
source scripts/lib.sh
node scripts/gen-seed.mts
PW=$(node -e 'console.log(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))')
$SB db push --db-url "postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres" --include-seed --yes
