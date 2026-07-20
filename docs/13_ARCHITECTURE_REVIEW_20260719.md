# 12. AI会社 アーキテクチャ解析＆レビュー

作成日: 2026-07-19
対象: `ai-company` リポジトリ全体（コード実体は `ai-secretary/`、Next.js 14 App Router）

---

## 1. 全体像

```text
┌─ ai-company（コードリポジトリ / Vercelデプロイ）
│   └─ ai-secretary/  Next.js 14 アプリ本体
│
└─ ai-company-vault（データリポジトリ = Obsidian Vault）
    ├─ ローカル実体: Dropbox「個人用/AI会社」（Obsidian Git同期）
    └─ 本番アクセス: GitHub Contents API（GITHUB_TOKEN, fine-grained PAT）
```

- **DBを持たない設計**。全データはMarkdown（Vault）＋Upstash Redis（Context Busキュー）＋/tmpミラー
- LLMは `callAI()` で抽象化：Gemini（デフォルト）/ Groq / Ollama（ローカル限定）
- 認証はセッションCookie（`SESSION_SECRET`）をmiddlewareで全ルート検証

### レイヤー構成（docs/02の設計にほぼ忠実）

| 層 | 実装 |
|---|---|
| Presentation | `/`（マインドマップハブ）、`/chat`、`/report`、`/fund`、`/login` |
| Application | `/api/chat`（中核）、Executive Router、Context Bus、`/api/fund/*`、`/api/note/*` 等 |
| Skills | `skills/registry.ts`（14定義・5実装）＋ `executor.ts`（権限チェック付き） |
| Memory | `loader.ts`（スコープドロード）、`logs.ts`（会話ログ）、`kaizen.ts`（改善提案蓄積） |
| Vault | `vault.ts`（本番GitHub API / 開発ローカルFSの自動切替） |

### 組織モデル（設定駆動）

`departments.ts` に5部門・約20秘書を宣言的に定義：
**executive**（assistant/inbox/kaizen）→ **personal**（ceo/morning/note/finance ＋ Fund Room: personal-fund）→ **company/crestix**（ceo/system ×2系統）→ **hd-business**（ceo/kpi/pipeline/closing/improvement の5役）。
`registry.ts` が起動時にフラットなレジストリを構築し、`hub.ts` がホーム画面のノード定義を持つ。**秘書の追加はほぼデータ追加だけで済む**のが最大の美点。

### 1リクエストの流れ（/api/chat）

1. middleware認証 → mode から activeCompany（personal/company）決定
2. secretaryId指定（ハブから）ならピン留め、なければ **2段ルーティング**：キーワード即決（confidence 0.95）→ LLMルーター（レジストリ＋16ルールをプロンプト注入、JSON返答）→ 失敗時 executive-assistant にフォールバック
3. `loadScopedMemory()`: `scopes.ts` の local > shared > global 順、ディレクトリは再帰スキャン、activeCompanyでフィルタ
4. システムプロンプト組立：秘書プロンプト＋メモリ全文＋当日会話ログ要約＋（company時 role.md/tasks.md＋TASKS_UPDATE指示）＋KAIZEN指示
5. LLM呼出 → `[KAIZEN]`ブロック抽出→`memory/kaizen/`へ蓄積 → Context Bus更新 → 会話ログ追記（すべて fail-open：失敗しても応答は返す）

---

## 2. レビュー：良い点

1. **設定駆動の組織モデル** — 部門・秘書・ルーム・スキル許可が全て宣言的。5年運用を見据えた「型」がある。docs/00〜11のドキュメント規律も高く、コードとdocsの乖離が小さい
2. **Vault抽象の徹底** — 2026-07-03の修正（loader.ts）と Phase2 の修正（morning.ts）以降、「本番=GitHub / 開発=ローカルFS」の切替が一貫。Obsidianを人間側の編集入口にする発想は個人AI OSとして合理的
3. **fail-open設計** — kaizen保存・Bus更新・ログ保存が失敗しても本体応答を殺さない。Redisも fail-open
4. **2段ルーティング** — 頻出パターンはキーワードで即決しLLMコストを回避、曖昧時のみLLM判定＋confidence。フォールバック先も明確
5. **Skills層の権限設計** — `allowedSecretaries` による利用制限、未実装は明示的に "not implemented"。例外でAPIを落とさない契約が明文化されている
6. **KAIZENループ** — 全秘書が会話中にシステム自体の改善提案を出し、専任秘書（executive-kaizen）が集約する自己改善機構。独創的で運用コストも低い

---

## 3. レビュー：問題点（重要度順）

### P1: メモリスコープの定義が二重化し、片方は死んでいる

`departments.ts` の各秘書にある `memoryScope` フィールドは**どのコードからも参照されていない**。実際のロードは `scopes.ts` の `MEMORY_SCOPES` のみ。見た目上「この秘書はこのファイルを読む」と書いてあるのに実態と乖離するため、**編集事故が構造的に起きる**（実際、07-19の投資部門Phase 1作業でもdepartments.ts側だけ更新する事故が起き、本レビューでscopes.ts側を修正済み）。
**推奨**: `memoryScope` フィールドを削除するか、`MEMORY_SCOPES` を廃止して departments.ts に一本化（一本化推奨。registry構築時にスコープも展開すれば済む）。

### P1: コンテキストサイズが無制限

`loadScopedMemory` はディレクトリ指定を再帰スキャンし**全ファイル全文**をプロンプトに詰める。personal-fund は `investment-log/`（日次で無限に増える）、personal-ceo は `fund/`＋`note/`＋`finance/`＋`investment/` の全ツリーを読む。会話ログも日次ファイルに追記され続け全文注入。**Vaultが育つほどコスト・レイテンシ・コンテキスト溢れが進行する時限爆弾**。
**推奨**: ①ファイル数/文字数バジェット（例: 秘書あたり計3万字、超過分は新しい順）②investment-log はディレクトリスコープから外し直近N件のみ ③日次ログは追記でなくローリング要約に。

### P2: GitHubアクセス層が二重実装

`vault.ts`（fetch直叩き）と `github.ts`（Octokit）が併存し、chat routeのcompany分岐だけ `github.ts` で `memory/role.md`/`memory/tasks.md` を読む。過去の「パスprefix間違いで404」バグ（2026-07-03修正）はこの二重化が温床。
**推奨**: `github.ts` を廃止し `vault.ts` に統一。

### P2: Executive Routerの保守性

LLMルーターのプロンプトに16個のルーティングルールが手書きされ、departments.ts の情報（コマンド一覧・銘柄名まで）を重複記述。秘書を増やすたびに2箇所更新が必要。さらにキーワード即決に `normalized.includes("mu")` があり、**"mu"を含む任意の英単語（music, community等）で投資部門へ誤ルーティングする**。「買い」「売り」も日常語と衝突する。
**推奨**: ①ルールをdepartments.tsの各秘書定義（keywords/commandsフィールド新設）から自動生成 ②ティッカーは単語境界マッチ（`/\bmu\b/`）に。

### P2: 配線されていないデッドコードが1/4程度ある

`authority/{cso,cfo,coo}.ts`、`pipeline/{inboxPipeline,inboxQueue}.ts`、`router/inbox.ts`、`memory/{saver,capture,notes※}.ts` は**どこからもimportされていない**（※notes.tsはnote APIのみ使用）。C層経営陣・Inboxパイプラインは構想段階の残骸で、読む人に「動いている」と誤解させる。
**推奨**: 削除するか `_experimental/` に隔離し、docsに「未配線」と明記。

### P2: 2リポジトリ運用のデータ事故が再発性

「コードリポジトリ内の `memory/` は過去のコピーで、本番実体は ai-company-vault」という構造は、過去に2回本番障害を起こした（personal未コミット事件、company未push——**memory/company/ は今もpush待ち**）。今回の capacity.md も同じ罠に該当。
**推奨**: コードリポジトリから `memory/` を撤去（Cowork制約で手動削除が必要）、READMEに「データはVaultのみ」と明記。

### P3: Markdownの正規表現パースが脆い

`/api/fund/report` は positions.md の見出し文言（「保有株ポジション」等）や「現在の実際の配分：コア約X%」という文面に正規表現で依存。Obsidian側で人間が見出しを変えると静かに欠落する。holdings.md で導入した「人間可読MD＋末尾jsonブロック」方式が正解なので、他ファイルにも展開を推奨。

### P3: テストが1本もない

CSVパーサ・ルーター・MDパーサはいずれも回帰しやすいのにテスト0、CI無し。`npx tsc --noEmit` すら手動。
**推奨**: vitest導入、最低限 rakutenCsv / executive router keyword部 / report parser の3点。GitHub ActionsでtscとBuildを回す。

### P3: その他

- Context Busのファイルミラーは Vercel では `/tmp`（コールドスタートで消える）。Redisにあるのはキューのみで、meta等はエフェメラル。現状実害は小さいが認識は必要
- `SecretaryMode`（personal/company/finance/note）と activeCompany と HubGroup の3つの「モード概念」が併存し、`mode ?? "note"` のようなデフォルトも不自然。将来の混乱源
- レートリミット無し（個人用なので優先度低）

---

## 4. 総評

**「個人向けマルチエージェントOS」としての骨格は良く出来ている。** 設定駆動の組織モデル、Vault抽象、fail-open、自己改善ループは5年運用の土台に足る。一方で、**同じ情報の二重定義**（memoryScope×2、GitHubクライアント×2、ルーティングルール×2、memory/×2リポジトリ）が今のシステム最大の病理で、過去の本番障害も今回のヒヤリも全てこのパターンから出ている。次の一手は機能追加ではなく「**一物一所**」への整理（P1×2＋P2の統一系）を推奨する。

## 5. 推奨アクション一覧

| 優先 | アクション | 規模 |
|---|---|---|
| P1 | メモリスコープを departments.ts へ一本化（scopes.ts廃止） | 中 |
| P1 | コンテキストバジェット導入＋investment-logの直近N件化 | 中 |
| P2 | github.ts を vault.ts へ統合 | 小 |
| P2 | ルーティングルールを秘書定義から自動生成、ティッカー誤マッチ修正 | 中 |
| P2 | デッドコード削除（authority/ pipeline/ inbox router/ saver/ capture） | 小 |
| P2 | コードリポジトリの memory/ 撤去＋memory/company/ のpush完了 | 小（手動） |
| P3 | vitest＋CI導入（rakutenCsv・router・parser） | 中 |
| P3 | report系パーサをjsonブロック方式へ移行 | 小 |

---

補足: 本レビュー中に発見したP1事故（07-19のholdings/capacityスコープ追加がdepartments.ts側のみだった件）は、`scopes.ts` の `personal-fund` に `holdings.md`/`capacity.md` を追加して**修正済み**（tsc確認済み）。
