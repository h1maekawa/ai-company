#!/usr/bin/env bash
# まえみち リサーチ／投稿基盤のテスト
# 純粋ロジック（採点・クラスタ・類似度・キュー・安全装置）を node --test で検証する
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/maemichi-dist.XXXXXX)"
export MAEMICHI_DIST="$DIST"

# 外部I/Oを持たない純粋モジュールだけをコンパイルする
npx tsc \
  app/lib/note/research/cluster.ts \
  app/lib/note/research/genres.ts \
  app/lib/note/research/similarity.ts \
  app/lib/note/research/types.ts \
  app/lib/note/research/x-query.ts \
  app/lib/note/research/x-format.ts \
  app/lib/note/research/performance.ts \
  app/lib/note/editor/types.ts \
  app/lib/note/editor/config.ts \
  app/lib/note/editor/brandRules.ts \
  app/lib/note/editor/preservation.ts \
  app/lib/note/editor/jobs.ts \
  app/lib/note/editor/review.ts \
  app/lib/note/x/urls.ts \
  app/lib/note/x/web-intents.ts \
  app/lib/note/x/archive.ts \
  app/lib/note/x/free-ai.ts \
  app/lib/note/x/types.ts \
  app/lib/note/publishing/queue.ts \
  app/lib/integrations/slack/verify.ts \
  app/lib/integrations/slack/conversation.ts \
  app/lib/integrations/machine-auth.ts \
  app/lib/integrations/vercel-background.ts \
  --outDir "$DIST" --module commonjs --target es2020 \
  --esModuleInterop --skipLibCheck --resolveJsonModule

# コンパイル結果から node_modules（@upstash/redis 等）を解決できるようにする
ln -s "$(pwd)/node_modules" "$DIST/node_modules"

# note/types.ts は cluster.ts が参照するので一緒に出力される
node --test tests/maemichi/*.test.mjs

# 無料Xワークスペースから課金・自動操作経路を参照していないことを固定する
if rg -n "publishing/buffer|research/sources/x|api\\.x\\.com|serpapi\\.com|playwright|puppeteer|selenium" \
  components/note/x app/api/note/x app/lib/note/x; then
  echo "❌ 無料Xワークスペースが禁止された連携を参照しています"
  exit 1
fi

echo "✅ まえみち基盤のテストが通りました"
