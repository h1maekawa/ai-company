#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/ai-company-architecture.XXXXXX)"
export ARCHITECTURE_DIST="$DIST"

npx tsc app/lib/memory/artifacts.ts \
  --outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck

node --test tests/architecture/*.test.mjs
echo "✅ Architecture and Vault contracts are valid"

