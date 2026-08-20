#!/usr/bin/env bash
# 実LLMでGrilling品質ベンチマークを実行し docs/16_GRILLING_LLM_QUALITY_REPORT.md を生成する。
#   cd ai-secretary && npm run bench:grill
# 既定は一時Vault（実Vaultに書き込まない）。Factsを実データで見たい場合:
#   GRILL_BENCH_REAL_VAULT=1 npm run bench:grill
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/grill-bench-dist"
BENCH_VAULT="${TMPDIR:-/tmp}/grill-bench-vault"

cd "$ROOT"
if [ ! -f .env.local ]; then
  echo "エラー: ai-secretary/.env.local が見つかりません（GEMINI_API_KEY 等が必要）" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$BENCH_VAULT/memory/personal/inbox"

echo "[1/2] トランスパイル..."
npx tsc \
  app/lib/grill/orchestrator.ts \
  app/lib/grill/store.ts \
  app/lib/grill/designTree.ts \
  app/lib/grill/facts.ts \
  app/lib/grill/archetypes.ts \
  app/lib/grill/validate.ts \
  app/lib/grill/decisions.ts \
  app/lib/grill/questions.ts \
  app/lib/grill/suGate.ts \
  app/lib/grill/types.ts \
  --outDir "$OUT" --module commonjs --target es2020 \
  --moduleResolution node --esModuleInterop --skipLibCheck

echo "[2/2] 実LLMベンチマーク実行..."
# .env.local を読み込む（値は表示しない）
set -a; . ./.env.local; set +a

if [ "${GRILL_BENCH_REAL_VAULT:-0}" != "1" ]; then
  export VAULT_ROOT="$BENCH_VAULT"
fi
# 本番判定を避ける（ローカル実行）
unset VERCEL

GRILL_E2E_DIST="$OUT" NODE_PATH="$ROOT/node_modules" node "$ROOT/scripts/grill-llm-benchmark.js"
