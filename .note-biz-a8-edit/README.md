# note-biz

Claude Codeで、note有料記事の調査・執筆・公開記録・週次改善を回すローカル運用システムです。noteへの投稿そのものは、規約リスクを避けるため必ず手動で行います。

## セットアップ

```bash
git clone <repository-url> note-biz
cd note-biz
claude
```

外部APIキーや有料APIはPhase 1では不要です。Claude Code内で次のコマンドを実行します。

```text
/research 営業リスト作成の自動化
/write 営業リスト作成をGASで自動化する方法
/publish drafts/2026-07-18-sales-list-gas.md 500 https://note.com/example/n/example
/weekly
```

## 週次ルーティン

| 時期 | 操作 | 人が行うこと |
|---|---|---|
| 週初め | `/research`を1回 | 次に書くテーマを選ぶ |
| 平日 | `/write`を週2-3回 | 実体験・数値・コードをレビューする |
| 公開時 | noteへ手動コピペ後`/publish` | 価格と公開URLを入力し、Xで告知する |
| 週末 | KPIを入力して`/weekly` | note管理画面のPV・スキ・販売数を反映する |

KPIは`data/kpi.csv`を直接編集するか、`/weekly`実行時に数値を伝えます。`revenue`は原則として`price * sales_count`を入力します。

## ディレクトリ

- `research/`: 市場・競合・需要調査
- `drafts/`: 公開前の記事
- `published/`: 公開済み記事とfrontmatter
- `data/kpi.csv`: 記事別KPI
- `data/affiliate-links.csv`: 提携候補、承認済みURL、CTAの管理
- `templates/`: 記事とX告知文の型
- `scripts/`: 公開記録、週次集計、Ollama接続

## Obsidian連携

現在確認済みの個人用Vaultは次です。

```text
/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用/AI会社/memory/personal
```

既存AI秘書は`memory/personal/note/`を参照します。note-bizは独立リポジトリのまま運用し、必要なMarkdownとKPIだけを下記の同期コマンドでVaultへコピーします。`ai-company`本体のコードは変更しません。

## AI会社Vaultへの同期

note-bizで作成した調査メモ・下書き・公開済み記事・テンプレート・KPIを、AI会社のPersonal OS Memoryへ同期します。

### 実行

```bash
npm run sync:ai-company
```

または

```bash
node scripts/sync-to-ai-company.mjs
```

### 上書きしたい場合

```bash
node scripts/sync-to-ai-company.mjs --overwrite
```

### 同期先

```text
/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用/AI会社/memory/personal/note/
```

環境ごとにVaultの場所が異なる場合は、`AI_COMPANY_VAULT_ROOT`でAI会社Vaultのルートを指定できます。

### 注意

- 通常実行では既存ファイルを上書きせず、同名ファイルをskipします。
- `--overwrite`を付けた場合だけ既存ファイルを更新します。
- noteへの自動投稿はしません。
- AI会社Vaultに同期するのはMarkdownとKPIのみです。
- `README.md`はVaultの`affiliate/note-biz-README.md`へ、アフィリエイトCSVは`affiliate/affiliate-links.csv`へ同期します。
- 同期後はObsidianで内容を確認してください。
- 必要に応じてObsidian Gitでpushしてください。

## Phase 2設計メモ

### 役割分担

- LINE webhookは既存`ai-company`のVercel Functionへ追加し、新規サーバーは作らない。
- LINEメッセージをOllamaで`research`、`write`、`publish`、`weekly`のいずれかへ分類する。
- 市場調査はai-company側のGemini無料枠とGoogle Search Groundingへ委譲し、結果をVault経由で受け取る。
- 既存商材マスタと`data/affiliate-links.csv`を連携し、提携承認済みのA8/Amazonリンクだけを許可する。
- `kpi.csv`をVault経由でAI秘書ダッシュボードに表示する。

### 実地調査で判明した差分（2026-07-18）

- ai-companyのLLMはGemini、Groq、Ollamaの3系統で、申告と一致する。
- Ollamaの現在の既定モデルは`qwen3:8b`。Phase 2要件の`qwen3:14b`へ変更するには、モデル導入と環境変数設定の確認が必要。
- Geminiクライアントは通常の`generateContent`呼び出しで、Google Search Groundingのtool設定は現在見当たらない。Phase 2で追加実装が必要。
- アフィリエイト情報はデータベースではなく`memory/personal/note/affiliates/index.md`の空のMarkdown表。Amazon利用可否を判定する列は未実装。
- ローカルVaultはDropboxの`個人用/AI会社`、本番の保存先はGitHubの`h1maekawa/ai-company-vault`。
- 現行の同期スクリプトは`memory/personal`と`memory/shared`のコピーが中心で、note-biz専用の双方向同期ではない。

### Phase 2着手前の確認事項

1. `qwen3:14b`をM5/32GB環境の標準モデルにするか。
2. Gemini Search Groundingを既存クライアントへ追加するか、調査専用経路に分離するか。
3. 空のMarkdown表を商材マスタとして育てるか、構造化データへ移行するか。
4. Vault同期をコピー方式にするか、Git運用を含むシンボリックリンク方式にするか。

## A8運用ルール

記事は`AI仕事術`、`AIキャリア`、`AI投資メモ`の3カテゴリで管理します。

- A8で提携承認済みのリンクだけを使う。
- 記事冒頭に`※本記事には広告・アフィリエイトリンクが含まれます。`と表示する。
- 無理にリンクを貼らない。
- 銘柄推奨や断定的な収益表現はしない。
- スクール系はメリットだけでなく注意点も書く。
- 読者の課題解決に自然につながる場所にだけCTAを置く。
- A8のログイン情報や個人情報は保存しない。
- 提携前は`affiliate_url`を空欄のままにする。

### カテゴリ別の候補

- `AIキャリア`: 転職エージェント、就活サービス、キャリアコーチング、スクール
- `AI仕事術`: オンライン講座、プログラミングスクール、サーバー、ドメイン、業務ツール
- `AI投資メモ`: 証券口座、NISA、家計簿、FP相談、資産管理

## 禁止事項

- noteへのAPI投稿・ブラウザ自動投稿
- 未承認または管理CSVにないアフィリエイトリンク
- 広告表記の省略
- 実績や一次情報の捏造
