#!/usr/bin/env bash
# Fund Department エンジン＋認証ミドルウェアのテスト実行
# TypeScriptをCommonJSへコンパイルし node --test で検証する
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/fund-dist.XXXXXX)"
export FUND_DIST="$DIST"

# 1) エンジン・ポリシー・市場データ計算
npx tsc app/lib/fund/policy.ts app/lib/fund/engine.ts app/lib/fund/rakutenCsv.ts app/lib/fund/marketData/calc.ts \
  --outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck

# 2) middleware（実物）＋session を認証テスト用にコンパイル
#    tscはパスエイリアスを書き換えないため、出力後に相対パスへ置換する
mkdir -p "$DIST/mw"
cat > "$DIST/mw-tsconfig.json" <<EOF
{
  "compilerOptions": {
    "outDir": "$DIST/mw-raw",
    "module": "commonjs",
    "target": "es2020",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "baseUrl": "$PWD",
    "paths": { "@/*": ["./*"] }
  },
  "files": ["$PWD/middleware.ts", "$PWD/app/lib/auth/session.ts"]
}
EOF
npx tsc -p "$DIST/mw-tsconfig.json"
cp "$DIST/mw-raw/middleware.js" "$DIST/mw/middleware.js"
cp "$DIST/mw-raw/app/lib/auth/session.js" "$DIST/mw/session.js"
node -e "
const fs = require('fs');
const p = process.env.FUND_DIST + '/mw/middleware.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('@/app/lib/auth/session', './session');
fs.writeFileSync(p, s);
"

# NODE_PATH: /tmpへコンパイルしたmiddleware.jsが next/server を解決できるようにする
NODE_PATH="$PWD/node_modules" node --test tests/fund/*.test.mjs
