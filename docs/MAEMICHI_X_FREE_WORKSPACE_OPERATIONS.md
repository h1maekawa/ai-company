# まえみち X無料ワークスペース 操作手順

## 安全方針

この画面はX API、SerpAPI、Buffer、Playwright、スクレイピングを使いません。
X公式の公開ウィジェットとWeb Intentsだけを使用し、投稿確定は本人がX画面で行います。

## 初回設定

VercelとMacの環境変数を次の状態にします。

```dotenv
X_API_ENABLED=false
SERPAPI_ENABLED=false
BUFFER_ENABLED=false
X_OFFICIAL_EMBED_ENABLED=true
X_WEB_INTENTS_ENABLED=true
X_ARCHIVE_IMPORT_ENABLED=true
AI_PROVIDER_ORDER=ollama,gemini
AI_REQUIRE_FREE_TIER=true
AI_ALLOW_PAID_FALLBACK=false
GEMINI_ALLOW_BILLING=false
GEMINI_FREE_MODELS=
```

`GEMINI_FREE_MODELS` はGoogleの現行無料枠を確認し、利用を許可するモデル名だけを
設定します。未設定ならGeminiは使わず、Ollamaまたは保留になります。

Note事業部 → 自動化設定 →「無料Xワークスペース」をONにします。

## 公開タイムラインを見る

1. Note事業部 → Xアカウントで自分のhandleを登録
2. 必要なら参考アカウントへ公開handleを登録
3. Note事業部 → Xワークスペース
4. 右側の選択欄から自分または参考アカウントを選ぶ

非公開、削除済み、X側制限、広告ブロッカー等で表示できない場合は「Xで開く」を使います。
ウィジェット内部のDOMをAIは読み取りません。

## 投稿する

1. 左側へ本人の投稿案を入力
2. 必要なら「Ollamaで本人原稿を添削」へ進む
3. 280文字の事前表示を確認
4. 「Xで投稿画面を開く」
5. X公式画面で内容を確認し、本人が投稿
6. AI Secretaryへ戻り、任意で投稿URLを入力
7. 「本人が投稿済みにする」

Web Intentを開いただけでは投稿済みになりません。

## 手動URLと参考ポイント

個別ポストURLは次の形式だけ受け付けます。

```text
https://x.com/handle/status/123456789
```

他者の本文は自動取得・恒久保存しません。参考理由やフック・構成などのポイントを
本人が入力し、自分の言葉で下書きを作ります。

過去の本人投稿は、本人が確認した本文とURLを左側へ入力して
「過去投稿を手動登録」で保存します。

## Xアーカイブ取込

Xから本人が取得したZIPまたは展開済みフォルダをMacで指定します。
最初は必ずプレビューします。

```bash
cd ai-secretary
npm run import:x-archive -- "/path/to/twitter-archive.zip"
```

件数とサンプルを確認後、保存します。

```bash
npm run import:x-archive -- "/path/to/twitter-archive.zip" --account=maemichi --write
```

- `data/tweets.js` と分割投稿ファイルだけを読む
- DM、連絡先、広告データは読まない
- ZIP path traversalを拒否
- 原本は変更しない
- 重複を除外
- `verifiedByUser=false` で保存し、本人確認前は公開済み事実に使わない

## 課金防止

環境変数にキーが残っていても、以下がfalseなら呼び出しません。

```dotenv
X_API_ENABLED=false
SERPAPI_ENABLED=false
BUFFER_ENABLED=false
```

ブラウザ自動操作フラグはコード側で常にfalseへ戻され、画面から有効化できません。
