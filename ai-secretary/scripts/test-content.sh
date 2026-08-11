#!/usr/bin/env bash
# Content Business OS（Note Studio / X Studio / Monetization / Learning）のテスト。
# 外部I/Oを持つStore層も含め、隔離した一時Vault(VAULT_ROOT)に対して実際にread/writeし、
# Timebox完全OFFでもNote/Xが単独完結することを確認する。
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/ai-company-content-dist.XXXXXX)"
export CONTENT_DIST="$DIST"

# VAULT_ROOTは各テストファイルが自分専用の一時ディレクトリをimport前に設定する
# （node --testはファイルごとに別プロセスなので、テスト間でVaultが混ざらない）。
unset VAULT_ROOT || true

npx tsc \
  app/lib/vault.ts \
  app/lib/vault/managed-files.ts \
  app/lib/runtime/paths.ts \
  app/lib/planning/types.ts \
  app/lib/planning/store.ts \
  app/lib/note/research/types.ts \
  app/lib/note/research/store.ts \
  app/lib/content/core/types.ts \
  app/lib/content/core/store.ts \
  app/lib/content/core/approval.ts \
  app/lib/content/core/providers/types.ts \
  app/lib/content/core/providers/manual.ts \
  app/lib/content/core/providers/upload.ts \
  app/lib/content/core/providers/url.ts \
  app/lib/content/core/providers/obsidian.ts \
  app/lib/content/core/providers/research.ts \
  app/lib/content/core/providers/timebox.ts \
  app/lib/content/core/providers/previousContent.ts \
  app/lib/content/core/providers/registry.ts \
  app/lib/content/note-studio/types.ts \
  app/lib/content/note-studio/store.ts \
  app/lib/content/note-studio/obsidianDraft.ts \
  app/lib/content/note-studio/interview.ts \
  app/lib/content/x-studio/bridge.ts \
  app/lib/content/monetization/types.ts \
  app/lib/content/monetization/store.ts \
  app/lib/content/monetization/metrics.ts \
  app/lib/content/learning/types.ts \
  app/lib/content/learning/store.ts \
  app/lib/content/learning/engine.ts \
  app/lib/ai/client.ts app/lib/ai/gemini.ts app/lib/ai/groq.ts app/lib/ai/ollama.ts app/lib/ai/types.ts \
  app/lib/utils/redis.ts \
  --outDir "$DIST" --module commonjs --target es2020 \
  --esModuleInterop --skipLibCheck --resolveJsonModule

# コンパイル結果からnode_modules（@upstash/redis等）を解決できるようにする
ln -s "$(pwd)/node_modules" "$DIST/node_modules"

node --test tests/content/*.test.mjs

echo "✅ Content Business OSのテストが通りました"
