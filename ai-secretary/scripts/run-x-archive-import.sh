#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DIST="$(mktemp -d /tmp/x-archive-import.XXXXXX)"
trap 'rm -rf "$DIST"' EXIT
npx tsc scripts/import-x-archive.ts app/lib/note/x/archive.ts app/lib/note/x/store.ts app/lib/note/x/types.ts \
  --outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck --resolveJsonModule
ln -s "$(pwd)/node_modules" "$DIST/node_modules"
node "$DIST/scripts/import-x-archive.js" "$@"
