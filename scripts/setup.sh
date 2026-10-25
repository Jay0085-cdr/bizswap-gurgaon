#!/usr/bin/env bash
# One-shot backend setup. Idempotent — safe to re-run.
# Needs: .env.local with SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, GEMINI_API_KEY, and `npx supabase login` done once.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /opt/homebrew/opt/node@22/bin ] && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
source scripts/lib.sh

step "1/8 Checking Supabase login"
$SB projects list >/dev/null 2>&1 || die "Not logged in. Run:  npx supabase login"

step "2/8 Linking project $REF"
$SB link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD" >/dev/null

step "3/8 Pushing auth config (anonymous sign-ins on)"
$SB config push --project-ref "$REF" --yes >/dev/null || warn "config push failed — enable Anonymous sign-ins in Dashboard → Authentication → Providers"

step "4/8 Generating seed + pushing migrations"
node scripts/gen-seed.mts
$SB db push --include-seed --yes

step "5/8 Setting function secrets (server-side only)"
if ! grep -q '^ADMIN_SECRET=' .env.local; then
  echo "ADMIN_SECRET=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')" >> .env.local
  source scripts/lib.sh
fi
SECRETS=(GEMINI_API_KEY="$GEMINI_API_KEY" LLM_PROVIDER="${LLM_PROVIDER:-gemini}" LLM_MODEL="${LLM_MODEL:-gemini-3.5-flash-lite}" ADMIN_SECRET="$ADMIN_SECRET")
[ -n "${ANTHROPIC_API_KEY:-}" ] && SECRETS+=(ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY")
[ -n "${GROQ_API_KEY:-}" ] && SECRETS+=(GROQ_API_KEY="$GROQ_API_KEY")
[ -n "${LLM_FALLBACK_PROVIDER:-}" ] && SECRETS+=(LLM_FALLBACK_PROVIDER="$LLM_FALLBACK_PROVIDER")
$SB secrets set --project-ref "$REF" "${SECRETS[@]}" >/dev/null

step "6/8 Deploying agents"
bash scripts/deploy-functions.sh

step "7/8 Writing app env (public URL + anon key only)"
node scripts/write-app-env.mts

step "8/8 Matching seed data + scheduling watch-agent sweep"
node scripts/post-deploy.mts

ok "Backend ready. Next: npm run smoke"
