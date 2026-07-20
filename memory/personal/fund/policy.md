---
id: fund-policy
type: fund_policy
version: 1
updated: 2026-07-19
---

# Fund Department ポリシー設定（policyVersion: 1）

このファイルは /api/fund/policy が読み書きする。仕様は docs/12_FUND_POLICY_ENGINE.md。
数値の意味を変更する場合は必ず policyVersion を上げること。
未配置の場合、アプリはコード内の DEFAULT_POLICY（同値）で動作する。

⚠️ 本番の実体は ai-company-vault（Dropbox「AI会社」）の memory/personal/fund/policy.md。
このコードリポジトリ内のコピーはテンプレート。

```json
{
  "policyVersion": 1,
  "updatedAt": "2026-07-19",
  "allocation": {
    "targetFundPct": 50,
    "targetStockPct": 50,
    "tolerancePct": 5,
    "strongWarnLowPct": 40,
    "strongWarnHighPct": 60
  },
  "singleStock": {
    "warningPct": 30,
    "hardLimitPct": 40,
    "highConcentrationPct": 50
  },
  "theme": {
    "warningPct": 60,
    "hardLimitPct": 70
  },
  "themes": {
    "semiconductor": ["NVDA", "MU", "AMD", "AVGO", "TSM", "ASML", "LRCX", "AMAT", "INTC", "QCOM", "ARM", "SMCI"],
    "ai_software": ["MSFT", "GOOGL", "META", "PLTR", "CRM", "NOW"],
    "cybersecurity": ["CRWD", "PANW", "ZS", "S", "FTNT"]
  },
  "freshness": {
    "capacityMaxAgeHours": 24,
    "priceMaxAgeDays": 4
  },
  "scoring": {
    "buyMin": 75,
    "watchMin": 60,
    "reviewMin": 40
  },
  "riskBudgetPct": {
    "short": 0.5,
    "medium": 0.75,
    "long": 1.0
  },
  "stagedBuyPct": [40, 30, 30],
  "marketEnvCoefficient": {
    "RISK_ON": 1.0,
    "NEUTRAL": 0.75,
    "RISK_OFF": 0.5,
    "UNKNOWN": 0.5
  },
  "liquidity": {
    "short": { "minAdtvUsd": 20000000, "maxSpreadPct": 0.3 },
    "medium": { "minAdtvUsd": 10000000, "maxSpreadPct": 0.5 },
    "long": { "minAdtvUsd": 5000000, "maxSpreadPct": 0.75 }
  },
  "rvol": {
    "lowMax": 0.8,
    "normalMax": 1.2,
    "elevatedMax": 1.5,
    "highMax": 2.0,
    "overheatedRvol": 3.0,
    "overheatedChangePct": 10
  },
  "stopLoss": {
    "short": { "atrMult": 1.5, "minPct": 5, "maxPct": 10 },
    "medium": { "forcedReviewDropPct": 15 },
    "long": { "forcedReviewDropPct": 20 }
  },
  "earningsBlackoutDays": 2,
  "paperMode": {
    "enabled": true,
    "minimumDays": 30,
    "minimumClosedSignals": 20,
    "assumedRoundTripCostPct": 0.4
  }
}
```
