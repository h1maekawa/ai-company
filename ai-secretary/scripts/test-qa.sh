#!/usr/bin/env bash
# QAゲート（要件9）のテスト実行
# 決定論的な検査だけを対象にするため、外部通信を伴うドライランはここでは呼ばない
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/qa-dist.XXXXXX)"
export QA_DIST="$DIST"

cat > "$DIST/tsconfig.json" <<TSCONFIG
{
  "compilerOptions": {
    "outDir": "$DIST/out",
    "rootDir": "$PWD",
    "module": "commonjs",
    "target": "es2020",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "strict": true,
    "types": ["node"],
    "typeRoots": ["$PWD/node_modules/@types"],
    "baseUrl": "$PWD",
    "paths": { "@/*": ["./*"] }
  },
  "files": [
    "$PWD/app/lib/qa/types.ts",
    "$PWD/app/lib/qa/contentChecks.ts",
    "$PWD/app/lib/qa/factChecks.ts",
    "$PWD/app/lib/router/executive.ts",
    "$PWD/app/lib/review/types.ts",
    "$PWD/app/lib/review/adapters.ts"
  ]
}
TSCONFIG
npx tsc -p "$DIST/tsconfig.json"

# tscはパスエイリアスを書き換えないため、出力後に相対パスへ置換する
node -e "
const fs = require('fs'), path = require('path');
const root = process.env.QA_DIST + '/out';
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
for (const file of walk(root).filter((f) => f.endsWith('.js'))) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/require\(\"@\/(.*?)\"\)/g, (_, target) => {
    const rel = path.relative(path.dirname(file), path.join(root, target));
    return 'require(\"' + (rel.startsWith('.') ? rel : './' + rel) + '\")';
  });
  fs.writeFileSync(file, s);
}
"

node --test tests/qa/*.test.mjs
echo "✅ QAゲートのテストが通りました"
