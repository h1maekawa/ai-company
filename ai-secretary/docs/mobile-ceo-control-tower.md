# Mobile CEO Control Tower

`/ceo` は、既存のCompany / Creator / Fund / Knowledge / EngineeringのSSOTをスマートフォン向けに投影するRead Modelです。新しい会計・投資・承認SSOTは作りません。

## Navigation

- Home: `/ceo`
- Work: `/ceo/work`
- Quick Action: `/ceo/actions`
- Approvals: `/ceo/approvals`
- CEO: `/company`

PWAは既存manifestとアイコンを再利用し、standaloneで`/ceo`を開きます。ブラウザの「ホーム画面に追加」からインストールできます。

## Safety boundaries

- Fund表示は常に`HUMAN_ONLY` / `aiExecutionAllowed: false`です。Decisionは人間の採否記録、Transactionは人間が証券会社で実行済みの約定Fact記録であり、注文機能ではありません。
- Engineering Requestは、人間確認済みPOSTだけがGitHub Issueを作成し、`ai-engineering` / `ai-ready`を付けます。Protected分類はIssueを作らず、人間のSecurity Reviewへ戻します。
- Quick Actionの重要操作は確認ダイアログを通し、Idempotency Keyで二重タップを抑止します。
- GitHub credentialはサーバー環境だけで読み、レスポンス・Client Component・ログへ渡しません。未設定時は`UNKNOWN`としてfail closedします。
- `null`や取得不能を0件・0円へ変換しません。

## Production configuration

既存の認証済みWebセッションを使用します。Mobile CEO専用のSecretはありません。Engineering Requestを有効にする場合のみ、Production Server Runtimeに既存の`GITHUB_TOKEN`または`GH_TOKEN`と、必要なら`ENGINEERING_REPOSITORY=owner/repository`を設定します。Tokenには対象RepositoryのIssue作成に必要な最小権限だけを与え、クライアント公開変数には設定しません。

Production Runtimeへの新しいcron、broker接続、自律実行、database migrationはありません。
