#!/usr/bin/env bash
# Knowledge Lifecycle E2E テスト
#   capture → Inbox → AI整理 → Candidate → Promotion → Promoted Knowledge → Knowledge Router
#   ＋ Write Policy / Approved Write / Merge Diff-Preview の安全性検証。
#
# 一時Vault(/tmp)に対して実行するため、実データ(Dropbox Vault / GitHub Vault)には一切触れない。
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/kn-e2e-dist"
VAULT="${TMPDIR:-/tmp}/kn-e2e-vault"

rm -rf "$OUT" "$VAULT"
mkdir -p "$VAULT/memory/personal/inbox"

echo "[1/2] TypeScriptをトランスパイル..."
cd "$ROOT"
npx tsc \
  app/lib/knowledge/lifecycle.ts \
  app/lib/knowledge/router.ts \
  app/lib/knowledge/search.ts \
  app/lib/knowledge/captureService.ts \
  app/lib/knowledge/approval.ts \
  app/lib/knowledge/writePolicy.ts \
  app/lib/memory/knowledge.ts \
  --outDir "$OUT" --module commonjs --target es2020 \
  --moduleResolution node --esModuleInterop --skipLibCheck

echo "[2/2] E2E実行..."
env -u GITHUB_TOKEN -u GITHUB_OWNER -u GITHUB_REPO \
  VAULT_ROOT="$VAULT" KN_E2E_DIST="$OUT" \
  node "$ROOT/scripts/knowledge-e2e.js"
