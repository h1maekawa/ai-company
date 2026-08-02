# まえみち Xワークスペース 現状レビュー

作成日: 2026-08-03  
対象: `h1maekawa/ai-company/ai-secretary`  
基点: `feature/maemichi-local-ai-editor` (`ffaf594`)

## 結論

既存のNote事業部を壊さず、「Xワークスペース」タブを追加できる。本人アカウント
`XAccount` と参考アカウント `ReferenceXAccount` は既に分離されている。Vault保存、
Local AI Worker、ブランド規則、投稿ドラフトも再利用できる。

ただし現状のXリサーチは、freeモードでもSerpAPI、official-apiモードではX APIを呼ぶ。
既存機能は削除せず、本ワークスペース専用Feature Flagと無料モードガードで完全に分離する。
Bufferも既存投稿キューから任意利用できるが、新ワークスペースからは呼び出さない。

## 現行コンポーネント

- `XAccounts.tsx`: 本人が運用する複数アカウント。handle、ジャンル、役割、導線を保持。
- `ReferenceAccounts.tsx`: 外部の参考Xアカウントとnoteクリエイター。本人とは別型。
- `ResearchPanel.tsx`: 収集済み候補からX・noteを生成。公式埋め込みはない。
- Note事業部 `page.tsx`: タブ式。新部署を作らずタブ追加可能。
- CSP: 明示設定なし。X公式script/frameだけを許可する最小ヘッダー追加が必要。

## X取得・投稿

- `sources/x.ts`
  - free: `SERPAPI_KEY`があればGoogle検索経由でX URLを収集。
  - official-api: `X_API_BEARER_TOKEN`でX API v2を呼ぶ。
  - `manualXItem`: 人が貼ったURLと本文だけを最小抜粋として保存。
- `SocialDraft`: draft/approved/queued/scheduled/published等を持つ。
- Buffer GraphQL連携と自動化が存在するが初期OFF。
- X Web Intents、publish.x.com oEmbed、widgets.jsは未実装。
- Xアーカイブ取込は未実装。

## AI Provider

- 共通 `callAI` は gemini/groq/ollama/auto。
- 現行autoはGemini→Groq→ローカルOllamaの順で、今回の無料優先要件と逆。
- `LocalAiEditor` はRedisジョブをMac Workerがpollし、Ollama専用で処理する。
- VercelからlocalhostのOllamaへは接続しない設計済み。
- Geminiはモデル名を環境変数から取得するが、無料枠判定・利用回数表示はない。
- 「フラプター」に該当するProviderは見つからない。推測で追加しない。
- Groqは既存Providerだが、有料fallback禁止のため新ワークスペースの自動fallbackには使わない。

## Feature Flag

既存:

- `localAiEditorEnabled=false`
- `publishingEnabled=false`
- `xAutoPublish=false`
- `noteAutoPublish=false`
- `noteDraftOnly=true`

追加が必要:

- `xFreeWorkspaceEnabled=false`
- `xOfficialEmbedEnabled=true`
- `xWebIntentsEnabled=true`
- `xManualPostImportEnabled=true`
- `xArchiveImportEnabled=false`
- `xPaidApiEnabled=false`
- `xBrowserAutomationEnabled=false`（固定・変更不可）

## 保存方針

既存のVaultストア形式（人間可読Markdown＋JSON）を再利用し、次を追加する。

- 本人投稿履歴 `OwnedXPost`
- 参考ポイント `XReferenceNote`

外部投稿全文は恒久保存せず、ユーザー入力の短い抜粋と抽象化ポイントだけを保存する。
X APIやタイムラインDOMから本文を自動取得しない。

## 採用アーキテクチャ

1. X公式widgets.jsで公開プロフィールタイムラインを表示。
2. 個別URLは `x.com/{handle}/status/{id}` のみ受理し、publish.x.com/oEmbedをサーバー経由で取得。
3. oEmbed HTMLは許可要素・属性・X公式URLへ限定してサニタイズ。
4. 投稿・返信・いいね・リポスト・フォローはWeb Intentを別窓で開く。
5. 投稿完了は自動判定せず、本人が最終本文・URLを登録して確定。
6. AI処理は既存Local AI Workerを第一優先。Geminiは明示選択かOllama停止時かつ無料ガードONのみ。
7. XアーカイブはMacローカルで解析し、DM・連絡先・広告を読まない。

## リスクと対策

- X公式ウィジェットがCookie制限・広告ブロッカー・非公開アカウントで表示されない:
  Xで開くフォールバックを常設。
- oEmbed HTMLのXSS: 任意HTMLを保存せず、X URL検証とallow-list sanitizerを通す。
- 文字数: Unicodeコードポイントで事前表示するが、X側のURL短縮等による最終判定はX画面に委ねる。
- Web Intent後の成否: 自動成功扱いにしない。
- 課金: 新ワークスペースからX API、SerpAPI、Bufferのコードをimportしない。テストで固定。
- アーカイブ: 入力サイズ上限、許可ファイル名、展開済みフォルダ優先。ZIPは安全なシステム展開コマンドで
  一覧検査後に一時領域へ展開し、原本を変更しない。

## Phase 0受入結果

重大なアーキテクチャ不整合はない。既存Local AI WorkerとVaultストアを拡張し、
指定Phase順に実装可能。
