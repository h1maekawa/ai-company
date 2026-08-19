# 14. Money × Knowledge Target Architecture & ADR

- 作成: 2026-08-19
- 対象: `ai-company` / `ai-secretary`
- 位置づけ: 2026-08-19 の要件定義壁打ち（`CLAUDE_AI_COMPANY_REQUIREMENTS_WORKSHOP.md`）で確定した設計判断 A〜H の正本（Phase 0 成果物）。
- 前提レビュー: `docs/13_ARCHITECTURE_REVIEW_20260719.md`、および 2026-08-19 の現状調査（スコア約52/100）。
- 原則: **Evolution over Revolution** / 既存Vault・API・データを壊さない / additive & rollback可能。

このドキュメントは「なぜこの構成にするか（Decision + Rationale + Consequences）」を固定し、以降の実装（Phase 1〜4）の判断基準にする。数値や画面ではなく **責務と正本** を定義する契約書として扱う。

---

## 0. 全体方針（Data Responsibility）

```
Obsidian / Markdown = Knowledge の Single Source of Truth（正本）
Dropbox             = Obsidian Vault の物理保存・同期先
Supabase            = 構造化された Machine State（+ 検索Index/Embedding = 派生データ）
Redis (Upstash)     = 一時 Context / Cache
```

- **正本は Obsidian Markdown だけ**。Supabase / Redis に載るものは、すべて Obsidian から再生成可能な「派生データ」か、Knowledge ではない「機械状態」。
- Knowledge / Memory / Log / Task / State を混ぜない（Workshop §6）。
- 既存の読み書き経路（GitHub Contents API / ローカルfs / Dropbox）は壊さず、段階的にこの構成へ寄せる。

### 現状（2026-08-19 時点の事実）

- `lib/vault.ts` = GitHub Contents API（本番） / ローカルfs（開発）の二経路。delete/move/rename は未実装（安全側）。
- Context Bus は **Upstash Redis** に保存（`lib/context/bus-server.ts`）。note research のキュー等もRedis。
- **Supabase は未導入（greenfield）**。依存も参照もゼロ。
- Knowledge 保存は `saveKnowledge()` が `memory/knowledge/<category>/` に書くが、**そのディレクトリは存在せず、どのSecretary Scopeも読んでいない**（＝現状 orphan）。

---

## ADR-A. Knowledge の正本 = Obsidian Markdown（唯一）

**Decision**: Knowledge の Single Source of Truth は Obsidian Vault 内の Markdown ファイルとする。Supabase は Knowledge の正本にしない。Supabase に Knowledge のコピー / Index / Embedding を持つ場合も、それは Obsidian から再生成可能な派生データとして扱う。

**Rationale**: 正本を1つに固定するのは Workshop の最上位要件（正本が明確か）。Money 側は既に「Obsidian が正本（`holdings.md` = 保有の正、`positions.md` = 判断）」で実運用に成功しており、その成功パターンを Knowledge に横展開する。

**Consequences / Constraints**:
- まず壊れた `saveKnowledge()` の保存先を、Vault 内の正しい Knowledge 領域へ修正する（Phase 1）。
- Dropbox は Vault の保存・同期先として継続利用（変更なし）。
- Supabase 導入を理由に既存 Vault データを一括移行しない。

---

## ADR-B. 投資UIは /investing に一本化（/fund は欠損なく統合し redirect）

**Decision**: `/investing` を投資機能全体の正式な入口（Canonical Route）とする。`/fund` は単純削除せず、以下の機能を欠損なく `/investing` 配下へ統合する:
- 楽天証券CSV取込 / 投資可能額 / 投信50:個別株50 配分分析 / 個別株集中度 / 保有商品一覧 / PolicyEngine（投資判断エンジン） / `/api/fund/**` 依存処理。

統合完了後、`/fund` は `/investing`（または該当 `/investing/*`）への **redirect** として残し、既存リンク・ブックマーク・API依存を壊さない。UIだけ統合して内部ロジックが二重化しないよう、共通の **Service / Repository / Domain 層** へ処理を寄せる。

**Rationale**: `/fund` と `/investing` はデータ土台（`memory/personal/fund/` の holdings/positions/capacity）を共有しているのに入口が2つある。Workshop の「1画面1目的・入口を絞る・重複を作らない」に反する。

**Consequences / Constraints**:
- **既存機能・データを失わないことを最優先**。
- `lib/fund/engine.ts` / `policy.ts` / `analyst.ts` は良い資産なので消さず、Domain層として再利用。
- Phase 3 で実施（Knowledge基盤が先）。

---

## ADR-C. Capture=自動 / Promotion=人間承認（Inbox 昇格モデル）

**Decision**: 学び候補（会話 / Grilling / 調査 / Skill実行 / Workflow 由来）は、ユーザー確認なしでまず **Inbox** へ自動保存（Capture）。ただし Obsidian の正式 Knowledge へは自動昇格させず、**人間承認（Promotion）** を必須にする。

正式フロー:
```
Capture → Inbox → AI整理 → Promotion Candidate → Human Approval → Knowledge
```

AI が昇格前に自動で行うこと: 要約 / タイトル生成 / カテゴリ(domain)推定 / タグ付与 / 既存Knowledgeとの重複確認 / 矛盾候補の検出 / 「昇格 / 統合 / 保留 / 破棄」の推奨 / 昇格先ファイル候補の提示。

承認 UI: `/weekly-review` 等で複数件を一括確認・承認。個別の即時昇格も可能にする。

**Status enum**（各アイテムに持たせる）:
```
captured   … Inboxに取り込んだ直後（未整理）
candidate  … AI整理済み・昇格提案あり（未承認）
promoted   … 人間承認済み・正式Knowledge化
merged     … 既存Knowledgeへ統合済み
rejected   … 破棄
archived   … 保留/アーカイブ
```

**Rationale**: 摩擦ゼロで貯める（毎回承認は結局貯まらない）＋ 昇格時にまとめて品質担保（即・本保存は誤分類・ノイズ・重複が増える）。既存 Inbox 部品（`memory/personal/inbox/`, `lib/pipeline/inbox*`）を活かせる。安全ルール「Knowledge Agent が既存ノートを勝手に大量書き換えしない」と整合。

**Consequences**: Inbox にあるだけの情報と昇格済みを AI が機械的に区別できること（status + `managed_by`）。Phase 4 で実施。

---

## ADR-D. 検索 = metadata + 全文 + 簡易ranking から（semantic は後付け）

**Decision**: 初期実装では semantic / vector 検索を必須にせず、まず正確でデバッグ可能な検索を完成させる。検索対象: title / frontmatter metadata / tags / category(domain) / path / headings / Markdown本文 / createdAt / updatedAt / status。

**簡易ranking の優先度ガイド**（weightは実装時に調整）:
```
title exact match > tag match > title partial match > heading match > metadata match > body match
```

**構造要件**: 検索ロジックと Index 保存先を分離し、将来 semantic/vector を追加できる疎結合構造にする。将来像: `Metadata/Keyword Search + Semantic Vector Search → Hybrid Ranking`。Supabase に Index/Embedding を持つ場合も派生データ（Obsidian から再生成可能）。

**Rationale**: Workshop §18「初期から重いVector DBは不要」。今の件数なら keyword+metadata で十分。Router ロジックは既存 `executive.ts`（キーワード→部署判定）の延長で書けて費用対効果が高い。

**Consequences**: Phase 2 で `SearchRepository`（interface）＋ 実装（当面 file/Vault 走査 or 軽量index）を作る。semantic は「知識が数百件を超えて引けなくなったら」。

---

## ADR-E. Supabase は抽象層のみ先行、実導入は必要になった機能から段階的に

**Decision**: Supabase は greenfield のため、今回の Knowledge 基盤改修と同時に全面導入しない。将来導入を容易にするため **Persistence 層を抽象化** する:

```
        Domain / Application
                ↓
      Store / Repository Interface
                ↓
 ┌──────────────┬──────────────┬──────────────┐
 File / Vault      Redis           Supabase
```

Application / Domain から Supabase SDK を直接呼ばない。最初の Supabase 導入候補は **Grilling Session / Workflow State / Task・Event History** 等の Machine State。Knowledge 本文の正本は引き続き Obsidian Markdown（Supabase 導入を理由に既存 Vault を一括移行しない）。**Supabase 未設定でも既存機能が動作する状態を維持**。

**Rationale**: 空の DB を先に足すのは Workshop §34（不必要なDB migration / 過剰実装禁止）に該当。抽象化だけ先に用意すれば、後からドロップインできる。

**Consequences**: Phase 1 で Repository interface を定義。既定実装は File/Vault・Redis。Supabase 実装は別Phase（機能ドリブン）。

---

## ADR-F. Vault 書き込み安全 = AI専用領域のみ自動書き込み（コードで強制）

**Decision**: AI が自動書き込みできるのは AI Managed 領域のみ。Human Managed の既存 Markdown に対し、AI は自動 overwrite / delete / rename / move を行わない。**Confirmation UI だけに依存せず、コード側で書き込みポリシーを強制**する。

| AI Managed（自動書き込み可） | Human Managed（自動編集不可） |
|---|---|
| Inbox | promoted Knowledge |
| chat-log | confirmed decisions |
| generated drafts | company policies |
| Grilling working state | manually authored notes |
| promotion candidates | important rules |
| temporary summaries | — |

Human Managed を変更する場合: `AI Proposal → Diff → Human Approval → Apply`。

frontmatter に所有情報 `managed_by: ai`（または同等）を持たせ、機械判定できる設計にする。**所有者不明のファイルは既定で Human Managed** として扱う。

**Rationale**: Workshop §22（Vault 安全ルール = 最重要）。UI 承認は迂回されうるので、書き込みポリシーはコードで担保する。

**Consequences**: Phase 1 で「書き込みゲート」を Persistence 層に実装（path allowlist ＋ `managed_by` 判定）。`vault.ts` は既に delete/move/rename が無いので、その安全性を維持（追加しない）。

---

## ADR-G. Knowledge domain = 11 canonical + Alias Resolver（ファイル一括改名なし）

**Decision**: Workshop §7 の 11 domain を Canonical Domain として採用する:
```
sales / kpi / investment / side-business / marketing /
content / ai / technology / management / strategy / personal
```
既存の固定8カテゴリ（sales / marketing / recruiting / investing / systems / content / strategy / misc）は **Alias Resolver** で無損失移行する:
```
Legacy Category → Alias Resolver → Canonical Domain
```

- domain 変更のため既存 Markdown を一括 move/rename しない。まず **metadata 上の domain 体系を統一**。
- 新規 Knowledge は 11 domain のみ使用。既存 Knowledge は読み込み時に alias 解決。
- 未知の domain を勝手に削除・置換せず、migration warning で検出。
- domain は **論理分類**、物理フォルダ構成とは疎結合。

**Alias マッピング案**（実装時に確定、`misc` 等は保留＝warning）:
```
investing  → investment
systems    → technology
recruiting → management   （暫定。人事系domainが要れば別途）
misc       → (未解決: warning。手動 or personal)
```

**Rationale**: 既存 Frontmatter / URL・リンク / Secretary Scope / 検索を壊さずに、Workshop が求める分野（kpi/ai/management/side-business 等）を表現可能にする。

**Consequences**: Phase 1 で `domain.ts`（canonical list ＋ alias resolver ＋ unknown検出）。将来 UI は `Knowledge ├ Business ├ Management ├ KPI ├ AI ├ Investing …` の論理表示に使える。

---

## ADR-H. 実装順 = Phase 0 (ADR) → 1 Knowledge基盤 → 2 検索/Router → 3 /investing統合 → 4 Inbox/Weekly Review

**Decision**:
```
Phase 0  Architecture Decision / Migration Policy 確定（本ドキュメント）
Phase 1  Knowledge Foundation
Phase 2  Search / Router
Phase 3  /investing Consolidation
Phase 4  Inbox / Weekly Review / Promotion
```
docs だけ書いて実装を先送りしない。Phase 0 完了後、同一作業内でそのまま実装へ進む。

**各 Phase 共通の Definition of Done / 制約**:
- 既存機能の `npx tsc --noEmit` / 該当 test / `npm run build` を通してから次 Phase へ。
- 既存 Vault の move / rename / delete は行わない。
- migration は **additive かつ rollback 可能**。
- feature branch `feature/money-knowledge-core` 上で small commits。

> 実行環境メモ: 本作業はユーザーのMac上のリポジトリを直接編集する。`next build` は端末ブリッジのコマンド時間制限を超えるため、build 検証はユーザー実行を依頼する場合がある（tsc は可能な範囲で自動実行）。

---

## Migration Policy（横断ルール）

1. **正本は Obsidian**。派生（index/embedding/state）は再生成可能に保つ。
2. **Additive only**: 既存ファイル・path・API・schema を消さない。新規は追加、旧経路は互換維持。
3. **No destructive vault ops**: AI から move/rename/delete/overwrite(Human Managed) を出さない。
4. **Rollback可能**: 各 Phase は独立して戻せる差分にする。
5. **所有権既定 = Human Managed**（`managed_by` 不明は人間管理扱い）。
6. **Supabase 未設定でも全機能が動く**こと。

---

## 未確定（次ラウンドの壁打ち候補）

- Home レイアウト（Money / Knowledge / Today 中心 vs 既存 Mind Map 併存）— Workshop §16 / §39E。
- Harness docs 更新（AGENTS.md / CLAUDE.md を North Star / データ責務 / 禁止操作 / DoD を含む実運用ルールへ）— §27。
- `recruiting` domain の扱い（management へ寄せるか人事系 domain を新設するか）。
- Grilling Session / Design Tree / Workflow のデータモデル詳細（Supabase 初回導入時）。
