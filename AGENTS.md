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

## Imported Claude Cowork project instructions
