# まえみち Local AI添削 — 運用手順

## できること

本人が書いた大枠・メモ・下書きを、Mac上のOllamaで整えます。

- ブランド規則を読めない場合は開始しません
- 確認済みの体験だけを照合材料にします
- 元文章にない数値・URLを追加した結果は拒否します
- 「残したい表現」が消えた結果は拒否します
- クラウドAIへの自動切り替えは行いません
- 採用後もX・noteの下書き保存で停止します
- Buffer、X、noteへの外部送信はこの機能から実行しません

## 処理の流れ

1. Note事業部またはSlackから原稿を送信
2. Vercel側がブランド規則と確認済み体験を読み込む
3. Upstash Redisへ `pending` ジョブを保存
4. MacのWorkerがジョブを1件だけ取得
5. 既存のAI共通処理からOllamaを呼び出す
6. 数値・URL・保護表現と25点評価を再検査
7. 結果をRedisへ保存しSlackへ比較を通知
8. 人が採用または却下
9. 採用時はNote事業部の投稿キューへ `draft` として保存

Macが停止している間は `pending` のままです。実行中にWorkerが停止したジョブは、
期限切れ後にキューへ戻り、別のWorkerが再取得できます。

## 初回設定

### 1. Ollamaを確認する

Macのターミナルで次を実行します。

```bash
which ollama
ollama --version
ollama list
ollama ps
curl -sS http://127.0.0.1:11434/api/tags
```

`ollama list` に表示されたモデル名を、そのまま
`MAEMICHI_LOCAL_AI_MODEL` に設定してください。モデル名を推測したり、この機能のために
大容量モデルを自動ダウンロードしたりはしません。

### 2. Vercel側に設定する

```dotenv
MAEMICHI_LOCAL_AI_ENABLED=true
MAEMICHI_LOCAL_AI_PROVIDER=ollama
MAEMICHI_LOCAL_AI_JOB_TIMEOUT_SECONDS=300
MAEMICHI_LOCAL_AI_WORKER_TOKEN=<openssl rand -hex 32 で作った値>
MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD=false
MAEMICHI_BRAND_RULES_PATH=memory/personal/note/MAEMICHI_BRAND_POSTING_RULES.md
UPSTASH_REDIS_REST_URL=<設定済みの値>
UPSTASH_REDIS_REST_TOKEN=<設定済みの値>
```

`MAEMICHI_LOCAL_AI_WORKER_TOKEN` は改行・引用符・前後の空白を含めず、
VercelとMacの `.env.local` に同じ値を設定します。Gitへは保存しません。

### 3. Mac側に設定する

`ai-secretary/.env.local` に次を追加します。

```dotenv
APP_BASE_URL=https://ai-company-ilqd.vercel.app
MAEMICHI_LOCAL_AI_PROVIDER=ollama
MAEMICHI_LOCAL_AI_MODEL=<ollama listで確認した名前>
MAEMICHI_LOCAL_AI_WORKER_TOKEN=<Vercelと同じ値>
MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

### 4. 画面側で有効にする

Note事業部 → 自動化設定 →「本人原稿のLocal AI添削」をONにします。

環境変数と画面スイッチの両方がONでなければジョブは作成されません。
X自動投稿、note自動公開、Buffer実送信はOFFのままで構いません。

## Workerの起動

リポジトリの `ai-secretary` で実行します。

```bash
npm run worker:maemichi-local-ai
```

Macが起動している間だけ添削します。終了は `Control + C` です。原稿本文や会社情報を
Workerログへ表示しません。

## Note事業部での使い方

1. Note事業部 →「記事を作る」
2. 「本人原稿を添削」を選択
3. 投稿先、目的、元文章、修正の強さを入力
4. 変更されたくない言葉と、本人確認済みの事実を1行ずつ入力
5. 「MacのLocal AIへ添削を依頼」
6. 添削前後、修正点、確認事項、25点評価を確認
7. 採用、再修正、X短縮、note展開、体験保存、却下から選択

「実体験として保存」は未確認状態で保存します。体験ライブラリで本人確認するまで、
断定的な体験として生成には利用されません。

## Slackでの使い方

```text
/maemichi edit
```

表示された入力画面へ原稿を入れます。完了後、設定済みのSlackチャンネルへ添削前後と
評価が届きます。Slackの採用ボタンも外部公開ではなく下書き保存だけを行います。

状態確認:

```text
/maemichi settings
/maemichi queue
```

## 安全な初期値

- Local AI: OFF
- cloud fallback: OFF
- 投稿全体: OFF
- X自動投稿: OFF
- note自動公開: OFF
- note下書きのみ: ON
- 人間承認: 必須

## 障害時

- 「Local AI添削は停止中」: Vercelの環境変数を確認
- 「画面スイッチがOFF」: Note事業部の自動化設定を確認
- 「ブランド規則」エラー: Vaultの指定パスとMD内容を確認
- `pending` のまま: Mac、Ollama、Workerの起動を確認
- `failed`: Workerの接続、モデル名、Ollamaの応答を確認
- 401: VercelとMacのWorker tokenが完全に一致するか確認

障害時もクラウドAIへ自動送信せず、外部投稿も行いません。
