# Obsidian Vault パス契約

## Vaultの役割

`ai-company` はアプリケーション、プロンプト、実行ロジックを管理する。永続データの本体は別リポジトリ `h1maekawa/ai-company-vault` に置き、Obsidianでは `00_HOME/AI会社_全体マップ.md` を入口として参照する。

Vault内の既存ファイルやフォルダのパスはアプリのAPI契約である。情報設計を変更するときも既存項目を移動・改名・削除せず、MOC/INDEX側からフルパスのWikilinkで接続する。

## 読み書き方式

共通のI/Oは `app/lib/vault.ts` の `getVaultFile`、`saveVaultFile`、`listVaultEntries`、`listVaultDirectory` を経由する。

- 本番: `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_TOKEN` がすべて設定されているとGitHub Contents APIを使用する。`GITHUB_BRANCH` は未設定時に `main`。
- ローカル: 上記3値が揃わない場合、`VAULT_ROOT` 配下のローカルファイルシステムを使用する。
- 本番の `GITHUB_REPO` は `ai-company-vault`、`GITHUB_OWNER` は `h1maekawa` を想定する。
- `GITHUB_TOKEN` はサーバー専用の秘密情報であり、リポジトリへ保存しない。

## 変更禁止パス

次のファイルはコードから直接参照される。移動、改名、削除、およびMOCリンク追加を目的とした本文編集をしない。

### 個人・会社メモ

- `memory/personal/profile.md`
- `memory/personal/goals.md`
- `memory/personal/today.md`
- `memory/personal/rules.md`
- `memory/personal/thinking/index.md`
- `memory/company/profile.md`
- `memory/company/goals.md`
- `memory/company/tasks.md`
- `memory/shared/ai-development-rules.md`
- `memory/current-bus.json`

### Note事業

- `memory/personal/note/idea-inbox.md`
- `memory/personal/note/affiliate-links.md`
- `memory/personal/note/brand.md`
- `memory/personal/note/kpi.md`
- `memory/personal/note/business-strategy.md`
- `memory/personal/note/x-free-workspace.md`
- `memory/personal/note/MAEMICHI_BRAND_POSTING_RULES.md`（既定値。`MAEMICHI_BRAND_RULES_PATH` で変更可能）
- `memory/personal/note/reference-accounts.md`
- `memory/personal/note/research-settings.md`
- `memory/personal/note/research-inbox.md`
- `memory/personal/note/trend-clusters.md`
- `memory/personal/note/experience-library.md`
- `memory/personal/note/content-briefs.md`
- `memory/personal/note/social-drafts.md`
- `memory/personal/note/publishing-history.md`
- `memory/personal/note/content-performance.md`
- `memory/personal/note/note-publish-queue.md`
- `memory/personal/note/viewpoint-library.md`

### 投資

- `memory/personal/fund/fund.md`
- `memory/personal/fund/rules.md`
- `memory/personal/fund/watchlist.md`
- `memory/personal/fund/portfolio.md`
- `memory/personal/fund/positions.md`
- `memory/personal/fund/themes.md`
- `memory/personal/fund/earnings.md`
- `memory/personal/fund/holdings.md`
- `memory/personal/fund/capacity.md`
- `memory/personal/fund/policy.md`
- `memory/personal/fund/recommendations.md`
- `memory/personal/fund/decisions.md`
- `memory/personal/fund/value-history.md`
- `memory/personal/fund/news-cache.md`

### 計画

- `memory/personal/planning/time-template.md`
- `memory/personal/planning/YYYY-MM-DD.md`

## アプリが走査するフォルダ

- `memory/personal/note/drafts/`
- `memory/personal/note/templates/`
- `memory/personal/fund/investment-log/`
- `memory/personal/planning/`
- `memory/personal/piro/02_Research/`
- `memory/personal/piro/03_Content/Drafts/`
- `memory/personal/piro/04_Distribution/X/`
- `memory/knowledge/{sales,marketing,recruiting,investing,systems,content,strategy,misc}/`
- 各秘書の `memoryScope` に指定された `memory/` 配下

フォルダ走査は本番でも動くため、これらのフォルダ名も変更しない。

## 自動生成・更新ファイル

- 会話ログ: `memory/chat-log/{secretaryId}/YYYY-MM-DD-summary.md`
- 改善提案: `memory/kaizen/YYYY-MM-DD.md`
- アーカイブ: `memory/archive/{mode}/{name}-YYYY-MM-DD.md`
- 投資ログ: `memory/personal/fund/investment-log/YYYY-MM-DD-{ticker}.md`
- 計画: `memory/personal/planning/YYYY-MM-DD.md`
- Note下書き: `memory/personal/note/drafts/YYYY-MM-DD-{slug}.md`
- Knowledge: `memory/knowledge/{category}/YYYY-MM-DD-{slug}.md`
- Piro成果物: `memory/personal/piro/` 配下の部門別フォルダ
- Inbox処理結果: 呼び出し側が指定する `memory/` 配下

固定ストアの多くは「人間可読Markdown＋末尾JSONコードブロック」で、保存時にファイル全体が再生成される。INDEXリンク、タグ、説明文を直接追記せず、`00_HOME` のMOCから参照する。

## Vault整理時のチェック

1. 変更前後の全ファイル一覧を比較し、既存パスの削除・移動・改名が0件であることを確認する。
2. アプリ管理MarkdownとJSONは変更対象から除外する。
3. 新規WikilinkはVaultルートからのフルパスで書き、リンク先の実在を検証する。
4. 同名ノートは必ずフルパスで区別する。
5. `.obsidian/workspace*.json` は端末固有状態として変更しない。
6. Vercelでは `GITHUB_REPO=ai-company-vault` と対象ブランチを確認する。トークン値はログやドキュメントへ出さない。
