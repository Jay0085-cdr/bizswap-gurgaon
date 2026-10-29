#!/usr/bin/env bash
# Deploys all agents (server-side bundling, no Docker needed).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /opt/homebrew/opt/node@22/bin ] && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
source scripts/lib.sh
for fn in intake-agent listing-agent valuation-agent matchmaker-agent watch-agent feedback-agent; do
  echo "  deploying $fn"
  $SB functions deploy "$fn" --project-ref "$REF" --use-api --no-verify-jwt >/dev/null
done
echo "  ✔ 6 agents deployed"
