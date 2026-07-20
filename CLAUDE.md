# AI Company OS - Developer Guide & Slash Commands

This guide outlines common development commands and the available slash commands for the AI Secretary modes.

## Development Commands

- **Run Dev Server**: `npm run dev` (run inside `ai-secretary` directory)
- **TypeScript Check**: `npx tsc --noEmit` (run inside `ai-secretary` directory)
- **Production Build**: `npm run build` (run inside `ai-secretary` directory)

---

## Slash Commands List

### 1. Morning Secretary (`personal-morning`) / General
- `/morning-report` - 毎朝のモーニングレポート自動生成 (Synthesizes live tasks, inbox, positions, drafts, and goals)

### 2. Fund Department (`personal-fund`)
- `/fund-review` - 総合投資レビュー (Comprehensive investment review)
- `/market-scan` - 市況スキャン (Market environment scanning)
- `/earnings-check [銘柄]` - 決算チェック (Check earnings of a specific ticker, e.g., `/earnings-check NVDA`)
- `/rotation-check` - セクターローテーション確認 (Sector rotation analysis)
- `/buy-signal [銘柄]` - 買いシグナル分析 (Buy signal entry evaluation, e.g., `/buy-signal NVDA`)
- `/sell-signal [銘柄]` - 売りシグナル分析 (Sell signal evaluation, e.g., `/sell-signal NVDA`)
- `/risk-check` - リスク点検 (Risk management & rules compliance check)
- `/portfolio-review` - ポートフォリオ全体評価 (Portfolio asset allocation review)
- `/fund-heatmap` - ポートフォリオ保有割合・テーマ偏りヒートマップ分析

#### Investment Department (Phase 1, 2026-07-19)
投資部門の配置設計は `docs/11_INVESTMENT_DEPT_PLACEMENT.md`、Flow+連携仕様は `docs/investment/` を参照。
- 画面: `/fund` （楽天証券CSV取込・投信50:個別株50差分・集中度・当月投資可能額）
- API: `POST /api/fund/import`（CSV取込→`memory/personal/fund/holdings.md` 自動生成）、`GET /api/fund/allocation`
- 投資可能額: `memory/personal/fund/capacity.md`（Phase 1は手動入力、Phase 3でFlow+ APIから自動更新）
- ルール: 証券注文の自動実行はしない／保有確定値の正は `holdings.md`、判断メモは `positions.md`

#### Fund Policy Engine (Phase 1.1〜1.3, 2026-07-19)
仕様の正は `docs/12_FUND_POLICY_ENGINE.md`。
- ポリシー: `app/lib/fund/policy.ts`（バージョン付き設定・数値直書き禁止）＋ `memory/personal/fund/policy.md`
- エンジン: `app/lib/fund/engine.ts`（ゲート判定・購入額/株数は決定論的関数。AIプロンプトでは計算しない）
- 市場データ: `app/lib/fund/marketData/`（プロバイダー抽象化、Stooqデフォルト、RVOL20/ADTV20/ATR14）
- API: `GET/PUT /api/fund/policy`、`POST /api/fund/evaluate`、`GET /api/fund/recommendations`、`POST /api/fund/decisions`、`GET /api/fund/reviews`
- テスト: `npm run test:fund`（ai-secretary内。§20受入条件をカバー）
- 短期はpaper mode（30日 or 20件決着まで実資金移行しない）

### 3. Note Department (`personal-note`)
- `/note-research` - トレンド＋競合＋アフィリ案件の3点調査
- `/note-title` - バズりタイトル5案（アフィリ連動度スコア付き）
- `/note-outline` - 構成案（有料パート境界線＋CTA設計込み）
- `/note-draft` - 下書き全文自動生成（フック＋アフィリ文脈＋CTA埋め込み済み）
- `/note-post-plan` - 投稿スケジュール＋X告知文3パターン
- `/note-kpi` - 月次KPI確認と次週の優先アクション提案
- `/note-affili [テーマ]` - テーマから最適アフィリ案件を自動選定
- `/note-paid [タイトル]` - 有料コンテンツの切り出し設計

---

### Command Flow & Auto-Logging
When you execute fund entry/exit commands, the system routes the request to the **Fund Manager AI**.
If the AI issues an investment decision, it outputs a hidden metadata block (`<!-- FUND_LOG: {...} -->`) which the server automatically parses and saves as a Markdown log under `memory/personal/fund/investment-log/YYYY-MM-DD-TICKER.md`.
