---
id: fund-capacity
type: fund_capacity
source: manual
updated: 2026-07-19
---

# 当月の投資可能額（Flow+連携前・手動入力）

Phase 1ではこのファイルへ手動入力する。
Phase 2/3でFlow+の `GET /api/integrations/investment-capacity` から自動更新に置き換える（`source: flow-plus` になる）。
`investable_amount` が `null` の間、投資部門画面では「未確定」と表示され、新規購入候補の金額提示は行わない。

## 入力欄（下のjsonブロックを編集する）

```json
{
  "target_month": "2026-07",
  "investable_amount": null,
  "personal_cash_floor": null,
  "already_invested": null,
  "source": "manual",
  "calculated_at": null
}
```

## 記入ルール

- 金額は円の整数で入力する（例: `"investable_amount": 28000`）
- 投資可能額の考え方はFlow+連携設計書（docs/investment/flow_plus_ai_company_integration_spec.md）の基本式に従う
- 不足額の一括投入はしない。当月の投資可能額の範囲内でのみ購入候補を検討する
