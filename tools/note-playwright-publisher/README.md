# note Playwright ローカル投稿ランナー

まえみちのnote記事を、**このMac上のブラウザ操作**で下書き保存／公開するためのランナーです。

## なぜローカルなのか

note には一般公開された公式の投稿APIがありません。
非公開の内部APIを直接叩くことはしない方針のため、
実際の画面をPlaywrightで操作します。

サーバー（Vercel）からは実行せず、承認済みジョブをこのMacが取りに来る形にしています。

## 安全装置

| 設定 | 既定値 | 意味 |
| --- | --- | --- |
| `NOTE_AUTOPUBLISH_ENABLED` | `false` | falseの間は公開しない |
| `NOTE_DRAFT_ONLY` | `true` | 下書き保存で必ず停止する |
| `NOTE_PAID_PUBLISH_REQUIRE_CONFIRM` | `true` | 有料記事は人の確認が必須 |

- **最初の10件は必ず下書き保存までで停止**します（`MAX_AUTO_RUNS`）。
- noteの画面構成が変わったことを検知したら、**公開せず停止**して失敗を報告します。
- Slackで承認されたジョブしかサーバーから渡されません。
- Macが停止・スリープ中は実行されません（launchd はスリープ中に発火しません）。

## 認証情報の扱い

`storageState`（ログイン済みCookie）は **このディレクトリの `.auth/` にのみ**保存します。

- GitHubにコミットしない（`.gitignore` 済み）
- Vault（Dropbox）にも保存しない
- パスワードはコード中に書かず、初回だけ手動ログインする

## セットアップ

```bash
cd tools/note-playwright-publisher && npm install && npx playwright install chromium
```

初回だけ手動でログインして、セッションを保存します。

```bash
npm run login
```

## 実行

```bash
npm run once
```

## 定期実行（launchd）

`~/Library/LaunchAgents/com.maemichi.note-runner.plist` を作り、
`npm run once` を一定間隔で叩きます。Macがスリープ中は実行されません。

## 環境変数

`.env` をこのディレクトリに置きます（`.gitignore` 済み）。

```
APP_BASE_URL=https://ai-company-ilqd.vercel.app
LOCAL_RUNNER_TOKEN=（サーバーと同じ値）
NOTE_AUTOPUBLISH_ENABLED=false
NOTE_DRAFT_ONLY=true
```

## 実装状況

現在はジョブ取得・報告と安全装置の骨組みまでです。
実際の画面操作（タイトル入力・本文入力・見出し画像・タグ・有料設定）は、
noteのUIを確認しながら段階的に追加します。
