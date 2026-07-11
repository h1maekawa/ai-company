# 08 Personal OS Skill設計書

> `07_CC_PLUGIN_REFERENCE_MAPPING.md`を前提に、Personal OSを実用化するためのSkill設計をまとめる。
> 対象はPersonal OSのみ（Company OS / HD Businessは拡張しない）。

## 1. Personal OSの目的

前川弘行専用の個人事業運営（Note収益化・投資・日次タスク管理・思考整理）を、既存のSecretary（人格・会話）とSkill（構造化された定型処理）の分業で回せる状態にする。cc-secretaryが1人のユーザーに対して「秘書1人＋カテゴリ別フォルダ」で実現していたことを、AI Company v2では「複数のPersonal Secretary（personal-ceo/personal-morning/personal-note/personal-fund/personal-finance）＋共有Skill」という形で実現する。

## 2. cc-secretaryから取り込む思想

- **迷ったらinboxへ**: 雑多な入力はまず`personal-capture`で受け止める（分類は後回し）
- **1トピック1ファイル**: idea/research/knowledgeはトピックごとにファイルを分ける（cc-secretaryの`ideas/`, `research/`, `knowledge/`と同型）
- **テンプレート駆動**: 新規ファイルは必ず`_template.md`をベースにする
- **上書き禁止・追記のみ**: 既存の日次ファイルは追記、置き換えない（Phase3Bの保存実装で踏襲する設計原則として明記。本Phaseでは保存自体を行わないため実害はないが、次Phase設計の前提として記録する）
- **秘書ごとにテンプレ構成が違ってよい**: cc-secretaryのロール別プリセットの考え方を、v2では「秘書ごとのSkill Bindings（`skillIds`）」という形に翻訳する（動的生成ではなく静的定義）

## 3. Personal OSのMemory構造

既存（維持）:
```
memory/personal/
├── profile.md, goals.md, rules.md, content_strategy.md, interests.md
├── fund/（fund.md, rules.md, watchlist.md, portfolio.md, positions.md, themes.md, earnings.md, investment-log/）
├── finance/（budget-rules.md）
├── investment/（rules.md）
├── note/（business-strategy.md, hooks.md, themes.md, monetization.md, ideas/, drafts/, templates/）
├── tasks/（.gitkeepのみ）
├── logs/（daily/, weekly/）
├── thinking/（index.md）
└── capture/（2026/06/配下に日付ファイル）
```

新設（本Phaseで追加）:
```
memory/personal/
├── inbox/
│   └── _template.md
├── tasks/
│   └── _template.md          ← 既存ディレクトリにテンプレート追加
├── ideas/
│   └── _template.md
├── research/
│   └── _template.md
├── knowledge/
│   └── _template.md
├── reviews/
│   └── _template.md
└── note/
    ├── affiliates/
    │   └── index.md           ← 欠落補完（NOTE_COMPANY_REQUIREMENTS.md TASK-01）
    └── kpi.md                 ← 欠落補完（同TASK-02）
```

**注記**: `memory/personal/research/`（本Phaseで新設・汎用リサーチ置き場）と`memory/personal/note/research/`（既存・note記事専用リサーチ）は別物。`memory/personal/knowledge/`（本Pheseで新設）と`memory/knowledge/{8カテゴリ}/`（既存・`saveKnowledge()`が書く場所）も別物。統合の要否は次Phase以降で判断する（Phase2 Foundationの「棚卸しのみ・削除統合しない」方針を踏襲）。

## 4. Personal Secretary一覧（本Phaseでskillsを紐付ける対象）

| Secretary | 役割 | 付与するskillIds |
|---|---|---|
| `personal-ceo` | 個人事業統括 | `personal-capture`, `personal-todo-add`, `personal-today-show`, `note-draft-format` |
| `personal-morning` | 日次オペレーション | `personal-capture`, `personal-todo-add`, `personal-today-show`, `note-draft-format`, `fund-log-format`, `morning-report-compose` |
| `personal-note` | note収益化 | `note-draft-format`, `personal-idea-create`, `personal-research-create`, `personal-knowledge-save` |
| `personal-fund` | 投資判断OS | `fund-log-format` |
| `personal-finance` | 資産形成 | `fund-log-format` |
| `executive-assistant` | 全般サポート | `personal-capture`, `personal-todo-add` |

Company OS / HD Businessの秘書（`company-*`, `hd-*`）には今回`skillIds`を追加しない。

## 5. Personal Skill一覧

| Skill ID | カテゴリ | 本Phaseの状態 |
|---|---|---|
| `personal-capture` | format | **implemented** |
| `personal-todo-add` | format | **implemented** |
| `personal-today-show` | format | **implemented** |
| `note-draft-format` | format | **implemented**（既存Skillを本仕様で再定義） |
| `fund-log-format` | format | **implemented**（既存Skillを本仕様で再定義） |
| `personal-idea-create` | generation | planned |
| `personal-research-create` | research | planned |
| `personal-knowledge-save` | format | planned |
| `personal-weekly-review` | generation | planned |
| `personal-dashboard` | generation | planned |
| `personal-inbox-organize` | generation | planned |
| `morning-report-compose` | generation | planned（Phase2 Foundationから継続） |

## 6〜7. Skillごとの入力・出力

### personal-capture
- 対象Secretary: `personal-ceo`, `personal-morning`, `executive-assistant`
- 入力: `{ content: string, source?: string, tags?: string[] }`
- 出力: Inbox Capture形式のMarkdown（Date/Source/Tags＋内容）

### personal-todo-add
- 対象Secretary: `personal-ceo`, `personal-morning`, `executive-assistant`
- 入力: `{ task: string, priority?: "high"|"normal"|"low", dueDate?: string, memo?: string }`
- 出力: `- [ ] タスク`形式のMarkdownタスク行（Priority/Due/Memo付き）

### personal-today-show
- 対象Secretary: `personal-morning`, `personal-ceo`
- 入力: `{ date?: string }`（省略時は当日）
- 出力: 最優先／通常／余裕があれば／完了の4セクションを持つ「今日のタスク」Markdown枠

### note-draft-format
- 対象Secretary: `personal-note`, `personal-ceo`, `personal-morning`
- 入力: `{ title, theme, targetReader, hook, bodyMemo, cta, paidPartIdea }`
- 出力: タイトル／テーマ／想定読者／冒頭フック／本文メモ／CTA／有料パート案／次に追記することのMarkdown

### fund-log-format
- 対象Secretary: `personal-fund`, `personal-finance`, `personal-morning`
- 入力: `{ ticker, companyName, action, decisionScore, reason, risk, timeHorizon, positionSize, memo }`
- 出力: 投資判断ログMarkdown（基本情報＋判断理由＋リスク＋メモ）

その他7 Skill（`personal-idea-create`等）は本Phaseでは入出力仕様の詳細設計を行わず、Registryへの登録（`allowedSecretaries`・カテゴリ・自然言語での入出力概要）のみ実施する。

## 8. 今回実装するSkill

1. `personal-capture`
2. `personal-todo-add`
3. `personal-today-show`
4. `note-draft-format`
5. `fund-log-format`

いずれも「入力→整形されたMarkdown文字列を返すだけ」で、**Memoryへの保存は行わない**（Phase3Bで実装）。

## 9. 次Phaseで実装するSkill

`personal-idea-create`, `personal-research-create`, `personal-knowledge-save`, `personal-weekly-review`, `personal-dashboard`, `personal-inbox-organize`, `morning-report-compose`（Registry登録済み・`planned`のまま）。

これらは実処理の前に、cc-secretaryの「週次レビューは今週のdailyファイルから完了タスクを収集する」「ダッシュボードは全カテゴリをスキャンする」のように**既存Memoryの読み込みが必須**になるため、Phase3B（Memory保存機能）と合わせて設計するのが自然。

## 10. Company OSへ横展開する方針

- `personal-capture`/`personal-todo-add`/`personal-today-show`は入出力が抽象的（inboxへの記録・タスク行生成・当日枠表示）なため、Company OS展開時は`company-capture`/`company-todo-add`のように**同じ実装パターンを複製**すればよい（cc-companyの`secretary/inbox`・`secretary/todos`と同型）。
- `note-draft-format`/`fund-log-format`のようなドメイン固有Skillは複製ではなく、Company OS固有のSkill（例: 営業提案書フォーマット、経費整形など）として別途設計する。cc-companyの部署別テンプレート（PM/リサーチ/マーケティング/開発/経理/営業/クリエイティブ/人事）が具体案の参考になる（`07`5節参照）。
- Company OS展開はPersonal OSでの実運用（Phase3B保存・Phase3C UI化）を経てパターンが固まってから着手する（Evolution over Revolution）。

---

*本ドキュメントは設計のみ。実装は本Phase後半で`app/lib/skills/`配下に反映する。*
