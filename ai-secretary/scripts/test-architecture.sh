#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/ai-company-architecture.XXXXXX)"
export ARCHITECTURE_DIST="$DIST"

TSC_FLAGS=(--outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck)

npx tsc app/lib/memory/artifacts.ts "${TSC_FLAGS[@]}"

# reviewer.ts / canaryContract.ts は依存を持たないので、そのまま実行して振る舞いを検査できる。
# Phase 10-A の Canary は「sourceにtokenがあるか」の静的検査しか持たず、
# Reviewが構造的に必ずWARNになる不具合をProductionまで通してしまった。ここで実際に走らせる。
# 1ファイルずつ渡すのは、複数渡すとtscが共通ルート基準の階層を作り出力パスが変わるため。
npx tsc app/lib/company/execution/reviewer.ts "${TSC_FLAGS[@]}"
npx tsc app/lib/company/runtime/canaryContract.ts "${TSC_FLAGS[@]}"

node --test tests/architecture/*.test.mjs
echo "✅ Architecture and Vault contracts are valid"

