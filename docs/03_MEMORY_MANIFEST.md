# 03 Memory Manifest — Secretary別 Memory参照台帳

> Phase2 Foundation の成果物。正とする参照元は `ai-secretary/app/lib/config/scopes.ts` の `MEMORY_SCOPES`
> （`departments.ts` 側の `Secretary.memoryScope` フィールドは実際の読み込みには使われていないため、本ドキュメントでは参照しない）。
> 調査時点: 2026-07-09 時点のファイル実在確認込み。**削除・統合は行っていない（棚卸しのみ）。**

## 読み方の前提（scopes.ts の挙動）

- `MEMORY_SCOPES[secretaryId]` は `local` / `shared` / `global` の3グループ。`loadScopedMemory()` が `global → shared → local` の順に処理し、パスの重複はスキップする。
- パスが `/` で終わる場合は**ディレクトリ指定**で、`listVaultEntries()`が再帰的にそのディレクトリ配下の`.md`ファイルを**すべて**読み込む（サブディレクトリ含む）。単一ファイル指定（`.md`で終わる）はそのファイルのみ。
- ディレクトリ指定と、その配下の個別ファイル指定が両方scopeにある場合、両方loadされる（重複読み込みが起きるが実害はない＝同一内容が2回連結されるだけ）。
- スコープに書かれているファイルが実在しない場合は、`getVaultFile()`が空コンテンツを返し、`loadedFiles`には追加されない（エラーにはならず単に無視される）。
- 「書き込むMemory」は`scopes.ts`には現れない。実装（各APIのルートハンドラ）を個別に確認して特定した。**全Secretary共通で、チャット1往復ごとに`memory/chat-log/{secretaryId}/{YYYY-MM-DD}-summary.md`へ要約が追記される**（`saveChatLog()`、`/api/chat`内で自動実行）。これは以下の個別表では省略し、共通事項としてここに明記する。

---

## Part A. 指定9 Secretaryの詳細

### `personal-note`
- **所属Department**: personal（Note Department相当、Room化はされていない）
- **役割**: note記事の企画・構成・下書き・投稿計画・KPI管理・アフィリ選定
- **実際に読むMemory**（`scopes.ts`より）:
  - global: `memory/personal/profile.md`
  - shared: `memory/personal/goals.md`, `memory/shared/ai-development-rules.md`
  - local: `memory/personal/rules.md`
  - local（ディレクトリ指定・再帰）: `memory/personal/note/` 配下の全`.md` → 実在するのは`business-strategy.md`, `hooks.md`, `themes.md`, `monetization.md`, `ideas/index.md`, `drafts/README.md`, `templates/{sales,career,finance,great-person}-template.md`
  - local（個別指定・上と重複読み込み）: `memory/personal/note/ideas/index.md`, `memory/personal/note/business-strategy.md`
  - local（個別指定・**現状ファイルなし**）: `memory/personal/note/affiliates/index.md`, `memory/personal/note/kpi.md`
- **書き込むMemory**:
  - `memory/personal/note/drafts/{date}-{slug}.md`（`/api/note/generate`経由）
  - `memory/personal/note/research/{date}-{slug}.md` と `memory/personal/note/drafts/{date}-{slug}.md`（`/api/note/promote`経由）
  - `memory/knowledge/{category}/*.md`のステータス更新（`/api/note/promote`が`saveKnowledge()`経由で`status: promoted`に更新）
- **現在参照されていないが関連しそうなMemory**: `memory/note/`（トップレベル、templates 4種のみ実在・personal/note/内と内容重複）、`memory/personal/content_strategy.md`、`memory/personal/interests.md`
- **注意点**: `affiliates/index.md`・`kpi.md`はスコープに登録済みだが実ファイルが存在しないため、秘書は毎回「該当データなし」の状態で応答している。NOTE_COMPANY_REQUIREMENTS.mdのTASK-01/02が未完了のまま。

### `personal-fund`
- **所属Department**: personal › Room「personal-fund-room」（Fund Department）
- **役割**: 投資判断OS（売買シグナル・リスク管理・ポートフォリオ評価）
- **実際に読むMemory**:
  - global: `memory/personal/profile.md`
  - shared: `memory/personal/goals.md`, `memory/shared/ai-development-rules.md`
  - local: `memory/personal/rules.md`, `memory/personal/investment/rules.md`, `memory/personal/fund/fund.md`, `fund/rules.md`, `fund/watchlist.md`, `fund/portfolio.md`, `fund/positions.md`, `fund/themes.md`, `fund/earnings.md`（すべて実在確認済み）
  - local（ディレクトリ指定・再帰）: `memory/personal/fund/investment-log/` → `_template.md`, `2026-06-18-MU.md`, `2026-06-18-NVDA.md`
- **書き込むMemory**: `memory/personal/fund/investment-log/{date}-{TICKER}.md`（`/api/fund/log`、新規作成 or 追記モード）
- **現在参照されていないが関連しそうなMemory**: `memory/personal/finance/budget-rules.md`（`personal-finance`秘書側のスコープにはあるが`personal-fund`側にはない）
- **注意点**: 特になし。9秘書中もっともスコープとファイル実在が一致しており健全。`/api/fund/report`（レポート画面用）も同じ`vault.ts`経由で`positions.md`/`portfolio.md`を読んでおり経路が一貫している。

### `personal-morning`
- **所属Department**: personal（Morning Secretary）
- **役割**: 日次オペレーション統括・朝会レポート
- **実際に読むMemory（チャット直接対話時、`scopes.ts`経由）**:
  - global: `memory/personal/profile.md`
  - shared: `memory/shared/ai-development-rules.md`
  - local: `memory/personal/rules.md`, `memory/personal/goals.md`, `memory/personal/fund/positions.md`
  - local（ディレクトリ指定・再帰）: `memory/personal/tasks/`（**中身は`.gitkeep`のみ、実質空**）, `memory/personal/logs/`（`daily/2026-06-29.md`, `daily/template.md`）, `memory/personal/finance/`（`budget-rules.md`）, `memory/personal/investment/`（`investment/rules.md`）, `memory/personal/note/`（personal-noteと同じ内容）
- **実際に読むMemory（`/api/report/morning`経由・別経路！）**: `scopes.ts`を一切使わず、`report/morning.ts`内で個別に読む。対象は`fund/positions.md`, `note/drafts/`ディレクトリのファイル名一覧, `note/kpi.md`（**存在しない**）, `company/hd-business/kpi.md`, `company/hd-business/pipeline.md`, `personal/goals.md`（無ければ`memory/goals.md`にフォールバック）。**この経路は現状ローカルfs直読みで、本番Vercelでは機能していない可能性が高い（5節・Phase1 Appendixで指摘済み、今回Phase2で修正対象）。**
- **書き込むMemory**: チャット経由の要約のみ（`/api/report/morning`はGET専用・書き込みなし）
- **注意点**: **同じ秘書なのに「チャットで話しかけたとき」と「朝会レポートAPIを呼んだとき」でMemory取得経路が完全に別（前者はscopes.ts+vault.ts、後者はreport/morning.ts独自実装）**。これが本Phase2で最も優先度の高い修正対象。

### `hd-kpi-manager`
- **所属Department**: hd-business › Room「hd-business-room」
- **役割**: KPI逆算（架電数まで）・実績追跡
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/hd-business/targets.md`, `kpi.md`, `daily.md`, `weekly.md`（すべて実在確認済み）
- **書き込むMemory**: なし（チャット要約のみ）。`/hd-report`・`/hd-sim`コマンドは現状LLMのprompt内計算のみで、構造化データを書き戻すAPIは存在しない。
- **現在参照されていないが関連しそうなMemory**: `memory/company/hd-business/README.md`（10ファイル中唯一どの秘書スコープにも入っていない）
- **注意点**: 特になし。ファイル実在とスコープの整合性は良好。

### `hd-pipeline-manager`
- **所属Department**: hd-business › Room「hd-business-room」
- **役割**: 案件進捗・確度管理・着地予測
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/hd-business/pipeline.md`, `lead-times.md`, `targets.md`（すべて実在確認済み）
- **書き込むMemory**: なし（チャット要約のみ）
- **注意点**: `kpi.md`は見ていない（`hd-kpi-manager`・`hd-closing-manager`・`hd-improvement-manager`は見ている）。案件進捗系秘書がKPI数値を直接見ずに判断している点は意図的な役割分担だが、`hd-report`との整合を取る場合は要確認。

### `hd-closing-manager`
- **所属Department**: hd-business › Room「hd-business-room」
- **役割**: 高確度案件のクロージング支援
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/hd-business/pipeline.md`, `targets.md`, `kpi.md`, `lead-times.md`（すべて実在確認済み）
- **書き込むMemory**: なし（チャット要約のみ）
- **注意点**: 特になし。

### `hd-improvement-manager`
- **所属Department**: hd-business › Room「hd-business-room」
- **役割**: ボトルネック特定・改善策立案
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/hd-business/bottlenecks.md`, `kpi.md`, `weekly.md`, `playbook.md`, `rules.md`（すべて実在確認済み）
- **書き込むMemory**: なし（チャット要約のみ）
- **注意点**: 特になし。HD Business内5秘書は他部門と比べてスコープとファイル実在の整合性が最も高い。

### `company-ceo`
- **所属Department**: company（Company OS）
- **役割**: Crestix中長期戦略・経営意思決定
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/strategy/index.md`（**`strategy.md`は見ていない**）
- **書き込むMemory**: チャット要約に加え、`activeCompany === "company"`時のみ、応答に含まれる`[TASKS_UPDATE]`ブロックをUI側（`page.tsx`）が抽出し、ユーザー承認を経て`PUT /api/memory/tasks.md`（`github.ts`経由）で**リポジトリルート直下の`memory/tasks.md`**（`memory/company/tasks.md`ではない）に保存される。同時に`memory/role.md`も読み取り専用でprompt注入される。
- **現在参照されていないが関連しそうなMemory**: `memory/company/strategy.md`（`company-system`側は見ているがこちらは見ていない）
- **注意点**: 「読む場所」（`memory/company/*`）と「書く場所」（`memory/role.md`, `memory/tasks.md`＝ルート直下）が非対称。これは`company`モード全体（company-ceo/company-system/crestix-ceo/crestix-system共通）の挙動で、`chat/route.ts`の`activeCompany`分岐によるもの。

### `company-system`
- **所属Department**: company（Company OS）
- **役割**: AI Company OS自体の開発サポート
- **実際に読むMemory**: global: `memory/company/profile.md` / local: `memory/company/strategy.md`（**`strategy/index.md`は見ていない**）
- **書き込むMemory**: `company-ceo`と同様（`activeCompany==="company"`共通ロジック、`memory/role.md`読取／`memory/tasks.md`書込）
- **注意点**: `company-ceo`とは逆に`strategy.md`のみを見て`strategy/index.md`は見ない。2つの「戦略ファイル」を2秘書で分けて参照している状態で、意図的な設計か歴史的経緯かは要確認。

---

## Part A補足. その他Secretaryの概要（簡易版）

| Secretary | 実際に読むMemory（要約） | 書き込むMemory | 注意点 |
|---|---|---|---|
| `executive-assistant` | global/shared: `personal/profile.md`, `company/profile.md` / shared扱い: `personal/goals.md` | チャット要約のみ | シンプルな橋渡し役、スコープも最小限 |
| `executive-inbox` | shared: `personal/profile.md`, `company/profile.md` | チャット要約のみ（InboxはContextBus/Redis側に保存、Memoryファイルへは書かない） | Inbox本体はMemoryではなくContextBus（Redis+file）が担当 |
| `personal-ceo` | global: `profile.md` / shared: `ai-development-rules.md` / local: `rules.md`, `thinking/index.md`, `goals.md`, `investment/`(rules.md), `finance/`(budget-rules.md), `fund/`(**単一ファイル指定なし＝ディレクトリ指定なので全9ファイル再帰読込**), `note/`(全ファイル再帰読込) | チャット要約のみ | `personal-fund`・`personal-note`とほぼ同じ範囲を横断的に読む「統括」役として設計されている |
| `personal-finance` | global: `profile.md` / shared: `goals.md`, `ai-development-rules.md` / local: `rules.md`, `finance/`(budget-rules.md), `investment/`(rules.md), `fund/`(全ファイル再帰) | チャット要約のみ | `personal-fund`とスコープが大きく重複（`fund/`を両方が全読み） |
| `hd-ceo` | global: `company/profile.md` / local: `hd-business/`（全10ファイル再帰）, `strategy/index.md` | チャット要約のみ | HD Business内で唯一`strategy/index.md`（Company全体戦略）も見る |
| `crestix-ceo`（互換） | `company-ceo`と完全同一スコープ | `company-ceo`と同一の書込ロジック | `memory/crestix/`は一切参照しない（8節「棚卸し」参照） |
| `crestix-system`（互換） | `company-system`と完全同一スコープ | `company-system`と同一の書込ロジック | 同上 |

---

## Part B. Memoryの不整合棚卸し

**今回は削除・統合はしていません。実在確認と参照状況の整理のみです。**

### B-1. `memory/note/` vs `memory/personal/note/`

| ファイル | `memory/note/` | `memory/personal/note/` | scopes.tsから参照 |
|---|---|---|---|
| `templates/career-template.md` | 実在（内容は`personal/note/`版と同一、diff差分なし） | 実在 | `memory/personal/note/`側のみ（ディレクトリ再帰） |
| `templates/finance-template.md` | 実在（同一内容） | 実在 | 同上 |
| `templates/sales-template.md` | 実在（同一内容） | 実在 | 同上 |
| `templates/great-person-template.md` | 実在（同一内容） | 実在 | 同上 |
| `drafts/.gitkeep`, `ideas/.gitkeep`, `research/.gitkeep`, `published/.gitkeep` | 実在（空プレースホルダのみ） | `drafts/README.md`は実在、他は該当なし | 参照されているのは`personal/note/`側のみ |

→ **`memory/note/`はどのSecretaryスコープからも参照されていない孤立ディレクトリ**。中身はtemplates 4種の重複コピー（内容は同一）と空のプレースホルダのみ。実データ（hooks.md, themes.md, monetization.md, business-strategy.md等）は一切なく、実質`memory/personal/note/`の劣化コピー。

### B-2. `memory/company/` vs `memory/crestix/`

| ファイル | 実在 | scopes.tsから参照 |
|---|---|---|
| `memory/company/profile.md` | ○ | ○（`company-ceo`, `company-system`, `crestix-ceo`, `crestix-system`, hd-*全員のglobal） |
| `memory/company/strategy.md` | ○ | ○（`company-system`, `crestix-system`のみ） |
| `memory/company/strategy/index.md` | ○ | ○（`company-ceo`, `crestix-ceo`, `hd-ceo`のみ） |
| `memory/company/hd-business/*`（10ファイル） | ○（全10） | ○（hd-*5秘書で分担参照、`README.md`のみ未参照） |
| `memory/crestix/profile.md` | ○ | **×（どの秘書からも参照されていない）** |
| `memory/crestix/strategy.md` | ○ | **×（どの秘書からも参照されていない）** |

→ **`memory/crestix/`は完全に孤立**。`crestix-ceo`/`crestix-system`という名前の秘書が存在するため「これらが読んでいるはず」と誤解しやすいが、実際は`memory/company/*`を読んでいる（`scopes.ts`定義より）。

### B-3. 個別指定ファイルの実在確認

| ファイル | 実在 | scopes.tsから参照 | 備考 |
|---|---|---|---|
| `memory/personal/note/affiliates/index.md` | **×存在しない** | ○（`personal-note`のlocalに列挙） | ディレクトリ自体も未作成。NOTE_COMPANY_REQUIREMENTS.md TASK-01が未完了 |
| `memory/personal/note/kpi.md` | **×存在しない** | ○（`personal-note`のlocalに列挙、かつ`report/morning.ts`も参照） | 同TASK-02が未完了。Morning Reportにも影響 |
| `memory/personal/note/business-strategy.md` | ○存在する | ○（個別指定・ただしディレクトリ再帰でも既にカバー済みで実質重複指定） | 実データとして機能している |

### B-4. 棚卸しサマリー

- **削除せずに残すべきファイル**: `memory/note/`配下のtemplates 4種（`personal/note/templates/`と内容が同一のため実害はないが、削除は本Phaseの対象外につき現状維持）、`memory/crestix/profile.md`・`strategy.md`（孤立しているが将来的な用途が不明なため保持）。
- **今後正として扱うべきファイル**: note系は`memory/personal/note/`配下（scopes.tsが唯一参照している側）、company系は`memory/company/`配下（`crestix-*`互換秘書も含め全員がこちらを参照）。`memory/note/`・`memory/crestix/`は「参照されていない」という事実のみ記録し、統合や削除の判断はPhase2の対象外とする。
- **未作成のまま残っている参照**: `memory/personal/note/affiliates/index.md`, `memory/personal/note/kpi.md`。ファイル作成自体は本Phaseのスコープ外（Skills実装やPrompt改善のタイミングで着手する方が影響範囲を閉じられる）。

---

*本ドキュメントはPhase2 Foundationの一部。Memory自体の変更・削除・統合は行っていない。*
