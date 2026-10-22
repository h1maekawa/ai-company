# AI Company / 就活ラボ — Codex実装指示 v1 (2026-10-22)

## 最優先事項
- GitHub `h1maekawa/ai-company` の `AGENTS.md` と `ai-secretary/docs/AI_COMPANY_MASTER.md` を**全文**確認し、既存のEngineering Worker、安全境界、共通Research・Performance・Learning/Execution Storeを再利用する。
- main、open PR、ほかの作業worktree、就活アカウントの最新実装を照合する。未コミットの他セッションは参照不能なら `UNKNOWN` と記録。既存コードを勝手に上書きしない。
- 既存SSOTの優先順位との整合を明示する。就活はCreator/SNS共通エンジンの事業部アダプターとして扱い、新たな平行エンジンを作らない。

## 目的・KPI
- 既存TikTok動画から「就活ラボ」認知用LPに誘導し、Instagram/Xへのフォロー動線を最適化する。
- 当面は**商品販売なし・個人情報入力フォームなし**。CTR（TikTok→LP）、LP→Instagram/Xクリック率、プロフィール閲覧・フォロー増加を観測する。未取得はゼロではなくUNAVAILABLE。
- 学生向けテーマはAI活用ES/ガクチカ、自己分析、企業研究、面接。誇張表現（必ず内定、無双できる保証）や実績捏造は禁止。

## すぐ着手できるもの
1. 添付 `index.html` をLP叩き台として既存Next.jsアプリの適切な公開ルートに移植。既存UI/ブランドを壊さない。スマホ優先でアクセシビリティ、SEO、OGP、画像描画、表示速度をテスト。
2. ブランド名「就活ラボ」は**仮称**。Instagram/TikTok/Xの実アカウントURLは未確定。**推測でリンクしない**。管理設定からURLを設定し、URL未設定の間は「準備中」と明示する。設定時は検証済み許可ドメイン・HTTPSのみ。`utm_source=tiktok` 等の計測は同意・プライバシーに配慮。
3. 既存SNS投稿の共通パイプラインを活用し、「就活ラボ」のコンテンツブリーフ → 原稿 → HTML/CSSテンプレ画像 → プレビュー → QA → 下書き保存を作成。X/IG/TikTokへの実投稿は現時点で自動実行しない。
4. LPのCTA遷移、スマホ表示、誤URL、リンク未設定、投稿内容チェックの自動テストを追加。Playwrightなど既存構成を優先。
5. 朝確認できる `OVERNIGHT_HANDOFF.md` を作成。変更点、テストの実行結果、未完了、承認が必要なこと、GitHub Draft PR URLを整理。

## 三部門自律開発ワークフロー（別フェーズ）
- Requirements Agent → Implementation Agent → Independent QA Agent。ミッション単位でバージョン付き要件・差分・QA証拠を持ち、修正は最大3回。
- 現行Engineering Workerは**人間が付与した `ai-ready` ラベルを必要とする**。この承認を自動で付与・回避しない。
- 予算上限未設定時、自動夜間反復は拒否。停止スイッチ、リトライ・リース・重複防止、独立QAの結果と実費を記録。
- 本番DB変更、既存PRの自動マージ、Production deploy、SNS公開、課金・売買・シークレット変更は禁止。
- 通知はまず既存の私的通知基盤・CEO承認画面を確認。X公開投稿やDMの反応を承認として扱わない。通知連携が未構築なら「未連携」と報告する。

## 完了条件
- 実装が専用feature branch / worktreeに分離され、必要なテストが**実際に**成功し、Draft PRに結果が添付されている。
- SNS URL未確定でもLPは安全にプレビューできる。投稿生成は下書きまで動く。
- AI会社全体の実装済み/部分実装/未実装を根拠付きで報告。生産運用は人間承認待ち。

## 起動指示例
「このファイルと既存AGENTS.md/AI_COMPANY_MASTER.mdを読み、P0現状監査→LP移植→SNS下書き→テストの順で進めてください。既存worktreeやPRを保護し、確認できない最新状態はUNKNOWNとしてください。本番変更は禁止し、Draft PRと朝の引継ぎを残してください。」
