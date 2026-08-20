#!/usr/bin/env bash
# 実LLMでGrilling品質ベンチマークを実行し docs/16_GRILLING_LLM_QUALITY_REPORT.md を生成する。
#   cd ai-secretary && npm run bench:grill
# 既定は一時Vault（実Vaultに書き込まない）。Factsを実データで見たい場合:
#   GRILL_BENCH_REAL_VAULT=1 npm run bench:grill
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/grill-bench-dist"
BENCH_VAULT="${TMPDIR:-/tmp}/grill-bench-vault"
BENCH_PROVIDER_OVERRIDE="${BENCH_PROVIDER:-}"
GEMINI_MODEL_OVERRIDE="${GEMINI_MODEL:-}"
GROQ_MODEL_OVERRIDE="${GROQ_MODEL:-}"
OLLAMA_MODEL_OVERRIDE="${OLLAMA_MODEL:-}"

cd "$ROOT"
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
  app/lib/ai/client.ts \
  app/lib/grill/benchmarks.ts \
  --outDir "$OUT" --module commonjs --target es2020 \
  --moduleResolution node --esModuleInterop --skipLibCheck

set +e   # 実行中の失敗でもレポート/診断を出せるようにする
echo "[2/2] 実LLMベンチマーク実行..."
# .env.local を読み込む（値は表示しない）。Ollamaのみならファイル不要。
if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi

# CLIで明示した比較条件は.env.localより優先する。
[ -n "$BENCH_PROVIDER_OVERRIDE" ] && export BENCH_PROVIDER="$BENCH_PROVIDER_OVERRIDE"
[ -n "$GEMINI_MODEL_OVERRIDE" ] && export GEMINI_MODEL="$GEMINI_MODEL_OVERRIDE"
[ -n "$GROQ_MODEL_OVERRIDE" ] && export GROQ_MODEL="$GROQ_MODEL_OVERRIDE"
[ -n "$OLLAMA_MODEL_OVERRIDE" ] && export OLLAMA_MODEL="$OLLAMA_MODEL_OVERRIDE"

case "${BENCH_PROVIDER:-}" in
  "") ;;
  gemini|groq|ollama) export DEFAULT_PROVIDER="$BENCH_PROVIDER" ;;
  *) echo "エラー: BENCH_PROVIDER は gemini / groq / ollama のいずれかです" >&2; exit 1 ;;
esac

if [ "${DEFAULT_PROVIDER:-}" = "groq" ]; then
  case "${GROQ_MODEL:-openai/gpt-oss-20b}" in
    llama-3.1-8b-instant|llama-3.3-70b-versatile)
      echo "エラー: GROQ_MODEL=${GROQ_MODEL} はshutdown済みです。qwen/qwen3.6-27b または openai/gpt-oss-120b/20b を指定してください" >&2
      exit 1
      ;;
  esac
fi

if [ "${GRILL_BENCH_REAL_VAULT:-0}" != "1" ]; then
  export VAULT_ROOT="$BENCH_VAULT"
fi
# 本番判定を避ける（ローカル実行）
unset VERCEL
export GRILL_LLM_RATE_LIMIT_RETRY=1
export GRILL_BENCH_STRUCTURED_OUTPUT=1

GRILL_E2E_DIST="$OUT" NODE_PATH="$ROOT/node_modules" node "$ROOT/scripts/grill-llm-benchmark.js" 2>&1 | tee "${TMPDIR:-/tmp}/grill-bench.log"
code=${PIPESTATUS[0]}
echo ""
echo "実行ログ: ${TMPDIR:-/tmp}/grill-bench.log"
if [ "$code" = "2" ]; then
  echo "⛔ 実LLMに到達できなかったため、docs/16 は更新していません（上の [preflight] を確認してください）。"
elif [ "$code" != "0" ]; then
  echo "⛔ ベンチマークが異常終了しました (exit $code)。上のログを確認してください。"
fi
exit $code
