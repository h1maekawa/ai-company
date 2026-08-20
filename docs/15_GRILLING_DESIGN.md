# 15. Grilling Session 設計（Phase 5 設計フェーズ成果物）

- 作成: 2026-08-20
- 対象: `ai-company` / `ai-secretary`
- 位置づけ: Phase 5（Grilling Skill）の**設計確定ADR**。本ドキュメント承認後に実装へ進む。
- 前提: `docs/14_MONEY_KNOWLEDGE_TARGET_ARCHITECTURE.md`（ADR A〜H）を継承。
- 原則: Evolution over Revolution / additive / rollback可能 / 既存API・保存パスを壊さない。

Grilling とは「曖昧なアイデア・計画・設計」を、論点分解 → 徹底的な質問 → 意思決定の積み上げ →
Shared Understanding → User Confirmation まで進める **複数ターンの対話型セッション**である。
単発の質問Skillではない。ユーザーが Shared Understanding を確認するまで実装を開始しない。

---

## 0. 現行Repo調査結果（Facts / 設計の前提）

| # | Fact | 出典 | 設計への影響 |
|---|---|---|---|
| F1 | 現Skill基盤はステートレス純関数。`SkillHandler = (input) => {markdown, output, warnings}` は同期・状態なし。`SkillDefinition` に `execute` は無く、`executeSkill()` は1回呼び切り | `app/lib/skills/{types,executor}.ts` | Grillingを現Skill基盤にそのまま載せるのは構造的に不可能 |
| F2 | Workflowの前例 `runPiroWorkflow()` も一括実行型（research→content→x を1回で流す） | `app/lib/piro/workflow.ts` | 既存Workflow実装は流用不可 |
| F3 | 可変状態の既存パターン＝Context Bus: **Redis先行＋fileミラー＋fail-open**。`saveBus` は EROFS 時 `/tmp` 退避 | `app/lib/context/bus-server.ts`, `app/lib/utils/redis.ts` | 本番Vercelは `/tmp` 以外書込不可・揮発。セッション永続の実体はRedis |
| F4 | `KeyValueStore` interface を定義済み・未実装 | `app/lib/persistence/store.ts` | GrillSessionStore はこの差し替え口の具体化として入る |
| F5 | Vault JSONストア流儀＝「人間可読Markdown＋末尾 ```json ブロック」1ファイル | `app/lib/fund/store.ts`, `app/lib/planning/store.ts` | 確定成果物をVaultに残す場合はこの流儀に合わせる |
| F6 | writePolicy の AI_MANAGED_PREFIXES に `memory/personal/grilling/` を登録済み。`captureKnowledgeCandidate()` は非致命・Inbox止まり・40字未満破棄 | `app/lib/knowledge/{writePolicy,captureService}.ts` | Knowledge接続は追加実装がほぼ不要 |
| F7 | Chatはサーバー側セッション無し。`chat/page.tsx` が useState 保持、`history.slice(-10)` を送るだけ | `app/chat/page.tsx`, `app/api/chat/route.ts` | Chatに埋めるとDesign Tree/Frontierが消える |
| F8 | 認証は middleware で `/api/*` 一括（Slack/cron/local-runner除外） | `middleware.ts` | 新設APIは自動で保護される |
| F9 | `executive-assistant` が「壁打ち・思考整理」の一次受け。hubに grill ノードは無い | `app/lib/config/{departments,hub}.ts` | 秘書からの導線は executive-assistant に接続するのが自然 |

---

## 1. 確定した設計判断（D1〜D10）

すべてユーザー承認済み（2026-08-20）。

### D1. Grilling は第3の概念「Interactive Session」として独立実装する
`lib/grill/` に独立実装し、Skill Registry には**入口だけ**を登録する（秘書からの発見性を保つため）。
- 理由: F1よりSkill基盤の multi-turn 化は `SkillHandler` 型と `executeSkill()` の全面改修を伴い、実装済み5 Skillへの回帰リスクが高い。F2よりWorkflowも流用不可。
- **既存の `executeSkill()` / `SkillHandler` / 既存5 Skillには一切変更を加えない。**

### D2. Session State Schema
```ts
type GrillSessionStatus = "active" | "ready_for_confirmation" | "confirmed" | "cancelled";
type GrillNodeStatus    = "blocked" | "frontier" | "answered";

interface GrillNode {
  id: string;
  question: string;          // 質問本文
  title: string;             // 短い論点名（Q1 - <title>）
  dependsOn: string[];       // 前提ノードID（全てansweredでfrontier化）
  status: GrillNodeStatus;
  options?: GrillOption[];   // 「選ぶだけ」の選択肢（1が推奨案）
  recommendation: string;    // AIの推奨回答（必須）
  recommendationReason: string;
  answer?: string;           // 確定回答
  answeredAt?: string;
  children: string[];        // 派生ノードID
}

interface GrillOption { index: number; label: string; description: string; isRecommended: boolean; }

interface GrillFact {         // AIが自分で調べた事実（ユーザーに聞かない）
  id: string; statement: string; source: string; // 例: "knowledge:memory/knowledge/sales/xxx.md"
}

interface GrillSession {
  id: string;
  topic: string;
  status: GrillSessionStatus;
  designTree: GrillNode[];
  answers: Record<string, string>;   // nodeId → answer
  currentFrontier: string[];         // nodeId[]
  round: number;
  facts: GrillFact[];
  sharedUnderstanding?: SharedUnderstanding;
  secretaryId: string;               // 既定 executive-assistant
  durability: "durable" | "volatile"; // 直近の保存が永続実体に届いたか（D3参照）
  createdAt: string;
  updatedAt: string;
}

interface SharedUnderstanding {
  summary: string;
  majorDecisions: { decision: string; reason: string }[];
  rejectedAlternatives: { alternative: string; reason: string }[];
  risks: string[];
  remainingAssumptions: string[];
  implementationScope: string[];
  generatedAt: string;
}
```
- `designTree` と `answers` は**同一Sessionオブジェクト内**に保持する（Frontier計算の一貫性のため分割しない）。
- `facts` を持つのは、中断再開後も「調べれば分かることを再質問しない」を保証するため。

### D3. Persistence — `GrillSessionStore` interface ＋ Redis先行／fileミラー
```
Domain / Application (orchestrator)
        ↓
GrillSessionStore (interface)
        ↓
┌─────────────────┬──────────────────┬─────────────────────┐
RedisSessionStore   FileSessionStore    SupabaseSessionStore
(本番の実体)         (dev/fallback)      (将来。今回未実装)
```
- Context Bus と同じ **fail-open**（`redisSafeGet/Set` は失敗してもthrowしない）。
- Redis未設定でも file にフォールバックして動作する。**Supabase未設定でも全機能が動く**（ADR-E継承）。
- Redis key namespace: `grill:session:<id>` / `grill:index:active`（`REDIS_KEYS` に追加）。
- File: `memory/personal/grilling/sessions/<id>.json`（AI Managed領域・F6で許可済み）。開発環境の実体。

#### 永続性の定義（重要・誤認防止）

```text
Production (Vercel):
  Redis = Session State の唯一の永続実体
  /tmp  = temporary fallback のみ（永続化とは扱わない）
```

本番の `/tmp` は**インスタンス毎に揮発**するため、そこへ書けても「永続保存された」とは扱わない。
Redis 保存に失敗した場合の挙動を次のように定める。

- Grilling 自体は**継続可能**（fail-openを維持し、セッションを落とさない）。
- ただし `sessionDurability: "volatile"` を返す（成功時は `"durable"`）。
- UI は volatile のとき **「このセッションは再開保証されません」** を明示する。

`GrillSessionStore.save()` は書き込み先を示す結果を返す:
```ts
type PersistResult = {
  durability: "durable" | "volatile";  // durable = Redis(本番) / file(開発) に確実に書けた
  backend: "redis" | "file" | "tmp" | "none";
  warning?: string;                    // volatile 時の理由（UI表示用）
};
```

### D4. Facts は AI が自動調査する（FactResolver + Provider方式）

「調べれば分かることをユーザーに質問しない」という思想はそのまま。ただし**毎回全Providerを無条件実行しない**。

```text
FactResolver
 ├ KnowledgeFactProvider   … Knowledge Search（promoted のみ・Phase4 ADR準拠）
 ├ VaultFactProvider       … Vault の関連既存ファイル
 └ RepoFactProvider        … Repo構造・実装有無
```

`FactResolver` が topic に応じて**必要なProviderだけ**を選択して実行する。

| topic の例 | 実行するProvider |
|---|---|
| 営業商談の壁打ち | Knowledge / Vault |
| GitHubシステム設計 | Knowledge / Repo / Vault |
| 投資方針の検討 | Knowledge / Vault |

- Provider は共通interface（`resolve(topic, ctx) => GrillFact[]`）を実装し、**個別に失敗してもResolver全体は落とさない**（fail-open）。
- 選択ロジックは決定論的（キーワード判定）を基本とし、判断をLLMに委ねない（D7と同じ原則）。
- 新しい情報源（外部API等）はProviderを1つ足すだけで拡張できる。

### D5. UI — 専用ページ `/grill`
- Round単位で「今回の質問群（Frontier）」をカード表示。選択肢はボタン、自由記述も可。
- 進捗表示: Round数 / Frontier残数 / 回答済み・全論点数。
- 既存 `/weekly-review` と同じ独立ページ流儀に揃える（Chatの逐次UIはFrontier方式と相性が悪い）。

### D6. Chat統合 — 当面は `/grill` が唯一の入口
- Chatからは「Grillingを開始しますか？」→ `/grill?topic=...` へのリンク誘導のみ。
- 将来の自然言語起動（「壁打ちして」「深掘りして」「grill me」）は `lib/router/executive.ts` に intent 分岐を1つ足すだけで拡張できる構造にする。
- **Chat本体（F7）には手を入れない。**

### D7. Frontier は決定論的に計算する
- `dependsOn` が全て `answered` のノード＝`frontier`、それ以外は `blocked`。**遷移計算はコード、生成のみLLM**。
- Fund Policy Engine（`engine.ts`）で確立した「判断はコード、生成はLLM」原則と同じ。
- 再現性・デバッグ性・中断再開時の一貫性を担保する。

### D8. Confirmation UX
```
Frontierが空 → Shared Understanding 全文提示 → 3択
   1. 承認        → status: confirmed（→ Knowledge Capture へ）
   2. 修正して再Grill → 新ノード追加 → Frontier復活 → status: active
   3. 破棄        → status: cancelled
```
- 承認するまで `status: ready_for_confirmation` を維持し、**実装は開始しない**。
- 「修正して再Grill」を用意するのは、確認時に新論点が出るのが実務上ほぼ確実なため。

### D9. Knowledge Capture 接続
- `status: confirmed` の**瞬間にのみ** Shared Understanding 全文を
  `captureKnowledgeCandidate({ source: "grilling" })` で **Inbox Candidate 化**する。
- Grilling中の個々の回答は保存しない（Working State は Machine State であってKnowledgeではない）。
- 昇格は既存 `/weekly-review` の人間承認のみ。正式Knowledgeを直接作らない（Phase4のApproved Write境界を維持）。
- 実装差分: `CaptureSource` に `"grilling"` を追加するのみ。
- **confirmed 後の長期保存経路はこれ1本に統一する**（D10参照。Grilling独自のVault保存は作らない）。

### D10. 再開・履歴管理 / Supabase初導入範囲
- 今回は Redis（＋fileフォールバック）で **`active` セッションのみ**管理し、`/grill` に「再開」一覧を表示。
- **`confirmed` 後の長期保存は D9 の Phase4 Capture Flow のみに統一する。**
  Grilling独自の正式Knowledge保存・確定要約のVault書き込みは**行わない**（Working State を Knowledge として二重保存しない）。

```text
active session
  → Redis（唯一の永続実体・D3）

confirmed
  → Shared Understanding
  → captureKnowledgeCandidate(source: "grilling")
  → Inbox Candidate
  → Weekly Review
  → Human Approval
  → Formal Knowledge   ← 長期保存はここだけが担保する
```

- **Supabaseは今回導入しない。** interface と Schema 定義のみ確定し、実運用で必要性が判明した段階で
  `SupabaseSessionStore` を1つ足す（テーブル案: `grill_sessions(id, topic, status, state jsonb, created_at, updated_at)`）。

---

## 2. 実装計画（承認後に着手）

| Phase | 内容 | 主なファイル（予定） |
|---|---|---|
| 5A | ドメイン層（型・Frontier計算・状態機械） | `lib/grill/types.ts`, `designTree.ts` |
| 5B | 永続化層 | `lib/grill/store.ts`（interface + Redis/File実装）、`utils/redis.ts` に key追加 |
| 5C | オーケストレーション（Facts調査・質問生成・Shared Understanding生成） | `lib/grill/{facts,questions,synthesis,orchestrator}.ts` |
| 5D | API | `app/api/grill/{start,answer,confirm,cancel,sessions}/route.ts` |
| 5E | UI | `app/grill/page.tsx` |
| 5F | 接続 | Skill Registry に入口登録、`CaptureSource` に `grilling` 追加、Chatからの誘導リンク |

各Phaseで `npx tsc --noEmit` / `npm test` を通す。Grilling用のE2Eテストを `npm run test:knowledge` と同流儀で追加する
（Frontier計算・状態遷移・confirmed時のみCapture・Supabase未設定動作を検証）。

## 3. 制約（継承・厳守）

- 既存Vaultの **move / rename / delete / Human Managed の AI 自動 overwrite は禁止**。
- Migration は additive・rollback可能・既存API互換維持・既存保存パス維持。
- **Supabase未設定でも既存AI Companyが完全動作すること。**
- Grilling は AI の判断で途中終了しない（Frontierが空→Shared Understanding→User Confirmation まで進める）。
- ユーザーが Shared Understanding を確認するまで実装を開始しない。

## 4. 残タスク（本Phase外）

- **Conflict Detection = 未実装**（Phase4から継続。現状は重複検出のみ）。
- `test:architecture` / `test:content` はRepoに存在しない（main にも無い）。必要になった時点で新規作成する。
- Supabase 実導入（Grilling Machine State の実運用知見が得られてから）。
