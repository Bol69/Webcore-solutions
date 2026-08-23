#!/usr/bin/env bash
# Reconstruit web/vendor/supabase.js (le client Supabase embarqué).
#
# Le fichier est déjà commité : tu n'as PAS besoin de lancer ce script pour
# utiliser l'app. Il ne sert qu'à mettre à jour la version de supabase-js.
#
#   bash tools/build-vendor.sh [version]

set -euo pipefail
VERSION="${1:-2.45.4}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
npm init -y >/dev/null
npm install --silent "@supabase/supabase-js@${VERSION}" esbuild >/dev/null
echo 'export { createClient } from "@supabase/supabase-js";' > entry.js

npx esbuild entry.js \
  --bundle --format=esm --platform=browser --target=es2020 --minify \
  --outfile="$ROOT/web/vendor/supabase.js"

echo "✅ web/vendor/supabase.js régénéré (supabase-js ${VERSION})"
