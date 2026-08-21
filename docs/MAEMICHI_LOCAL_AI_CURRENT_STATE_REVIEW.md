# まえみち Local AI 添削機能 — Phase 0 現状レビュー

- 実施日: 2026-08-02
- 対象: `h1maekawa/ai-company`
- 対象アプリ: `ai-secretary`
- 基準コミット: `1d3ed44`
- 実投稿: 未実施（調査・ローカルテストのみ）

## 1. 結論

既存アーキテクチャを大きく変更せず、Local AI添削機能を追加できる。

すでに以下の再利用可能な基盤がある。

- Gemini・Groq・Ollamaを統一して呼び出す `callAI`
- Ollamaの `/api/chat` を呼び出す `callOllama`
- Note事業部のComposerと体験ライブラリ
- Slackの署名検証、コマンド、ボタン操作
- Upstash Redisクライアント、ロック、idempotency
- ローカルランナー用のトークン認証とジョブAPI
- 投稿停止用Feature Flag
- まえみち用の安全性・採点テスト

したがって、新しい部署や別のAI抽象化は作らない。Note事業部の既存Composerへ「本人原稿の添削」モードを追加し、VercelとMacの間は既存のローカルランナー方式に合わせたAPI pollingで接続する。

重大なアーキテクチャ不整合はない。ただし、実運用前に次の2点が必要である。

1. Ollamaデーモンが起動し、Macから `127.0.0.1:11434` へ接続できること
2. `.env.local` の `OLLAMA_MODEL` を実際にインストール済みのモデルへ合わせること

Feature FlagをOFFにしたdry-run実装は、この2点が未解決でも進められる。

## 2. ディレクトリ構成

主要部分は次のとおり。

```text
ai-secretary/
├── app/
│   ├── api/
│   │   ├── integrations/slack/
│   │   │   ├── commands/route.ts
│   │   │   └── actions/route.ts
│   │   ├── local-runner/note/jobs/
│   │   └── note/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts
│   │   │   ├── gemini.ts
│   │   │   ├── groq.ts
│   │   │   ├── ollama.ts
│   │   │   └── types.ts
│   │   ├── integrations/
│   │   ├── note/
│   │   ├── utils/redis.ts
│   │   └── vault.ts
│   └── note/
├── components/note/
│   ├── Composer.tsx
│   ├── ExperienceLibrary.tsx
│   ├── PublishQueue.tsx
│   └── AutomationSettings.tsx
├── scripts/
└── tests/
    ├── fund/
    └── maemichi/
```

## 3. AI呼び出しとプロバイダー切替

### 現状

`app/lib/ai/client.ts` の `callAI` が共通入口で、providerは次の4種類。

- `gemini`
- `groq`
- `ollama`
- `auto`

`auto`はGemini、Groq、ローカル環境のOllamaの順に選ぶ。Vercel上でOllamaを明示すると停止するため、VercelからMacのlocalhostへ接続しようとする構造にはなっていない。

`app/lib/ai/ollama.ts` は次をサポートしている。

- `OLLAMA_URL` / `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`
- `/api/chat`
- system prompt
- 会話履歴
- タイムアウト

### 採用方針

Local AI Workerは、Mac上で既存の `callAI(..., { provider: "ollama" })` を呼ぶ。新しいOllama専用クライアントは作らない。

クラウドへの自動フォールバックは実装しない。明示的に許可されない限り、Ollama失敗時はジョブを `failed` または再試行可能な `pending` とする。

## 4. Mac上のOllama確認

指定された確認コマンドを実行した。

| 確認 | 結果 |
|---|---|
| `which ollama` | `/usr/local/bin/ollama` |
| `ollama --version` | クライアント `0.32.5` |
| `ollama list` | 実行環境のlocalhost制限により取得不可 |
| `ollama ps` | 実行環境のlocalhost制限により取得不可 |
| `curl .../api/tags` | 実行環境のlocalhost制限により取得不可 |
| ローカルmanifest | `qwen2.5-coder:7b`、`qwen3:8b` を確認 |

実PC側の `.env.local` では次の設定を確認した。

```text
DEFAULT_PROVIDER=gemini
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
OLLAMA_TIMEOUT_MS=60000
```

`OLLAMA_MODEL=llama3.1` と、確認できたmanifestのモデル名が一致していない。モデルを推測で変更せず、実PCのターミナルで `ollama list` を確認してから設定する。

確認用コマンド:

```bash
ollama serve
ollama list
ollama ps
curl -sS http://127.0.0.1:11434/api/tags
```

モデルの新規ダウンロードは今回の作業範囲に含めない。

## 5. Note事業部のComposer

`components/note/Composer.tsx` は、タイトル、ジャンル、読者の持ち帰り、本人の実体験・材料を入力し、note・X・LINEをまとめて生成する。

現在は「AIがゼロから作る」寄りの画面で、次が不足している。

- 投稿先
- 記事の目的
- 元文章
- 修正の強さ
- 残したい表現
- 追加の事実情報
- 添削前後の比較
- 確認事項
- 採用・却下・再修正

新画面は作らず、Composer内に「新規生成」「本人原稿を添削」のモード切替を追加するのが自然である。

## 6. ブランド規則

現在のブランド設定は `memory/personal/note/brand.md` に保存され、未作成時はコード内の `defaultBrand()` へフォールバックする。

しかし、要件で指定された `MAEMICHI_BRAND_POSTING_RULES.md` を必須取得する処理はない。現在のComposerはブランドファイルを読み込めなくても既定値で生成できるため、新要件の「ブランド規則を取得できない場合は停止」と一致しない。

採用方針:

- Vault内の固定パスからブランド規則を取得する専用loaderを追加
- 空、404、読込エラー、最低限の識別子不在はfail-close
- 添削ジョブ作成前とWorker処理前の両方で確認
- ブランド規則本文を通常ログへ出さない
- 既存の `brand.md` はUI編集用として残し、置き換えない

## 7. 体験ライブラリ

`memory/personal/note/experience-library.md` に保存される。

各体験には次がある。

- 本人確認 `verifiedByUser`
- 機微情報 `sensitive`
- 起きたこと、試したこと、成功・失敗、学び
- 再利用可能な事実

本人確認済みかつ機微でない体験だけを添削コンテキストへ渡す。元文章にない体験を追加する根拠としては使わず、整合性確認と確認事項の生成に限定する。

## 8. Slack連携

現在の `/maemichi` は次を提供する。

- `research`
- `candidates`
- `autopost`
- `queue`
- `performance`
- `settings`

Slack署名、タイムスタンプ、リプレイ対策、ボタンのidempotencyが実装済み。

`/maemichi edit` と入力モーダルは未実装。既存のcommands routeへサブコマンドを追加し、既存actions routeへ `view_submission` と添削結果ボタンを追加する。

## 9. Redis、キュー、idempotency

Upstash Redisは既に導入済み。投稿処理では次がある。

- `SET NX EX` によるidempotency
- ロック
- 日次件数上限
- Redis障害時のプロセス内フォールバック

Local AIの原稿は個人・会社情報を含む可能性があるため、既存のfail-open helperをそのまま使わない。Local AIジョブはRedis必須のfail-closeとし、TTL、状態遷移、claim tokenを持つ専用repositoryを追加する。

推奨状態:

```text
pending -> running -> completed
                   -> failed
                   -> pending（期限切れclaimの回収）
```

WorkerはUpstashへ直接接続せず、既存ローカルランナーと同様にトークン認証されたAPIをpollingする。Redis資格情報をMacへ追加配布しない。

## 10. note投稿用ローカルランナー

次のAPIがある。

- `GET /api/local-runner/note/jobs/next`
- `POST /api/local-runner/note/jobs/:id/complete`
- `POST /api/local-runner/note/jobs/:id/fail`

`LOCAL_RUNNER_TOKEN`で認証し、Slack承認済みジョブだけを返す。公開用Feature FlagがOFFならジョブを返さない。

ただし、リポジトリ内にPlaywright Worker本体は見つからなかった。API契約だけが存在する状態である。

Local AIも同じAPI pollingパターンとmachine token検証を再利用する。ただし、note公開ジョブと添削ジョブは型・保存先・APIを分離し、誤って公開処理へ流れないようにする。

## 11. Feature Flag

現在の既定値:

- 投稿全体: OFF
- X自動投稿: OFF
- note自動公開: OFF
- note下書きのみ: ON
- 有料note確認必須: ON

Local AI用に次を追加する。

```text
MAEMICHI_LOCAL_AI_ENABLED=false
MAEMICHI_LOCAL_AI_PROVIDER=ollama
MAEMICHI_LOCAL_AI_MODEL=
MAEMICHI_LOCAL_AI_JOB_TIMEOUT_SECONDS=300
MAEMICHI_LOCAL_AI_WORKER_TOKEN=
MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD=false
```

有効条件は環境変数と保存済みFeature Flagの両方がONであることとする。未設定、Redisなし、ブランド規則なしのいずれかではfail-closeする。

## 12. 現在の安全上の注意

1. 既存のComposerはブランド規則ファイルが無くても生成できる。
2. 一部のBuffer操作は投稿全体のFeature Flag確認より先に外部APIを呼べる経路がある。
3. 汎用Redis helperはfail-openであり、機密性のあるLocal AIジョブには不適切。
4. Local AI Worker本体と添削ジョブの状態管理は存在しない。
5. ログに原稿本文を出さないための専用logger方針が未整備。
6. 「最初の30投稿は承認必須」を数える仕組みは未実装。

Local AI Editorでは外部公開ボタンを提供せず、採用後もNote事業部の下書きに保存するだけとする。Buffer送信やnote公開への連結は別承認に分離する。

## 13. 既存テストとベースライン

`package.json`:

```text
npm run dev
npm run build
npm run start
npm run test:fund
npm run test:maemichi
```

独立した `lint`、全テスト、E2Eスクリプトはない。

Phase 0実行結果:

- `npm run test:maemichi`: 34/34成功
- `npm run test:fund`: 47/47成功
- `npx tsc --noEmit`: 成功

Local AI実装では、Unit、API Integration、Worker dry-run、Slack payload、状態遷移テストを追加する。外部投稿APIは呼ばない。

## 14. 採用アーキテクチャ

```text
Slack /maemichi edit または既存Composer
  -> Vercel API
  -> ブランド規則をfail-closeで確認
  -> 本人確認済み体験と照合
  -> Redisへ期限付き添削ジョブ
  -> MacのLocal AI Workerが認証付きAPIをpolling
  -> 既存callAI(provider=ollama)
  -> 構造化結果を検証
  -> 数値・URL・固有名詞の不正変更を検知
  -> 結果をRedisへ返す
  -> Slackに前後比較・確認事項・25点評価
  -> 人間が採用・再修正・却下
  -> 採用時もVaultの下書きへ保存するだけ
```

原稿本文や会社情報はログへ出さない。ログにはjob ID、状態、処理時間、エラー種別だけを記録する。

## 15. 段階的な実装計画

### Phase 1: 安全なドメイン基盤

- 型、Feature Flag、ブランド規則loader
- 数値・URL・固有名詞の保持検証
- Redisジョブrepositoryと状態遷移
- Unit test

### Phase 2: Local AI Worker

- 認証付きpolling API
- 既存 `callAI(provider="ollama")` を使うWorker
- dry-run
- offline、timeout、二重claimテスト

### Phase 3: Composer統合

- 「本人原稿を添削」モード
- 入力項目
- 前後比較、確認事項、採点
- 採用・却下履歴

### Phase 4: Slack統合

- `/maemichi edit`
- 入力モーダル
- 結果Block Kit
- 採用、再修正、短縮、note展開、体験保存、却下

### Phase 5: 学習と運用

- 採用表現の傾向を安全に集計
- Worker運用手順
- Integration/E2E dry-run
- lint、typecheck、build、全テスト

各Phaseを別コミットにする。

## 16. Phase 0判定

**判定: 条件付きで実装可能。**

重大な構造不整合はないため、`feature/maemichi-local-ai-editor` ブランチでPhase 1へ進める。

ただし実際のOllama呼び出しは、ユーザーが実PCでデーモン起動とモデル名を確認するまでdry-runに限定する。外部公開、Buffer実送信、note公開は一切行わない。
