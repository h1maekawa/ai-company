# 07 cc-secretary / cc-company 参考マッピング

> 参照元: `cc-secretary-master (1).zip`／`cc-company-master (1).zip`（ユーザーアップロード、2026-07-09）
> 読了ファイル: `cc-secretary-master/plugins/secretary/skills/secretary/SKILL.md`, 同`references/templates.md`, 同`references/claude-md-template.md`,
> `cc-company-master/plugins/company/skills/company/SKILL.md`, 同`references/departments.md`（見出し構造を確認）, 同`references/claude-md-template.md`, 両README.md
> 方針: **どちらもClaude Code Plugin形式（`.claude-plugin/`, `trigger: /secretary`等）はそのまま持ち込まない。「思想・テンプレート構造」だけをAI Company v2（Next.js＋Vault）の型に翻訳する。**

---

## 1. cc-secretaryの構成

「パーソナル秘書」プラグイン。`/secretary`実行時、`.secretary/`が無ければ対話的オンボーディング（役割・日常ルーティン・管理したいカテゴリ・言語・保存場所をヒアリング）でフォルダ構成を自動生成し、あれば「管理モード」に入る。

- **カテゴリ**: inbox・reviewsは常設、それ以外（todos/ideas/research/knowledge/meetings/clients/content-plan/reading-list/journal/debugging/projects/finances）はロール別プリセット＋ユーザー選択で決まる
- **操作コマンド**: 「タスク追加」「今日のタスク」「メモ」「アイデア」「調査」「週次レビュー」「ダッシュボード」「受信箱整理」「カテゴリ追加」の自然文パターンマッチ
- **テンプレート**: カテゴリごとに`_template.md`（frontmatter＋見出し構造）、`.secretary/CLAUDE.md`（ユーザープロフィール・ファイル命名規則・TODO形式・レビューサイクル・クイックコマンド一覧）
- **設計思想の核**: 「まずinboxへ」「テンプレートを使う」「上書き禁止・追記のみ」「1トピック1ファイル」「常に`.secretary/CLAUDE.md`を先に読む」

## 2. cc-companyの構成

「秘書から始める仮想組織」プラグイン。`/company`実行時、3問（事業・活動／目標・困りごと／ダッシュボード希望）の最小オンボーディングで`secretary/`（窓口）だけを作り、部署は最初は作らない。

- **核心思想**: 「秘書が常にエントリーポイント。ユーザーは部署を意識しなくていい」「同じ領域のタスクを2回以上処理したら部署新設を提案」
- **秘書室が直接処理するもの**: TODO、壁打ち・相談（`secretary/notes/`）、メモ（`secretary/inbox/`）、「今日やること」、ダッシュボード
- **部署（必要になったら追加）**: PM／リサーチ／マーケティング／開発／経理／営業／クリエイティブ／人事の8種類。各部署に`_template.md`群と`CLAUDE.md`（役割・ルール・フォルダ構成）
- **運用ルール**: 意思決定・学び・アイデアは自動記録、同日1ファイル追記、日付チェック必須
- **周辺機能**: React製ダッシュボード（`npx cc-company-dashboard`、別npmパッケージ）、MCP連携の提案（Notion/Google Calendar/GitHub/Slack）

---

## 3. Personal OSに取り込む要素

| 要素 | 取り込み方 |
|---|---|
| カテゴリ構造（inbox/todos/ideas/research/knowledge/reviews） | `memory/personal/`配下に同名ディレクトリとして新設（本Phaseで実施） |
| `_template.md`のfrontmatter＋見出し構造 | ほぼそのまま`memory/personal/{category}/_template.md`として移植（保存先パスのみ`.secretary/`→`memory/personal/`に読み替え） |
| 「タスク追加」「メモ」「今日のタスク」の自然文コマンド思想 | `personal-capture`・`personal-todo-add`・`personal-today-show` Skillとして実装（自然文パターンマッチではなく、Skill Registryを介した構造化呼び出しに置き換え） |
| 「アイデア」「調査」「週次レビュー」「ダッシュボード」「受信箱整理」 | Skill Registryに登録（`personal-idea-create`等）。本Phaseでは`planned`のまま、次Phase以降で実処理化 |
| 「上書き禁止・追記のみ」「同日1ファイル」「1トピック1ファイル」の運用ルール | 将来Skill実処理／Memory保存Phase（roadmap Phase3B相当）で踏襲する設計原則としてメモ化 |
| 「まず迷ったらinboxへ」の思想 | `personal-capture` Skillの位置付け（Executive/CEO/朝会秘書が雑多な入力を受けたときの標準的な逃し先）として採用 |

## 4. Company OSへ後から取り込む要素（今回は実装しない）

| 要素 | 将来の取り込み方針 |
|---|---|
| 「秘書が窓口、部署をユーザーに意識させない」思想 | `01`/`02`で確認済みの`router/executive.ts`（Executive Router）が既に近い役割を持つ。Company OS/HD Business展開時、この思想をルーティング設計の指針として明文化する |
| 「部署を必要に応じて自然に増やす」（2回パターン検出で提案） | `02_AI_COMPANY_V2_ARCHITECTURE.md`のDepartment拡張方針（Evolution over Revolution・Room単位追加）と同じ方向性。将来、秘書側から「部署化しませんか」と提案する機能の参考にする |
| 部署テンプレート8種（PM／リサーチ／マーケティング／開発／経理／営業／クリエイティブ／人事） | AI Company v2の`company`/`hd-business`と重複するもの（開発≒`company-system`、営業≒`hd-business`）を除き、**経理・クリエイティブ・人事・PM**はv2にまだ存在しない部門として記録。Company OS展開時の新設候補 |
| `secretary/todos`・`secretary/inbox`・`secretary/notes` | Personal OSで先行実装する`memory/personal/{tasks,inbox}/`と同型。`secretary/notes`（壁打ち・意思決定ログ）に相当する置き場がv2にはまだ薄い（`memory/personal/thinking/`はあるが単一ファイル）ため、Company OS展開時に`memory/company/notes/`のような形で検討 |
| department routing（キーワード表） | `router/executive.ts`の既存ルーティングルール（`hd-*`等）と同じ設計パターン。新部署を追加する際のキーワード表フォーマットの参考にする |
| ダッシュボード（`npx cc-company-dashboard`のReact SPA） | roadmap `05`のPhase3C「Personal Dashboard」着手時の実装参考（スキャン→パース→表示のアーキテクチャ）として参照する。コードの移植はしない |
| MCP連携の提案（Notion/Calendar/GitHub/Slack） | Phase7以降の外部連携検討時の参考。今回もPhase3Aでも実装しない |

## 5. そのまま取り込まない要素

| 要素 | 理由 |
|---|---|
| `.claude-plugin/`・`plugin.json`・`marketplace.json`・`trigger: /secretary`等のPlugin形式一式 | AI Company v2はNext.js Webアプリであり、Claude Code Pluginとして配布する構成を取っていない（ユーザー指示により今回も明示的に対象外） |
| オンボーディング対話フロー（Step2a〜2e、`AskUserQuestion`でのヒアリング） | v2は既に前川さん専用にDepartment/Secretary/Memory構造が確定済みで、汎用ユーザー向けの初期セットアップ対話は不要 |
| ロール別プリセット（ソフトウェア開発者／コンテンツクリエイター／学生等） | v2は既に16秘書体制で個人特化済み。汎用プリセットの出番がない |
| v1→v2マイグレーションロジック（`.company/ceo/`検出等） | AI Company v2に該当する旧バージョンが存在しないため無関係 |
| 「カテゴリ追加」による動的フォルダ生成 | v2のMemory構造・Secretaryスコープ（`scopes.ts`）はコードで明示管理する方針（Charter「Memory First」）のため、対話的に勝手にフォルダを生やす仕組みは採用しない |
| 自然文コマンドパターンマッチそのもの（"タスク追加 [内容]"等の文字列解析） | v2は`router/executive.ts`のLLMルーティング＋Skill Registryの構造化呼び出しという既存の型があるため、cc-secretary固有の正規表現的パターンマッチは踏襲しない |

## 6. AI Company v2側での置き換え先

| cc-secretary/cc-company要素 | AI Company v2での対応 |
|---|---|
| `.secretary/inbox/` | `memory/personal/inbox/`（新設） |
| `.secretary/todos/` | `memory/personal/tasks/`（既存、テンプレート追加） |
| `.secretary/ideas/` | `memory/personal/ideas/`（新設） |
| `.secretary/research/` | `memory/personal/research/`（新設。既存の`memory/personal/note/research/`とは別物＝note専用ではなく汎用リサーチ置き場） |
| `.secretary/knowledge/` | `memory/personal/knowledge/`（新設。既存の`memory/knowledge/{8カテゴリ}/`＝`saveKnowledge()`が書く場所とは別の入れ物。将来的な統合要否は次Phaseで検討） |
| `.secretary/reviews/` | `memory/personal/reviews/`（新設） |
| "メモ [内容]" / capture | `personal-capture` Skill |
| "タスク追加 [内容]" | `personal-todo-add` Skill |
| "今日のタスク" | `personal-today-show` Skill |
| "アイデア [タイトル]" | `personal-idea-create` Skill（Registry登録のみ、`planned`） |
| "調査 [タイトル]" | `personal-research-create` Skill（Registry登録のみ、`planned`） |
| ナレッジ記録 | `personal-knowledge-save` Skill（Registry登録のみ、`planned`） |
| "週次レビュー" | `personal-weekly-review` Skill（Registry登録のみ、`planned`） |
| "ダッシュボード" | `personal-dashboard` Skill（Registry登録のみ、`planned`。実UIはroadmap Phase3C） |
| "受信箱整理" | `personal-inbox-organize` Skill（Registry登録のみ、`planned`） |
| `.secretary/CLAUDE.md`（秘書の振る舞い定義） | 既存の`departments.ts`の`Secretary.prompt`（`personal-ceo`/`personal-morning`等）が同じ役割を既に担っているため新規作成不要 |
| cc-companyの「秘書が窓口」思想 | 既存の`router/executive.ts`（Executive Router）＋`executive-assistant`秘書が既に同じ役割を担っている |
| cc-companyの部署8テンプレート | Company OS展開時の新設候補メモとして`docs/07`（本ファイル）に記録、今回は未実装 |

---

*本ドキュメントは参考マッピングのみを目的とし、実装方針の根拠として`08_PERSONAL_OS_SKILL_DESIGN.md`で具体化する。*
