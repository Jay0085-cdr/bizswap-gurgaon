#!/usr/bin/env bash
# Builds the Expo web app and publishes it (plus the privacy policy) to the gh-pages branch → GitHub Pages.
# Live at https://<user>.github.io/<repo>/ ; privacy policy at …/privacy/
# Run: npm run web:deploy
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE=$(git remote get-url origin)
REPO=$(basename -s .git "$REMOTE")
OUT=dist-pages

echo "▶ exporting web build for /$REPO"
rm -rf "$OUT"
EXPO_BASE_URL="/$REPO" npx expo export -p web --output-dir "$OUT" >/dev/null
cp -r docs/privacy "$OUT/privacy"
cp "$OUT/index.html" "$OUT/404.html" # SPA fallback for deep links like /listing/<id>
touch "$OUT/.nojekyll"                # keep the _expo/ folder

echo "▶ checking build for server secrets"
node scripts/check-no-secrets.mts "$OUT"

echo "▶ publishing to gh-pages"
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. log -1 --format=%an)" -c user.email="$(git -C .. log -1 --format=%ae)" \
  commit -qm "Deploy web demo from $(git -C .. rev-parse --short HEAD)"
git push -qf "$REMOTE" gh-pages
cd .. && rm -rf "$OUT/.git"
echo "✔ deployed — GitHub Pages updates in ~1 min"
