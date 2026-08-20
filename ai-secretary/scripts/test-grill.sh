#!/usr/bin/env bash
# Grilling Session E2E テスト（docs/15）
#   Frontier計算 / 状態遷移 / 中断再開 / durability / confirmed時のみKnowledge Capture /
#   Grilling独自のVault保存をしないこと / Redis・Supabase未設定での動作
# 一時Vault(/tmp)に対して実行するため、実データには一切触れない。
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/grill-e2e-dist"
VAULT="${TMPDIR:-/tmp}/grill-e2e-vault"

rm -rf "$OUT" "$VAULT"
mkdir -p "$VAULT/memory/personal/inbox"

echo "[1/2] TypeScriptをトランスパイル..."
cd "$ROOT"
npx tsc \
  app/lib/grill/orchestrator.ts \
  app/lib/grill/store.ts \
  app/lib/grill/designTree.ts \
  app/lib/grill/facts.ts \
  --outDir "$OUT" --module commonjs --target es2020 \
  --moduleResolution node --esModuleInterop --skipLibCheck

# [16] で Weekly Review 側の Candidate 一覧を検証するため Knowledge 側もトランスパイルする
KN_OUT="${TMPDIR:-/tmp}/grill-e2e-kn"
rm -rf "$KN_OUT"
npx tsc app/lib/knowledge/lifecycle.ts \
  --outDir "$KN_OUT" --module commonjs --target es2020 \
  --moduleResolution node --esModuleInterop --skipLibCheck

echo "[2/2] E2E実行..."
env -u GITHUB_TOKEN -u GITHUB_OWNER -u GITHUB_REPO \
    -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN -u VERCEL \
  VAULT_ROOT="$VAULT" GRILL_E2E_DIST="$OUT" KN_DIST="$KN_OUT" NODE_PATH="$ROOT/node_modules" \
  node "$ROOT/scripts/grill-e2e.js"
