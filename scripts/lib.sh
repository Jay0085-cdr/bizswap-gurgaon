# Shared shell helpers: loads .env.local and normalises the project ref.
[ -f .env.local ] || { echo "Missing .env.local (see README → Setup)"; exit 1; }
set -a; source .env.local; set +a
REF="${SUPABASE_PROJECT_REF#https://}"; REF="${REF#http://}"; REF="${REF%%.supabase.co*}"
export REF
SB="npx supabase"
step() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\n\033[1;32m✔ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m✖ %s\033[0m\n" "$*"; exit 1; }
