#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/maemichi-local-ai-worker.XXXXXX)"
trap 'rm -rf "$DIST"' EXIT

npx tsc \
  scripts/maemichi-local-ai-worker.ts \
  app/lib/ai/client.ts \
  app/lib/ai/gemini.ts \
  app/lib/ai/groq.ts \
  app/lib/ai/ollama.ts \
  app/lib/ai/types.ts \
  app/lib/note/editor/types.ts \
  app/lib/note/editor/brandRules.ts \
  app/lib/note/editor/preservation.ts \
  app/lib/note/editor/review.ts \
  app/lib/vault.ts \
  app/lib/runtime/paths.ts \
  --outDir "$DIST" --module commonjs --target es2020 \
  --esModuleInterop --skipLibCheck --resolveJsonModule

ln -s "$(pwd)/node_modules" "$DIST/node_modules"
node "$DIST/scripts/maemichi-local-ai-worker.js"

