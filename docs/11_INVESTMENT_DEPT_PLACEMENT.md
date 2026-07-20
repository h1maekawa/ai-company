# 11. 投資部門 配置設計書（Flow+連携対応）

作成日: 2026-07-19
前提資料: `docs/investment/flow_plus_ai_company_integration_spec.md`（連携設計書）、`docs/investment/portfolio_analysis_20260719.md`、`docs/investment/investment_learning_note_source.md`

## 結論

連携設計書の「個人用AI会社の投資部門」は、**新設ではなく既存のFund Department（`personal-fund`）を拡張**して実装する。理由は、投資判断AI（Fund Manager）・判断ログ（investment-log）・fund API・メモリ構造がすでに存在し、責任範囲が連携設計書とほぼ一致するため。

## 既存資産と連携設計書のマッピング

| 連携設計書の責務 | 実装場所 | 状態 |
|---|---|---|
| 銘柄分析・RVOL・売買候補・判断ロジック | `departments.ts` 内 Fund Manager AI（`personal-fund`）のプロンプト＋既存スラッシュコマンド（/buy-signal等） | 既存 |
| 判断理由と実績の保存 | `memory/personal/fund/investment-log/` ＋ `POST /api/fund/log` | 既存 |
| 楽天証券CSV解析 | `app/lib/fund/rakutenCsv.ts` ＋ `POST /api/fund/import` | **Phase 1で実装済** |
| 現在ポートフォリオ・50:50差分・集中度 | `GET /api/fund/allocation` ＋ `/fund` 画面 | **Phase 1で実装済** |
| 保有資産スナップショット | `memory/personal/fund/holdings.md`（CSV取込で自動生成） | **Phase 1で実装済** |
| 当月投資可能額（Flow+連携前は手動） | `memory/personal/fund/capacity.md` | **Phase 1で実装済** |
| Flow+からの投資可能額自動取得 | `capacity.md` をFlow+ API取得結果で上書きする処理（後述） | Phase 3 |

## ディレクトリ配置

```text
ai-company/
├── ai-secretary/app/
│   ├── fund/page.tsx                      # 投資部門画面（CSV取込・50:50・集中度・投資可能額）★新規
│   ├── api/fund/
│   │   ├── import/route.ts                # POST 楽天証券CSV取込 ★新規
│   │   ├── allocation/route.ts            # GET  配分・集中度・投資可能額 ★新規
│   │   ├── log/route.ts                   # POST 投資判断ログ（既存）
│   │   └── report/route.ts                # GET  fundレポート（既存）
│   └── lib/fund/rakutenCsv.ts             # CSVパーサ・配分計算 ★新規
├── memory/personal/fund/
│   ├── holdings.md                        # CSV取込スナップショット（機械生成・手動編集禁止）★新規
│   ├── capacity.md                        # 当月投資可能額（Phase 1手動→Phase 3 Flow+自動）★新規
│   ├── positions.md                       # 投資仮説・Conviction（人間/AI判断メモ、既存）
│   ├── portfolio.md / rules.md / watchlist.md / themes.md / earnings.md（既存）
│   └── investment-log/                    # 判断ログ（既存）
└── docs/
    ├── 11_INVESTMENT_DEPT_PLACEMENT.md    # 本書
    └── investment/                        # 連携設計書・分析・学習ノート ★新規
```

## ⚠️ Vaultの場所に関する注意

`memory/personal/fund/` の**本番実体はコードリポジトリではなく `ai-company-vault`**（ローカルでは Dropbox `個人用/AI会社`、本番はGitHub Contents API経由）にある。コードリポジトリ内の `memory/` は過去のコピー。

- `holdings.md` はアプリが `saveVaultFile` 経由で書くため、本番/開発とも正しいVaultに自動生成される（対応不要）
- `capacity.md` は**手動でVault側（Dropbox AI会社/memory/personal/fund/）に配置し、pushすること**。コードリポジトリ側のコピーはテンプレート

## データの役割分担（DBは持たない）

このプロジェクトのストレージはGitHub Vault上のMarkdown（本番）／ローカルFS（開発）であり、投資部門もこれに従う。SQL DBは導入しない。

- `holdings.md` — 楽天証券CSVから機械生成される確定値。末尾の```jsonブロックをAPIが機械読み取りする。**数量・評価額の正はここ**
- `positions.md` — 投資仮説・リスク・Conviction Rank。人間とAIの判断レイヤー
- `capacity.md` — Flow+スキーマ（investable_amount等）と同じ項目名を使い、Phase 3でそのまま自動上書きに移行できる形にしてある

## 画面

- `/fund` — 投資部門トップ。CSVファイル選択（Shift_JISはブラウザ側でデコード）→取込→投信/個別株バー（目標50%ライン付き）・50:50不足額・個別株集中度・保有一覧・当月投資可能額（未確定表示対応）
- `/report` — 既存のfundレポート（positions.md・investment-logベース）。当面併存し、将来 `/fund` に統合可

## Flow+連携（Phase 2/3）の受け口

- 環境変数（Vercel）: `FLOWPLUS_API_BASE_URL`, `FLOWPLUS_API_TOKEN`（サーバー間認証。ブラウザへ露出させない）
- 取得処理: サーバー側で `GET {FLOWPLUS_API_BASE_URL}/api/integrations/investment-capacity?month=YYYY-MM` を呼び、レスポンスを `capacity.md` のjsonブロックへ書き込む（`source: "flow-plus"`）
- `/api/fund/allocation` と `/fund` 画面はcapacity.mdだけを見るため、手動→自動の切替で画面・API側の変更は不要
- `data_freshness` / `missing_data` が返る場合は画面に警告表示を追加する（Phase 3）

## セキュリティ・運用ルール（連携設計書より）

- 証券注文の自動実行はしない。最終判断は本人
- Gmail本文・カード明細・認証トークンを投資部門へ渡さない（Flow+からは集計値のみ）
- 全APIはmiddlewareのセッション認証配下（`/api/fund/*` も同様）
- 50:50不足額の一括購入は提案しない。capacity.mdの投資可能額の範囲内で段階的に

## 残タスク

- [ ] Flow+側: 家計集計＋読取専用API実装（Flow+リポジトリ、Phase 2）
- [ ] AI会社側: Flow+ API取得→capacity.md自動更新（Phase 3）
- [ ] `/fund` 画面へのdata_freshness警告表示（Phase 3）
- [ ] 実CSVでの取込テスト（列名が想定と異なる場合は `rakutenCsv.ts` の候補リストへ追加）
- [ ] RVOL・出来高の外部データ自動取得は現状Fund Manager AIの調査ベース。自動化する場合はデータソース選定から別途設計
