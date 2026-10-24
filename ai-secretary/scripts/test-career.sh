#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="$(mktemp -d /tmp/ai-company-career-source.XXXXXX)"
CAREER_VAULT_TEST_DIR="$(mktemp -d /tmp/ai-company-career-vault.XXXXXX)"
export CAREER_SOURCE_DIR="$SOURCE"
export VAULT_ROOT="$CAREER_VAULT_TEST_DIR"
trap 'rm -rf "$CAREER_VAULT_TEST_DIR" "$SOURCE"' EXIT

for file in app/lib/content/career/*.ts; do
  name="$(basename "$file")"
  sed -E 's/from "@\/app\/lib\/runtime\/paths"/from ".\/paths"/; /^import "server-only";$/d; s/from "(\.\/[^"]+)"/from "\1.ts"/g' "$file" > "$SOURCE/$name"
done
sed -E 's/from "(\.\/[^"]+)"/from "\1.ts"/g' app/lib/runtime/paths.ts > "$SOURCE/paths.ts"
sed -E 's/from "(\.\/[^"]+)"/from "\1.ts"/g' app/lib/company/execution/requestProtection.ts > "$SOURCE/requestProtection.ts"
node --experimental-strip-types --test tests/content/career.test.mjs
echo "Career content tests passed"
