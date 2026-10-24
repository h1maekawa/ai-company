# 就活ラボ実装結果 — 2026-10-22

Draft PR: https://github.com/h1maekawa/ai-company/pull/181

## 要件と実装の境界

- 対象: `feat/career-sns-draft-workflow`。開始時の `origin/main` は `c67699b`、既存就活SNS実装は `76b35eb` と `8dfcc18`。ほかの作業worktreeは検出されなかった。
- `agent-input/shukatsu-lab/IMPLEMENTATION_BRIEF.md` と `index.html` は Downloads の原本を確認して配置した。指定された `TERMINAL_AGENT_REQUIREMENTS.md` はワークスペースと Downloads に存在せず、内容は未確認。追加要件が届いたら差分を再評価する。
- `AI_COMPANY_MASTER.md` は就活事業を現行優先順位の外に置く。今回の着手はユーザーの明示的な最優先指示に基づく。共通Research、Performance、Revenue、Learning、Executionの新しい真実ストアは追加していない。

## 変更点

- `/career-lab` に提供されたLPの構成と文言をNext.jsへ移植。スマートフォン幅、キーボードフォーカス、見出し構造、説明文、OG用SVGを用意した。仮称のため検索インデックスは明示的に無効。
- Instagram/XのCTAは `CAREER_LAB_INSTAGRAM_URL` / `CAREER_LAB_X_URL` で設定する。HTTPS、許可ドメイン、単一アカウントパスを検証し、未設定・不正値は「準備中」。`CAREER_LAB_BASE_URL` が有効なHTTPS originならOG画像の絶対URLを出す。設定値の更新にはビルドが必要。
- TikTokプロフィールに置くLP URLは公開後に担当者が設定する。推奨の入口は `/career-lab?utm_source=tiktok&utm_medium=profile&utm_campaign=career_lab_launch`。LPはクエリを収集・保存せず、外部CTAへ転送しない。CTR、プロフィール閲覧、フォロー増は現時点で `UNAVAILABLE`。
- 既存の非公開就活SNSワークフローはX/Instagram各7本、Instagram各5枚のHTML/CSSプレビューを生成する。外部投稿は行わない。`store.ts` の欠けていた `randomUUID` importを修正した。

## 検証

| 実行 | 結果 |
|---|---|
| `npm run test:career` | 5件成功。下書き生成、匿名性、入力境界、HTMLエスケープ、CTA URLを確認 |
| `npm run typecheck` | 成功 |
| `npm run build` | 成功。`/career-lab` を静的ルートとして生成。既存の複数lockfile警告は残存 |
| `npm test` | 成功。既存スイートにCareerテストを明示的に追加。最終工程は223件成功・0件失敗 |

実ブラウザでのスマートフォン表示・OGクローラ表示・SNS遷移は未検証。実アカウントURL、公開ドメイン、計測プロバイダーが未確定のため、実測値は主張しない。

## 承認待ちと再開手順

1. `proxy.ts` はEngineering Workerの保護対象。現状 `/career-lab` は未認証訪問者を `/login` に転送する。公開LPとして使うには、この保護境界の変更を別途人間がレビュー・承認する必要がある。認証例外を本PRで追加していない。
2. 正式なブランド名、Instagram/Xの実アカウントURL、公開ドメインを担当者が確認する。設定後、プレビュー上のリンク先とOGカードを再検証する。
3. `TERMINAL_AGENT_REQUIREMENTS.md` を配置して、今回の実装と差分を照合する。
4. HTML/CSSカルーセルはプレビューまで。SNSにアップロード可能なPNG書き出し、投稿QAの独立評価、公開アダプター、実測Performance連携は次段階。公開は人間ゲートを経る。

## 実行上限と外部作用

この作業では外部AI、検索、画像生成、SNS、DB書き込みの実行予算を0回に設定した。依存インストールは1回、実装修正サイクルは3回（上限3回）。本番デプロイ、SNS公開、mainマージ、Production DB書き込みは実行していない。費用の実測は提供されていないため `UNAVAILABLE`。
