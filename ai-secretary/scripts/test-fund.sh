#!/usr/bin/env bash
# Fund Department エンジン＋認証ミドルウェアのテスト実行
# TypeScriptをCommonJSへコンパイルし node --test で検証する
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="$(mktemp -d /tmp/fund-dist.XXXXXX)"
export FUND_DIST="$DIST"

# 1) エンジン・ポリシー・市場データ計算
npx tsc app/lib/fund/policy.ts app/lib/fund/engine.ts app/lib/fund/rakutenCsv.ts app/lib/fund/marketData/calc.ts app/lib/fund/analyst.ts app/lib/fund/learning/types.ts app/lib/fund/learning/engine.ts app/lib/fund/transactions/types.ts app/lib/fund/transactions/accounting.ts \
  --outDir "$DIST" --module commonjs --target es2020 --esModuleInterop --skipLibCheck

# Investment market data trust + portfolio valuation (network providers are mocked in tests)
npx tsc app/lib/fund/marketData/snapshot.ts app/lib/fund/marketData/provider.ts app/lib/fund/marketData/yahoo.ts app/lib/fund/marketData/cache.ts app/lib/fund/marketData/calc.ts app/lib/fund/policy.ts app/lib/investing/revalue.ts app/lib/investing/types.ts app/lib/freshness.ts \
  --outDir "$DIST/market" --rootDir app/lib --module commonjs --target es2021 --esModuleInterop --skipLibCheck

# Investment Intelligence pure parsers / gate engine
npx tsc app/lib/fund/marketData/calc.ts app/lib/fund/policy.ts app/lib/fund/rakutenCsv.ts app/lib/fund/analyst.ts app/lib/note/tokyoDate.ts app/lib/investing/intelligence/types.ts app/lib/investing/intelligence/flags.ts app/lib/investing/intelligence/config.ts app/lib/investing/intelligence/themes.ts app/lib/investing/intelligence/themeIntelligence.ts app/lib/investing/intelligence/newsImpact.ts app/lib/investing/intelligence/engine.ts app/lib/investing/intelligence/providers/fred.ts app/lib/investing/intelligence/providers/sec.ts app/lib/investing/intelligence/readinessProjection.ts \
  app/lib/investing/intelligence/research/types.ts app/lib/investing/intelligence/research/marketHypothesis.ts app/lib/investing/intelligence/research/marketStructure.ts app/lib/investing/intelligence/research/picksAndShovels.ts app/lib/investing/intelligence/research/bottleneck.ts app/lib/investing/intelligence/research/causalDistance.ts app/lib/investing/intelligence/research/candidateDiscovery.ts app/lib/investing/intelligence/research/companyComparison.ts app/lib/investing/intelligence/research/orchestrator.ts \
  app/lib/investing/intelligence/horizon/types.ts app/lib/investing/intelligence/horizon/shared.ts app/lib/investing/intelligence/horizon/shortScore.ts app/lib/investing/intelligence/horizon/midScore.ts app/lib/investing/intelligence/horizon/longScore.ts app/lib/investing/intelligence/horizon/tripleGate.ts \
  app/lib/investing/types.ts app/lib/investing/portfolioRisk/types.ts app/lib/investing/portfolioRisk/thresholds.ts app/lib/investing/portfolioRisk/shared.ts app/lib/investing/portfolioRisk/themeConcentration.ts app/lib/investing/portfolioRisk/sectorConcentration.ts app/lib/investing/portfolioRisk/singleStockExposure.ts app/lib/investing/portfolioRisk/countryExposure.ts app/lib/investing/portfolioRisk/currencyExposure.ts app/lib/investing/portfolioRisk/correlationRisk.ts app/lib/investing/portfolioRisk/drawdownRisk.ts app/lib/investing/portfolioRisk/thesisRisk.ts app/lib/investing/portfolioRisk/orchestrator.ts \
  app/lib/investing/opportunityPipeline/types.ts app/lib/investing/opportunityPipeline/deriveStatus.ts app/lib/investing/opportunityPipeline/build.ts \
  app/lib/investing/intelligence/decisionPerformance/types.ts app/lib/investing/intelligence/decisionPerformance/returns.ts app/lib/investing/intelligence/decisionPerformance/build.ts app/lib/investing/intelligence/decisionPerformance/summary.ts app/lib/investing/intelligence/decisionPerformance/segments.ts \
  app/lib/investing/intelligence/learning/types.ts app/lib/investing/intelligence/learning/stats.ts app/lib/investing/intelligence/learning/factorPerformance.ts app/lib/investing/intelligence/learning/learningCandidate.ts \
  --outDir "$DIST/intel" --rootDir app/lib --module commonjs --target es2021 --esModuleInterop --skipLibCheck

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
  "files": ["$PWD/proxy.ts", "$PWD/app/lib/auth/session.ts", "$PWD/app/lib/auth/read-limited-body.ts"]
}
EOF
npx tsc -p "$DIST/mw-tsconfig.json"
cp "$DIST/mw-raw/proxy.js" "$DIST/mw/proxy.js"
cp "$DIST/mw-raw/app/lib/auth/session.js" "$DIST/mw/session.js"
cp "$DIST/mw-raw/app/lib/auth/security-store.js" "$DIST/mw/security-store.js"
cp "$DIST/mw-raw/app/lib/auth/read-limited-body.js" "$DIST/mw/read-limited-body.js"
node -e "
const fs = require('fs');
const p = process.env.FUND_DIST + '/mw/proxy.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('@/app/lib/auth/session', './session');
fs.writeFileSync(p, s);
const storePath = process.env.FUND_DIST + '/mw/security-store.js';
let store = fs.readFileSync(storePath, 'utf8');
store = store.replace('require(\"@/app/lib/utils/redis\")', '{ getRedisClient: () => null }');
fs.writeFileSync(storePath, store);
"

# NODE_PATH: /tmpへコンパイルしたmiddleware.jsが next/server を解決できるようにする
NODE_ENV=test NODE_PATH="$PWD/node_modules" node --test tests/fund/*.test.mjs
