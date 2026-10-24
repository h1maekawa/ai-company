# AI Company OS｜就活SNS実装 引継ぎ（Draft only）

## 重要な現況
- GitHubリポジトリ：`h1maekawa/ai-company`、アプリ：`ai-secretary/`。
- Macローカル作業ブランチ：`feat/career-sns-draft-workflow`（報告された最終コミット：`8dfcc18`）。GitHubへ未pushの可能性が高い。**これを上書き・再実装しない。**
- ディスク残量の最終報告：2.3GiB。容量復旧前にnpm ci等の大きな書込みをしない。
- GitHub連携の書込み権限は403。現時点ではPR未作成。
- マスターSSOT：`ai-secretary/docs/AI_COMPANY_MASTER.md`。既存のKnowledge、Content、Execution、Performance、Action Gatewayを再利用。
- Crestix企業リポジトリ・データ・認証情報とは完全分離する。

## 作業順序
1. Macで容量10〜20GiB以上を確保、ローカル作業ツリーを保護し、差分監査。
2. 既存のキャリア投稿生成MVPとセッション保護のテストを再実行し、依存関係・TypeScript・Next.jsビルドを検証。
3. Ollama単独の生成エンドポイント（明示的provider、無断外部フォールバック禁止）、再試行・入力制限・タイムアウトを実装。
4. HTML/CSSプレビューをもとにPNG/JPEG 35枚へ再現可能にレンダリング。日本語フォントとオーバーフローの検査を実装。
5. 全投稿を`draft/review/approved`で追跡、本文変更で承認失効。実配信は無効。
6. X・IGの正しい@ID、Buffer channel IDを人間が確認するまで外部書込み禁止。dry-runと二重投稿防止のみ実装。
7. 既存の回帰テスト、匿名性・部門間混入テスト、外部送信ゼロを検証しDraft PRを提案。

## 要件
既存の `01_brand_and_drafts.md` にある REQ-001〜012 / AC-001〜008 を受入基準とする。
アカウント名は暫定表示名のみ。ユーザーから確認済みの@IDを受領して設定値を更新する。
会社契約のClaude/ChatGPTアカウントは個人データの自動処理に無断利用しない。
