#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

dist="$(mktemp -d "${TMPDIR:-/tmp}/ai-company-engineering-tests.XXXXXX")"
trap 'rm -rf "$dist"' EXIT
export ENGINEERING_DIST="$dist"
npx tsc app/lib/engineering/worker.ts app/lib/engineering/adapters.ts app/lib/engineering/security.ts app/lib/engineering/stateStore.ts \
  --outDir "$dist" --module commonjs --target es2020 --esModuleInterop --skipLibCheck
node --test tests/engineering/*.test.mjs
