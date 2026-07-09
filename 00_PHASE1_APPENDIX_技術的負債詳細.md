# AI Company v2 — Phase1 現状分析

> Charter記載の通り、本フェーズはコードを書かず「現状把握」のみを目的とする。
> 以降の設計判断（Phase2〜）はすべてこの分析をベースラインとする。
> 調査対象: リポジトリ `ai-company`（2026-07-09時点、最新コミット `05580c8`）

---

## 1. Architecture（全体アーキテクチャ）

AI Companyは「Next.js製の薄いAPIレイヤー + Obsidian Vault（GitHub管理のMarkdown群）」という構成。DBは持たず、**Markdownファイルそのものが永続化層**になっている。

```
┌─────────────────────────────────────────────────────────┐
│  Obsidian (ローカル / Dropbox Vault)                       │
│  vaults/{personal,holding,crestix}-vault/*.md              │
│  ← obsidian-git プラグインでGitHubと同期（人間が編集する入口）  │
└───────────────┬─────────────────────────────────────────┘
                 │ git push/pull
┌───────────────▼─────────────────────────────────────────┐
│  GitHub リポジトリ（Single Source of Truth = Vault）         │
│  memory/**/*.md                                            │
└───────────────┬─────────────────────────────────────────┘
                 │ GitHub Contents API（読み書き）
┌───────────────▼─────────────────────────────────────────┐
│  ai-secretary/ (Next.js 14 App Router, Vercelにデプロイ)     │
│  ├─ app/api/*        … 各機能のAPIエンドポイント              │
│  ├─ app/lib/config/* … 部署・秘書・スコープのレジストリ定義      │
│  ├─ app/lib/router/* … 発話 → 担当秘書へのルーティング         │
│  ├─ app/lib/memory/* … Vaultの読み書き・アーカイブ             │
│  ├─ app/lib/ai/*     … LLMプロバイダ抽象化(Gemini/Groq/Ollama)│
│  └─ app/lib/context/bus* … 会話状態(ContextBus)の永続化       │
└───────────────┬─────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  Upstash Redis    │ … ContextBus（Inbox/タスク）の高速層
        │（GitHubより高頻度で書き換わる状態のミラー）             │
        └───────────────────┘
```

**設計思想の核**: チャットUIが秘書に話しかける → Executive Router（LLM）が担当秘書を判定 → 該当秘書のプロンプト＋スコープ指定されたVault内Markdownを読み込み → LLM生成 → 応答をチャットログとしてVaultに書き戻す、というシンプルな「ステートレスAPI + ファイルベース記憶」ループ。会話のロング・ターム記憶はコンテキストウィンドウではなく**Vault内のMarkdownファイル**が担っている。

---

## 2. Directory Structure（ディレクトリ構成）

```
ai-company/                          … リポジトリルート
├── CLAUDE.md / AGENTS.md            … 開発ガイド・スラッシュコマンド一覧（内容はほぼ同一）
├── CRITICAL_FIXES.md                … 過去の実装指示書（認証・XSS・マルチターン対応、実施済み）
├── NOTE_COMPANY_REQUIREMENTS.md     … note事業拡張の実装指示書（部分的に実施済み・一部未着手）
├── START-HERE.md                    … 最小限のオンボーディングメモ
├── start.sh                         … 起動スクリプト
├── package.json                     … ルート直下にも簡易package.json（実質未使用、本体はai-secretary/）
│
├── ai-secretary/                    … アプリ本体（Next.js 14 / React 18 / Tailwind）
│   ├── app/
│   │   ├── api/                     … 9本のRoute Handler（詳細は5節）
│   │   ├── lib/
│   │   │   ├── ai/                  … Gemini / Groq / Ollama 呼び出し抽象化
│   │   │   ├── auth/                … verifyApiSecret（共通認証）
│   │   │   ├── authority/           … cfo.ts / coo.ts / cso.ts（権限ロール定義、未配線）
│   │   │   ├── config/              … departments.ts / scopes.ts / registry.ts / modes.ts / projects.ts / memory-map.ts
│   │   │   ├── context/             … bus.ts（型・純関数） / bus-server.ts（Redis+file永続化）
│   │   │   ├── memory/              … loader / saver / logs / knowledge / notes / capture
│   │   │   ├── parser/              … saveSuggestion.ts / wikilink.ts
│   │   │   ├── pipeline/            … inboxPipeline.ts / inboxQueue.ts
│   │   │   ├── router/              … executive.ts（LLMルーター） / inbox.ts（Inbox分類）
│   │   │   ├── runtime/             … paths.ts（VAULT_ROOT解決） / bus.ts（bus.jsonパス解決）
│   │   │   ├── utils/                … id.ts / redis.ts / slug.ts
│   │   │   ├── github.ts            … Octokit版 Vaultクライアント（role/tasks専用）
│   │   │   ├── vault.ts             … fetch版 Vaultクライアント（本流、local fs fallback付き）
│   │   │   ├── prompts.ts           … 旧世代プロンプト定義（4モード、現状呼び出し元なし＝デッドコード）
│   │   │   └── report/morning.ts    … 朝会レポート生成ロジック
│   │   ├── report/page.tsx          … 投資レポート専用画面
│   │   └── page.tsx                 … メインチャットUI
│   └── components/                  … Breadcrumbs / ExecutivePanel / FlowMap / OrgTree / SecretaryHeader
│
├── memory/                          … Vault本体（ローカル開発時はここを直接読み書き、本番はGitHub API経由）
│   ├── company/                     … Crestix経営情報（profile, strategy, hd-business/配下にKPI等）
│   ├── crestix/                     … profile.md/strategy.md（company/と役割重複、詳細は7節）
│   ├── personal/                    … 個人事業（fund, note, finance, investment, tasks, logs, capture, thinking）
│   ├── note/                        … トップレベルnoteディレクトリ（personal/note/と重複、詳細は7節）
│   ├── shared/                      … ai-development-rules.md（開発ルール）
│   ├── chat-log/ archive/           … 秘書ごとの日次要約ログ / 上書き前アーカイブ
│   └── flow-map/ goals.md / today.md / current-bus.json
│
├── vaults/                          … Obsidian Vault（3つ、UI表示・人間の閲覧編集用）
│   ├── crestix-vault/ holding-vault/ personal-vault/
│
├── vault/AI会社/                    … 旧世代？の単一Vaultフォルダ（用途不明、要確認）
├── prompts/secretaries/             … business.md / note.md / personal.md（CLI版secretary.py用）
├── secretaries/personal-secretary.md
└── scripts/
    ├── secretary.py                 … Ollamaローカル秘書CLI（web版とは独立した実験的ツール）
    └── sync-obsidian-memory.mjs     … Dropbox Vault → repo memory/ の差分コピー（--overwrite可）
```

---

## 3. Departments（事業部門）

`app/lib/config/departments.ts` の `DEPARTMENTS` 配列が唯一の定義源（Single Source）。3階層構造: **Department → (Room →) Secretary**。

| Department ID | 名称 | company区分 | 構成 |
|---|---|---|---|
| `executive` | AIアシスタント | shared | 秘書2体（雑談窓口・Inbox） |
| `personal` | Personal OS | personal | 秘書4体 + Room「Fund Department」内に秘書1体 |
| `company` | Company OS | company | 秘書2体 + 互換用エイリアス秘書2体（`crestix-*`） |
| `hd-business` | HDBusiness | company | Room「HD Business」内に秘書5体 |

CLAUDE.md記載のスラッシュコマンド（`/morning-report` `/fund-review` 等）は**Claude Code独自のスラッシュコマンドではなく**、チャット入力欄にユーザーがそのまま打ち込む文字列。`router/executive.ts`のキーワードマッチ・LLM判定がこれを解釈して担当秘書にルーティングしている。`.claude/commands/`のような実装は存在しない。

---

## 4. Secretaries（秘書一覧）

全16体（互換用エイリアス含む）。`registry.ts`が`departments.ts`をフラット化し、`secretaryId → {department, room, config}`のルックアップを構築する。

| 秘書ID | 役割 | 所属 | メモリスコープ（要約） |
|---|---|---|---|
| `executive-assistant` | 全般サポート・橋渡し | executive | profile.md（personal/company） |
| `executive-inbox` | Inbox収集 | executive | profile.md |
| `personal-ceo` | 個人事業統括・リソース配分 | personal | rules, thinking, goals, investment/, finance/, fund/, note/ |
| `personal-morning` | 朝会・日次オペレーション | personal | rules, goals, tasks/, logs/, finance/, fund/positions.md, note/ |
| `personal-note` | note収益化（企画〜下書き） | personal | note/ 一式、affiliates/index.md・kpi.md（**未作成、5節参照**） |
| `personal-finance` | 資産形成・個別株分析 | personal | finance/ |
| `personal-fund` | 投資判断OS（Fund Manager AI） | personal › Fund Department | fund.md, rules.md, watchlist, portfolio, positions, themes, earnings, investment-log/ |
| `company-ceo` / `crestix-ceo`(互換) | Crestix経営統括 | company | company/profile.md, strategy.md, strategy/index.md |
| `company-system` / `crestix-system`(互換) | AI Company OS開発 | company | company/profile.md, strategy.md |
| `hd-ceo` | HD事業部統括 | hd-business | hd-business/, strategy/index.md |
| `hd-kpi-manager` | KPI逆算 | hd-business | hd-business/{targets,kpi,daily,weekly}.md |
| `hd-pipeline-manager` | 案件進捗・着地予測 | hd-business | hd-business/{pipeline,lead-times,targets}.md |
| `hd-closing-manager` | クロージング支援 | hd-business | hd-business/{pipeline,targets,kpi,lead-times}.md |
| `hd-improvement-manager` | ボトルネック改善 | hd-business | hd-business/{bottlenecks,kpi,weekly,playbook,rules}.md |

**注意**: `scopes.ts`（`MEMORY_SCOPES`、local/shared/globalの3階層）と`departments.ts`内`Secretary.memoryScope`フィールドの**2箇所にスコープ定義が存在**する。実際に読み込みで使われるのは`loadScopedMemory()`が参照する`scopes.ts`側のみで、`departments.ts`の`memoryScope`フィールドは（現状コード上）読み込みには使われていない可能性が高い（8節で詳述）。

---

## 5. Skills（Claude Code Skills）

現状、本プロジェクトに **Claude Code Skillsの実装は一切存在しない**（`.claude/skills/`や`.claude/commands/`は空、`settings.local.json`にpermission設定のみ）。Charterが掲げる「Skills First」はv2の新方針であり、v1では「秘書ごとのプロンプト＋Vaultスコープ」がすべてのロジックを担っている。Phase5「Skills設計」がゼロからのスタートになる。

---

## 6. Prompts（プロンプト体系）

**2つの独立したプロンプト体系が並存している**（技術的負債として8節でも扱う）:

1. **本流: `departments.ts`内の`Secretary.prompt`** — 各秘書が個別に持つロールプロンプト。`chat/route.ts`が実際に読み込み、LLMのsystem promptとして使用しているのはこちら。Executive Routerによるルーティング先の秘書のプロンプト＋スコープ済みMarkdown＋当日のチャット要約ログを連結して1つのsystem promptを構成する。
2. **旧世代: `app/lib/prompts.ts`の`SYSTEM_PROMPTS`** — personal/company/finance/noteの4モード分のプロンプト（各150行前後、かなり作り込まれている）。`getSystemPrompt()`関数を含め、**現状どこからも呼び出されていない**（grep結果: 自己参照のみ）。UI側の`SECRETARY_LABELS`/`SECRETARY_DESCRIPTIONS`（モード選択プルダウンの表示名）としてのみ生き残っている。

チャットAPIへのプロンプト注入順序（`chat/route.ts`実装）:
```
[秘書固有prompt] + [Scoped Memory Context（local→shared→globalの順で連結）]
  + [今日のチャット要約ログ（存在すれば）]
  + [companyモード時のみ: role.md/tasks.md + タスク更新指示]
```

---

## 7. Memory（メモリ構造）

`memory/`配下がAIの長期記憶。ローカル開発時はファイルシステムを直接読み書き、本番（Vercel）はGitHub Contents APIで読み書きする設計（`vault.ts`が両対応を吸収）。

**発見した重複・不整合**（Charter原則2「Memory First・現状構成を維持」を検討する上で要整理）:

- `memory/note/` と `memory/personal/note/` が両方存在。秘書のスコープ定義（`scopes.ts`）が参照しているのは`memory/personal/note/`のみで、`memory/note/`（drafts/ideas/published/research/templates持ち）は現状どの秘書からも参照されていない孤立ディレクトリの疑いが強い。
- `memory/company/` と `memory/crestix/` も同様の重複。`company-ceo`/`company-system`は`memory/company/`のみを見ており、`memory/crestix/`（profile.md, strategy.md）は`crestix-*`互換秘書のスコープにも実は含まれておらず（`scopes.ts`の`crestix-ceo`は`memory/company/strategy/index.md`を見ている）、孤立している可能性が高い。
- `NOTE_COMPANY_REQUIREMENTS.md`が前提とする`memory/personal/note/affiliates/index.md`・`memory/personal/note/kpi.md`・`memory/brain/personal/note-business.md`は**いずれも現物が存在しない**。`memory/brain/`はgit log上「未使用フォルダとして削除済み」（コミット`0ab9be6`）。つまりこの要件定義書はタスクの一部（プロンプトへのスコープ追加）だけがコードに反映され、実データファイルの作成は未実施という中途半端な状態。
- 一方で`memory/personal/note/business-strategy.md`（要件定義書にない名前）が存在しており、`personal-note`秘書のスコープにも登録済み。おそらく`note-business.md`の代替として作られたもの。

---

## 8. Vaults（Obsidian連携）

`vaults/`配下に3つのObsidian Vault（`personal-vault` / `holding-vault` / `crestix-vault`）。各Vaultは`00_Dashboard.md.md`をはじめ、ファイル名の末尾に`.md.md`という二重拡張子が付いている（Obsidianプラグイン側の命名慣習と思われるが要確認）。`.obsidian/plugins/`には`obsidian-git`と`git-obsi-sync`が入っており、人間がObsidianで編集 → git commit → GitHub Vault反映、という同期経路を持つ。

これとは別に`vault/AI会社/`という単一フォルダが存在し、用途不明（3つのvaults/と役割が重複している可能性）。また`scripts/sync-obsidian-memory.mjs`は**Dropbox上のローカルVault**（`VAULT_ROOT`環境変数、デフォルトは前川さんの個人Dropboxパス）から`memory/personal`と`memory/shared`だけを差分コピーするツールで、リポジトリ内`vaults/`ディレクトリとは別経路。Vaultの実体が「Dropbox上のObsidian」「リポジトリ内`memory/`」「リポジトリ内`vaults/`」の3箇所に分散している状態で、Charter原則1「Obsidian First / Single Source of Truth」を進める上では、まずこの3者の関係を確定させる必要がある。

---

## 9. APIs（エンドポイント一覧）

全エンドポイントは`verifyApiSecret()`による共通ヘッダー認証（`x-api-secret`、`API_SECRET`未設定時はVercel上ではブロック・ローカルはスルー）を実装済み（`CRITICAL_FIXES.md`のTASK-01が反映済み）。

| Method / Path | 役割 | 主な内部呼び出し |
|---|---|---|
| `POST /api/chat` | メインチャット（ルーティング→生成→ログ保存） | routeRequest, loadScopedMemory, callAI, saveChatLog |
| `GET/PUT /api/vault/[...path]` | Vault内任意ファイルの汎用CRUD | vault.ts (fetch版) |
| `GET/PUT /api/memory/[filename]` | role.md/tasks.md/profile.md/goals.md/today.md専用CRUD | github.ts (Octokit版、**vault.tsと別実装**) |
| `POST /api/fund/log` | 投資判断ログの新規作成・追記 | vault.ts |
| `GET /api/fund/log` | 投資判断ログの取得 | vault.ts |
| `GET /api/fund/report` | positions/portfolioをパースしてJSON化（`/report`画面用） | vault.ts + 独自Markdownテーブルパーサ |
| `POST /api/note/generate` | テーマ指定でnote下書き自動生成 | memory/notes.ts |
| `POST /api/note/promote` | ナレッジ→リサーチ→下書きへの昇格パイプライン | knowledge.ts, callAI, vault.ts |
| `POST /api/knowledge/save` | ナレッジベースへの保存 | memory/knowledge.ts |
| `GET /api/report/morning` | 朝会レポート生成 | report/morning.ts（**vault.tsを使わずfsを直接叩く、10節参照**） |

---

## 10. Data Flow（データフロー）

### 10-1. チャット1往復の流れ
```
ユーザー発話
 → routeRequest()（キーワード即決 or LLM Executive Router）
 → findSecretary()で秘書configを特定
 → loadScopedMemory()でlocal→shared→globalの順にVaultからMarkdown取得
 → systemPrompt = 秘書prompt + Scoped Memory + 当日チャット要約
 → callAI()でGemini（既定）→ 応答生成
 → ContextBus更新（Redis優先書き込み、file mirrorはEROFSセーフ）
 → saveChatLog()で memory/chat-log/{secretaryId}/{date}-summary.md に要約保存
 → クライアントへreply返却
```

### 10-2. ContextBus（会話状態）の二重永続化
`bus-server.ts`が「Redis（Upstash）が本流、ファイルはミラー」という設計。Vercel本番はファイルシステムが読み取り専用（`/tmp`以外）なので、EROFSエラー時は`/tmp/current-bus.json`に自動フォールバックする実装になっている。ローカル開発時は`memory/current-bus.json`（または類似パス）に書く。

### 10-3. Vaultアクセスの二重実装（要注意）
- `vault.ts`（fetch直叩き＋ローカルfs fallback）: `chat`, `vault`, `fund/*`, `note/*`, `knowledge/*`が使用。**本流**。
- `github.ts`（Octokit、fallbackなし）: `api/memory/[filename]`と`chat/route.ts`内のcompanyモード用`role.md`/`tasks.md`取得のみが使用。ローカルフォールバックがないため、ローカル開発時にGitHub環境変数が未設定だとこの経路だけ機能しない。

### 10-4. Morning Reportだけローカルfsを直接参照（本番で壊れる可能性）
`report/morning.ts`は`fs.readFileSync(resolveVaultPath(...))`で`positions.md`・note下書き一覧・`kpi.md`・HD Business KPI・goals.mdを**直接ローカルファイルシステムから**読んでいる。`VAULT_ROOT`の既定値は前川さんの個人PCのDropboxパスであり、Vercel本番環境にはこのパスは存在しない。git log上、`loader.ts`（チャット側のメモリ読み込み）は「メモリスコープ読み込みがローカルfsに依存していたバグを修正」（コミット`efaec11`）済みだが、**`morning.ts`は同じ修正が適用されていない**。記憶メモに残っている「Gemini がFinance modeで実データを使っていない」問題は、この経路の可能性が高い。

---

## 11. Dependencies（依存関係）

`ai-secretary/package.json`より:

| 種別 | ライブラリ | 用途 |
|---|---|---|
| フレームワーク | next 14.2.5, react 18, react-dom 18 | App Router構成 |
| GitHub連携 | @octokit/rest 22 | `github.ts`（role/tasks専用） |
| 状態ストア | @upstash/redis 1.38 | ContextBus（Inbox/タスク） |
| Markdown描画 | marked 18, dompurify 3.4 | チャットUIのMarkdown→HTML変換＋XSSサニタイズ |
| スタイル | tailwindcss 3.4 | 全UI |
| 型・ビルド | typescript 5, @types/* | — |

外部SaaS依存: **GitHub**（Vault本体、Contents API経由）、**Vercel**（ホスティング、`.vercel/repo.json`でプロジェクトID確認済み）、**Upstash Redis**（ContextBus）、**Gemini API**（既定LLM）、**Groq API**（フォールバックLLM）、**Ollama**（ローカル専用・Vercel不可）。

---

## 12. Extension Points（拡張ポイント）

コード自体に将来の分割を見越したコメントが残されている点は重要な手がかり:

- `registry.ts`内`TODO(phase7-split)`: 「物理リポジトリを分離する際は`buildPersonalRegistry()`と`buildCompanyRegistry()`を独立させ、各`ai-secretary/`インスタンスが自分のRegistryだけを読む」という設計意図が既にコード上にメモされている。Personal OSとCompany OSを別デプロイに分けるシナリオが既に想定済み。
- `Department.company` / `Secretary.company`フィールド（`personal | company | crestix | shared`）が、まさにこの分割のための境界線として機能している。
- `SECRETARY_MODES`（`modes.ts`）は`personal/company/finance/note`の4種のみで、実際の16秘書体制より粗い粒度。UIの「モード」概念と「秘書」概念の統合、または意図的な使い分けの整理が必要。
- Note Departmentを「Media Platform」（note/Blog/YouTube/X/Threads/Podcast）へ拡張する場合、現状`personal-note`秘書1体・API2本（generate/promote）・スコープ数ファイルという小さな面積なので、Department内にRoom（`personal-fund-room`と同じパターン）を新設し、媒体ごとにSecretaryを追加していく形が既存構造と最も整合する。
- `authority/{cfo,coo,cso}.ts`という「役員権限」を示唆するファイルが存在するが、どこからも呼ばれていない（配線待ちの未使用モジュール）。将来の意思決定権限レイヤーの布石とみられる。

---

## 13. Technical Debt（技術的負債）

優先度が高いと考えられる順に列挙。

1. **Morning Reportがローカルfs直読みで本番非対応**（10-4節）。`memory/personal/fund/positions.md`等が本番で読めず、空データのままレポート生成されている可能性が高い。記憶にある「Financeモードで実データ未反映」の実体である疑いが強い。
2. **Vaultクライアントが2実装（`vault.ts` / `github.ts`）**。認証方式・エラーハンドリング・ローカルfallbackの有無が異なり、修正漏れの温床になっている（実際に1つ目の負債はこの分裂が遠因）。
3. **プロンプト体系の二重化**。`app/lib/prompts.ts`の`SYSTEM_PROMPTS`（4モード分、コード量的にはかなり作り込まれている）が実チャットロジックから呼ばれておらず死んでいる。UIのモード選択（personal/company/finance/note）と実際の秘書ルーティング（16秘書）が別の粒度で並存し、ユーザーからは「モードを選ぶ意味は？」が分かりにくい状態。
4. **スコープ定義の二重化**。`departments.ts`の`Secretary.memoryScope`フィールドと`scopes.ts`の`MEMORY_SCOPES`が別々に存在し、実際に効いているのは後者のみと見られる。前者を更新しても反映されない罠がある。
5. **`memory/note/` vs `memory/personal/note/`、`memory/company/` vs `memory/crestix/`の重複ディレクトリ**。どちらが正なのか判別しにくく、Obsidian Vault（`vaults/`）側との対応関係も含めて棚卸しが必要。
6. **`NOTE_COMPANY_REQUIREMENTS.md`が要求する成果物の一部未作成**（`affiliates/index.md`, `kpi.md`）。プロンプトのスコープには登録済みだが実ファイルがないため、`personal-note`秘書は毎回「該当ファイルなし」の状態で動いている。
7. **`crestix-ceo`/`crestix-system`という「後方互換用」秘書がスコープ上孤立**。`memory/crestix/`を見ておらず`memory/company/`を見ているため、実質`company-ceo`と同じ内容を別IDで持っているだけ（重複の温床）。
8. **`vault/AI会社/`の用途不明フォルダ**、および3つの`vaults/*-vault/`との関係整理。
9. **`authority/{cfo,coo,cso}.ts`が未配線**。デッドコードか、実装途中で止まっているものか要確認。
10. **HD Business部門のみ`memory/company/hd-business/`配下に多数のファイル参照（targets, kpi, daily, weekly, pipeline, lead-times, bottlenecks, playbook, rules）があるが、実ファイルの存在有無は本調査では未検証**（Company OS権限のため`memory/company/hd-business/`を深く見ていない）。Phase2で在庫確認が必要。

---

## 14. Improvement Opportunities（改善機会）

Evolution（進化）方針に沿い、「壊す」のではなく「揃える・埋める・配線する」レベルの改善候補:

- **`morning.ts`を`vault.ts`経由に統一**（`fs.readFileSync`除去）。Vercel本番でのデータ欠落を解消する最優先パッチ候補。既存API・既存出力フォーマットは変更不要。
- **`vault.ts`への一本化**。`github.ts`が担っている`role.md`/`tasks.md`専用ロジックを`vault.ts`ベースに寄せれば、Vaultアクセス経路が1つになり、認証・fallback挙動が揃う。
- **`prompts.ts`の`SYSTEM_PROMPTS`の扱いを明確化**。「本当に不要なら削除」「モード選択UIをやめて秘書一覧UIに寄せる」「逆にモード概念を正式な抽象として残すなら`departments.ts`側と統合する」のいずれかを意思決定する。
- **`departments.ts`の`memoryScope`フィールドと`scopes.ts`の統合**。片方を廃止するか、`scopes.ts`を唯一のSource of Truthとして`departments.ts`側のフィールドを削除する。
- **`memory/note/`・`memory/crestix/`など孤立ディレクトリの棚卸し**。実際に参照されていないなら`memory/archive/`へ退避、参照する意図があるならスコープに正式追加。
- **NOTE_COMPANY_REQUIREMENTS.mdの未実施タスク（affiliates/index.md, kpi.md）を完了させる**。すでにスコープには登録済みなので、あとはファイルを作るだけで`personal-note`秘書の実力が上がる、コスパの良い改善。
- **Media Platform拡張の土台として、Note DepartmentにRoom構造を導入**。`personal-fund-room`と同型のパターンで`personal-note-room`を切り、媒体別（Blog/YouTube/X等）Secretaryをここに追加していけば、Department First原則を保ったまま拡張できる。
- **`authority/*.ts`の配線方針を決定**。使うなら秘書の意思決定出力（【最終決定】等）と紐付ける設計を、使わないなら削除候補として明示する。

---

*本ドキュメントはPhase1（現状分析）の成果物。実装は行っていない。Phase2（改善点整理）に進む場合は、本ドキュメントの13節・14節を出発点に優先順位付けを行う想定。*
