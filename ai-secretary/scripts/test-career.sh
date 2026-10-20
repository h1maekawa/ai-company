#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="$(mktemp -d /tmp/ai-company-career-source.XXXXXX)"
export CAREER_SOURCE_DIR="$SOURCE"
for file in app/lib/content/career/*.ts; do
  name="$(basename "$file")"
  sed -E 's/from "(\.\/[^\"]+)"/from "\1.ts"/g' "$file" > "$SOURCE/$name"
done
node --experimental-strip-types --test tests/content/career.test.mjs
echo "Career content tests passed"
