#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-}"
case "$mode" in
  once|daemon|status|doctor) ;;
  *) echo "Usage: $0 <once|daemon|status|doctor>" >&2; exit 2 ;;
esac

dist="$(mktemp -d "${TMPDIR:-/tmp}/ai-company-engineering.XXXXXX")"
trap 'rm -rf "$dist"' EXIT
npx tsc app/lib/engineering/cli.ts \
  --outDir "$dist" \
  --module commonjs \
  --target es2020 \
  --esModuleInterop \
  --skipLibCheck
node "$dist/cli.js" "$mode"
