# エージェントの役割分担（note / A8.net 側）

要件3「役割分割の明文化」。

対応表の正は `ai-secretary/app/lib/agents/pipelineRoles.ts`（`PIPELINE_STEPS`）。
このドキュメントはその読み方と、意図的に分解していない理由を説明する。

最終更新: 2026-09-11

---

## 1. 方針: 実装は分解していない

`runDailyXAutomation` は既に「リサーチ → 生成 → Safety/Factゲート → Buffer予約」を
一気通貫で実行している。ここへ役割ごとの独立した実行処理を別に作ると、
同じ処理が二重に存在し、片方だけ直される事故が起きる。

そこで**既存の各ステップに役割のラベルを与える**方式を採った。
実行の順序も安全弁も現状のままで、
「誰が何をやったか」がタスクログ（要件1）と進行状況（要件7）から追える。

役割ごとに別々のタイミングで動かす必要が出たときに、初めて分解を検討する。

## 2. 役割と工程

| 役割 | 工程 | 担当 |
|---|---|---|
| `market` | リサーチ | 市況・A8案件・収益機会を調べる |
| `research` | リサーチ | トレンドと参考情報を集め、候補を作る |
| `fact_check` | リサーチ | 投資情報の数値と出典を裏取りする |
| `writer` | 執筆 | 本人の文体で原稿を書く |
| `seo` | SEO最適化 | タイトル・見出し・タグを最適化する |
| `publisher` | 投稿 | 人間承認を経てから投稿する |

工程（`ReviewPhase`）は要件10のフェーズ別承認と要件7のステップ表示で共有する。

## 3. 既存パイプラインとの対応

| ステップID | 役割 | 実装 | 承認 |
|---|---|---|---|
| `market.intake` | market | `app/lib/agents/market.ts` `runMarketIntake` | 不要 |
| `research.collect` | research | `app/lib/note/research/run.ts` `runResearch` | 不要 |
| `research.select` | research | `dailyX.ts`（候補スコアリング） | 不要 |
| `writer.generate` | writer | `research/generate.ts` `generateXPosts` | 不要 |
| `fact_check.gate` | fact_check | `safetyRepair.ts` `prepareXDraftForPublishing` | 不要 |
| `publisher.schedule` | publisher | `publishing/buffer.ts` `createPost` | **必要** |

### publisher だけが承認を必須とする

`requiresApprovalBeforeRun("publisher") === true`。
自動承認（要件10）で工程がスキップされた場合も、
「承認された」という事実は必ず経由する。承認の記録は `ReviewFeedback` に残る。

### seo に対応するステップが無い

タイトル・見出しの最適化は `generateXPosts` の中に含まれており、
独立した工程になっていない。`ROLES_WITHOUT_PIPELINE_STEP` に明示してある。

「実装されているつもり」で放置しないための記載であり、
note記事側でSEO工程を独立させるときにここから外す。

## 4. 実行の記録

`app/lib/agents/recorder.ts` が各ステップの完了を `AgentTask` として残す。

- `origin: "automation"` … 自動パイプライン由来（このドキュメントの対象）
- `origin: "chat"` … 本人がチャットで指示したもの（要件1）

同じ一覧に並ぶが、由来が違うと読み方が変わるため画面でも区別する。

**記録が落ちても本処理は止めない。** ログのためにその日の投稿が止まる事態を避ける。

## 5. 変更するときの約束

- `PIPELINE_STEPS` の `id` は変更しない（タスクログの突き合わせに使う）
- コードの担当を変えたら `PIPELINE_STEPS` の `implementation` も直す
- 役割を増やしたら、対応ステップが無い場合は `ROLES_WITHOUT_PIPELINE_STEP` へ入れる
