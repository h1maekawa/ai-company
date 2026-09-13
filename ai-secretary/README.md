# AI秘書 MVP（Web版・秘書切替対応）

前川弘行専用 AI秘書システムのWeb UI。Next.js 15 + Ollama + Gemini API のハイブリッド構成。
秘書モードを Personal / Business / **Note Secretary** から切り替え可能。

## 機能

- 🖥️ **Ollama**（ローカル / `qwen3:8b` デフォルト）
- ✨ **Gemini 2.0 Flash**（クラウド / 最新情報対応）
- 🤖 **Auto**（キーワードで自動振り分け）
- 👤 **Personal 秘書**: タスク・健康・習慣化
- 💼 **Business 秘書**: 事業戦略・KPI・意思決定
- 📝 **Note Secretary**: note収益化（高単価アフィリ設計）

## セットアップ

```bash
# 1. 依存インストール
npm install

# 2. 環境変数設定（.env.local）
# OLLAMA_URL=http://localhost:11434
# OLLAMA_MODEL=qwen3:8b
# GEMINI_API_KEY=（Google AI Studioで取得）

# 3. Ollama起動（別ターミナル）
ollama serve
ollama pull qwen3:8b

# 4. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

## 秘書プロンプトの保守

- 各秘書モードのシステムプロンプトは [`app/lib/prompts.ts`](./app/lib/prompts.ts) に定義
- 同じ内容のオリジナル `.md` は `../ai-company/prompts/secretaries/*.md` に存在
- プロンプトを変更する場合は両方を同期更新すること

## 動作確認用クエリ（Note Secretary）

- 「今日の記事を企画して」
- 「楽天証券に合う記事ネタを5つ出して」
- 「新NISAでタイトル案を5つ出して」
- 「今月の投稿計画を立てて」
- 「X用の投稿文を作って」

## Personal AI Company Production

正式なProductionはVercelの `ai-company-ilqd.vercel.app` です。CloudflareはDNS/CDNおよび旧PagesのためのSecondary経路であり、Personal AI Companyのschedulerやmission runtimeを実行しません。

Redisは環境ごとに `dev:`、`preview:<branch>:`、`prod:` の名前空間を使用します。Previewではscheduler、mission mutation、実売上更新、外部actionを停止します。ProductionではUpstash Redisが利用できない場合にローカル保存へfallbackせず、runtime healthを503として返します。

Productionのkill switchは `AUTONOMOUS_RUNTIME_ENABLED`、`REAL_MODEL_CANARY_ENABLED`、`OPPORTUNITY_AUTO_REFRESH_ENABLED`、`ORGANIZATION_REVIEW_ENABLED` です。すべて既定値はfalseです。公開状態は `/api/company/runtime/health` で確認でき、認証Cookieを使った完全な確認は次で実行します。

```bash
APP_BASE_URL=https://ai-company-ilqd.vercel.app \
SMOKE_SESSION_COOKIE='session=...' npm run smoke:production
```
