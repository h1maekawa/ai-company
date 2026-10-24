#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_DIR="$(pwd)"
SOURCE="$(mktemp -d /tmp/ai-company-career-verify-source.XXXXXX)"
VAULT="$(mktemp -d /tmp/ai-company-career-verify-vault.XXXXXX)"
trap 'rm -rf "$SOURCE" "$VAULT"' EXIT
export CAREER_SOURCE_DIR="$SOURCE"
export VAULT_ROOT="$VAULT"

# Node's ESM resolver requires dependency lookup to be adjacent to the copied sources.
ln -s "$APP_DIR/node_modules" "$SOURCE/node_modules"

for file in app/lib/content/career/*.ts; do
  name="$(basename "$file")"
  sed -E '/^import "server-only";/d; s/import \{ resolveVaultPath \} from "@\/app\/lib\/runtime\/paths";/const resolveVaultPath = (relativePath) => path.join(process.env.VAULT_ROOT, relativePath);/; s/from "(\.\/[^"]+)"/from "\1.ts"/g; s/from "@\/app\/lib\/content\/career\/([^"]+)"/from ".\/\1.ts"/g' "$file" > "$SOURCE/$name"
done

node --experimental-strip-types scripts/verify-career-e6dad0e.mjs
