# AI Company v2 — 現状サマリーと次の一手（06_STATUS_AND_NEXT_STEPS）

> `00`〜`05`のここまでの作業を1枚に集約したもの。「今どこまでできているか」と「次に何を決めるべきか」に絞って整理する。

## 1. 全体像（一言で）

**土台（分析・設計・Memory台帳・Skillsの入れ物）は完成。実処理（実際にSkillが動く・Media Platformが広がる）はまだゼロ。** 次の一手は「大きな新機能」ではなく、ロードマップPhase1「現状改善」を1つずつ実処理化していくフェーズ。

---

## 2. 現在動いている機能（v1・既存要件として確定しているもの）

| 領域 | 内容 |
|---|---|
| Department | `executive`（雑談・Inbox）／`personal`（CEO・朝会・note・投資・Fund Room）／`company`（CEO・システム開発、`crestix-*`互換名あり）／`hd-business`（KPI・パイプライン・クロージング・改善の4秘書＋統括） |
| Secretary | 計16体（互換用含む）。人格＝`departments.ts`の個別prompt＋`scopes.ts`のMemoryスコープの組み合わせで機能する |
| API | `POST /api/chat`（本体）、`GET/PUT /api/vault/[...path]`、`GET/PUT /api/memory/[filename]`、`POST/GET /api/fund/log`、`GET /api/fund/report`、`POST /api/note/generate`、`POST /api/note/promote`、`POST /api/knowledge/save`、`GET /api/report/morning`、**新規** `GET /api/skills` |
| Memory / Vault | `memory/**/*.md`がSingle Source of Truth。本番はGitHub Contents API、開発時はローカルfsの二刀流（`vault.ts`が吸収）。Obsidian（`vaults/`）が人間の編集入口 |
| インフラ | Vercel＋GitHub＋Upstash Redis（ContextBus）＋Gemini（既定）／Groq（フォールバック） |

---

## 3. ここまで完了したこと（この会話での成果）

- [x] **Phase1 現状分析**（`00`, `01`）— Directory/Department/Secretary/Prompt/Memory/Vault/API/Data Flowを実コード確認込みで棚卸し
- [x] **アーキテクチャ設計**（`02`）— Skills層を新設するLayer構成、Department→Room→Secretary→Skill/Workflowモデル、Media Platform展開の型を設計
- [x] **Phase2 Foundation 実装**（`03`, `04`）
  - Memory Manifest作成（9秘書＋その他秘書の Read/Write/未参照Memoryを実ファイル確認込みで整理）
  - Skills Registryの入れ物を実装（`app/lib/skills/`、5件登録・**全て`status: "planned"`＝未実装**）
  - `Secretary`型に`skillIds?`を追加（既存秘書定義は無変更）
  - **Morning Reportの本番読み込みバグを修正**（`fs`直読み→`vault.ts`経由に統一）
  - `GET /api/skills`追加
  - `npx tsc --noEmit`はエラー0件確認。`npm run build`の完走は未確認（サンドボックス制約）
- [x] **実装ロードマップ策定**（`05`）— Phase1現状改善〜Phase7 Media Platformの7段階を、対象/追加/変更ファイル・テスト・レビュー・ロールバック・DoD・Riskつきで定義

- [x] **判断ポイントの決着と即時反映**（本ドキュメント作成の同セッション内で実施）— `prompts.ts`の未使用コード削除、`memory/note/`・`memory/crestix/`のアーカイブ退避。`tsc --noEmit`で影響なしを確認済み

**まだ着手していないこと**: ロードマップの7Phaseはすべて未着手（Skill 5件は「箱」だけで中身が空、Media Platformの`media-room`もまだ存在しない）。

---

## 4. 判断ポイント（2026-07-09 決定・実施済み）

前回提示した5つの判断ポイントのうち4つはこの会話で決着し、即座に反映した。

1. **`app/lib/prompts.ts`の`SYSTEM_PROMPTS`（4モード分、デッドコード）** → **削除で決定・実施済み**。`PERSONAL_PROMPT`/`COMPANY_PROMPT`/`FINANCE_PROMPT`/`NOTE_PROMPT`及び`SYSTEM_PROMPTS`/`getSystemPrompt()`を削除。UIで現役使用中の`SECRETARY_LABELS`/`SECRETARY_DESCRIPTIONS`/`SecretaryMode`再exportは維持。旧`NOTE_PROMPT`の単価区分・曜日ローテーション等は、現行の`memory/personal/note/{monetization,hooks,themes}.md`がより新しい実データとして上位互換の内容を持っていることを確認済みで、情報欠落なし。`tsc --noEmit`で影響なしを確認。
2. **`memory/note/`・`memory/crestix/`（孤立ディレクトリ）** → **`memory/archive/_orphaned/`へ退避で決定・実施済み**。ハード削除ではなくアーカイブ移動（プロジェクト自身の安全ルール「削除前にバックアップ/アーカイブを作る」に準拠）。`memory/crestix/`は実際にmission/vision等の実データを含んでいたため、消さずに保全した。
3. **Learning Skill（ロードマップPhase6）の自動書き込み** → **現行ロードマップの「人間承認必須・Phase7完了後に自動化を再検討」の設計のまま据え置き**（すでに希望と一致していたため変更なし）。
4. **Skills実装の優先順位** → **ロードマップPhase1通り（`hd-kpi-calculation`・`fund-log-format`から）で決定**。変更なし。
5. **Media Platform（Phase7）をどの媒体から始めるか** → 未決定のまま（Phase7に着手する段階で改めて判断）。

---

## 5. 次の一手（確定）

ロードマップ`05`のPhase1「現状改善」がそのまま次にやること:
- `hd-kpi-calculation`・`fund-log-format`の2 Skillに実処理を入れる
- `memory/personal/note/affiliates/index.md`・`kpi.md`を作成する（`personal-note`秘書のスコープ欠落を埋める）
- `npm run build`の完走を本番相当環境で確認する

---

*本ドキュメントは`00`〜`05`の要約。詳細は各ドキュメントを参照。*
