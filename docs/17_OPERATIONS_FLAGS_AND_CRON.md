# 運用フラグ・環境変数・cron 一覧（TASK-C1 / C3）

両事業部を「全自動で回す」ために必要なスイッチを1枚にまとめる。
`vercel.json` はJSONでコメントを書けないため、日本時間の対応表はここを正とする。

最終更新: 2026-09-10

---

## 1. cron 一覧（TASK-C1）

`vercel.json` の `schedule` はすべて **UTC**。JSTは +9 時間。

| path | UTC | JST | 目的 |
|---|---|---|---|
| `/api/cron/note-daily-research` | `0 22 * * *` | 毎日 07:00 | トレンド調査・候補クラスタ更新 |
| `/api/cron/x-daily-publish` | `0 23 * * *` | 毎日 08:00 | 候補選定→生成→Safety/Factゲート→Buffer予約 |
| `/api/cron/content-nightly-review` | `30 14 * * *` | 毎日 23:30 | 実績回収（Performance Sync）＋夜間の成長戦略見直し |
| `/api/cron/investing-snapshot` | `0 6 * * 1-5` | 平日 15:00 | 東京市場の引けで資産スナップショット |

補足:

- **自己学習ループはすでに閉じている**。`runPerformanceSync` は
  `content-nightly-review`（23:30 JST）の中で毎晩呼ばれており
  （`app/lib/note/automation/nightlyGrowthReview.ts`）、
  `/api/cron/x-performance-sync` は同じ処理を単体で叩くための予備口に過ぎない。
  Vercel の cron 本数を節約するため夜間レビューへ統合した経緯があり
  （`tests/maemichi/buffer-metrics.test.mjs` が契約として固定している）、
  二重登録すると同じ実績を2回取りに行くだけになる。
  ループは `x-daily-publish`（生成）→ 夜間レビュー内の実績回収・勝ちトピック再評価 →
  翌朝の `x-daily-publish` の候補スコアへ反映、で一周する。
- **日中スナップショットは実装済みだが、cron は1日1回に留めている。**
  現行の Vercel プランは1日1回より細かい cron を受け付けず、
  `0 0-6 * * 1-5` のような時間刻みを入れるとデプロイ自体が失敗する。
  `recordSnapshot(total, { intraday: true })` と `/api/cron/investing-snapshot` は
  複数点の記録に対応済みなので、プランを上げたら schedule を
  `0 0-6 * * 1-5`（東京場中）と `0 14-20 * * 1-5`（米国場中）へ増やすだけで
  日中の推移が滑らかになる。
- `investing-snapshot` は値が動いていなければ書き込まない。
  連続実行の最小間隔は 20 分（`app/lib/investing/history.ts`）。
- cron はすべて `CRON_SECRET` で認証する（`verifyCronSecret`）。

---

## 2. 環境変数（TASK-C3）

| 変数 | 既定 | 効果 | ONにする手順 |
|---|---|---|---|
| `X_DAILY_AUTOMATION_ENABLED` | 未設定（=停止） | `false` だと `runDailyXAutomation` が即 skip する | Vercel の環境変数に `true` |
| `BUFFER_ENABLED` | 未設定（=無効） | `false` だと `isBufferConfigured()` が false になり予約しない | `true` |
| `BUFFER_API_KEY` | — | Buffer GraphQL の認証 | Buffer の開発者設定から取得 |
| `BUFFER_ORGANIZATION_ID` | — | 投稿先の組織 | Buffer の管理画面 |
| `BUFFER_X_CHANNEL_ID` | — | 投稿先のXチャンネル | Buffer の管理画面 |
| `CRON_SECRET` | — | cron ルートの認証 | 任意の長い文字列 |
| `FUND_MARKET_PROVIDER` | 未設定（=`yahoo`+`stooq`） | 市場データの取得元。`null` にすると常に未取得（フォールバック確認用） | 通常は未設定のまま |
| `VAULT_ROOT` | — | ローカル開発時のVault参照先 | ローカルのみ設定 |

### 市場データについて（重要）

`stooq.com` は 2026-09 に JavaScript のボット検証を挟むようになり、
サーバーサイドからの CSV 取得が恒常的に失敗する。検証の回避は行わないため、
既定プロバイダーを **Yahoo Finance の chart API**（キー不要）へ切り替えた。
Stooq は後段のフォールバックとして残してある（`chainProviders`）。

---

## 3. フィーチャーフラグ（Vault: リサーチ設定）

`app/lib/note/research/types.ts` の `defaultFeatureFlags()` が既定値。
画面からは `/content/settings` の「運用モード」で切り替える。

| フラグ | 既定 | 意味 |
|---|---|---|
| `publishingEnabled` | `false` | 全体の停止スイッチ。false ならどのチャネルにも出さない |
| `xAutoPublish` | `false` | X の自動予約（Buffer） |
| `noteAutoPublish` | `false` | note の自動公開 |
| `noteDraftOnly` | `true` | note は下書き保存までに限定 |
| `maxXPostsPerDay` | `3` | 1日あたりのX投稿上限 |
| `maxBufferScheduled` | `7` | Buffer の予約枠のうち自動で埋めてよい件数 |
| `xFreeWorkspaceEnabled` | `false` | 無料のX作業画面 |
| `localAiEditorEnabled` | `false` | Mac の Ollama で原稿を添削 |
| `xBrowserAutomationEnabled` | 常に `false` | ブラウザ自動操作は禁止（変更不可） |

### 運用モードとフラグの対応

`resolveOperationMode()` / `operationModeFlags()` が変換する。フラグが正、モードは呼び名。

| モード | `publishingEnabled` | `xAutoPublish` | 挙動 |
|---|---|---|---|
| 下書きのみ `draft` | `false` | `false` | 生成まで。どこにも出さない（既定） |
| 承認あり `review` | `true` | `false` | Slackへ提示し、承認したものだけ投稿 |
| 全自動 `autopilot` | `true` | `true` | Safety/Factゲート通過分をBufferへ自動予約 |

**どのモードでも Safety/Fact Gate と Human Escalation は外れない**（要件P1.6）。
機密・個人情報・事実確認NGは autopilot でも人の確認へ回る。

---

## 4. 全自動を始めるまでの手順

1. Buffer 側でXチャンネルを接続し、API キー・組織ID・チャンネルIDを取得する。
2. Vercel に `BUFFER_ENABLED=true` と `BUFFER_*`、`X_DAILY_AUTOMATION_ENABLED=true` を設定。
3. `/content/settings` の「運用モード」を **全自動** にする。
4. `/content` トップの運用モニターで「実際に自動で回っています」になることを確認する。
   止まっている場合、止めている理由がその場に全部並ぶ。
5. 文体の種入れ（自分のXアーカイブ取込）を済ませる:
   ```bash
   npm run import:x-archive -- <アーカイブZIP> --account=maemichi --write
   ```
   `--write` を付けない場合はプレビューのみ。取込先は
   `memory/personal/note/x-free-workspace.md` の `ownedPosts`。

### Buffer 無料プランの範囲

3チャンネル / 同時スケジュール10件（公開ごとに枠が解放）/ APIキー1本・月3,000リクエスト。
既定の `maxXPostsPerDay: 3` を1日先に予約する運用なら無料枠に収まる。

---

## 5. やらないこと（明示的な禁止事項）

- 証券口座への発注・自動売買（注文は一切行わない）
- ブローカー（楽天証券）への直接ログイン・残高スクレイピング
  （規約・セキュリティ・2FAの観点。保有の更新はCSV再取込で完結させる）
- ブラウザ自動操作によるX投稿（`xBrowserAutomationEnabled` は常に false）
- 外部アカウントの特徴的表現をそのまま保存・模倣すること
