#!/usr/bin/env bash
# 家計連携（月次集計スナップショットの書式）のテスト実行
# TypeScriptをCommonJSへコンパイルし node --test で検証する
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/kakei-dist.XXXXXX)"
export KAKEI_DIST="$DIST"

npx tsc app/lib/kakei/snapshotFormat.ts app/lib/kakei/month.ts \
  --outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck

node --test tests/kakei/*.test.mjs
