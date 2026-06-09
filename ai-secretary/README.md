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
