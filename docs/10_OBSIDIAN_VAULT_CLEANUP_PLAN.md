# Obsidian Vault Cleanup Plan

> ファイル名について: ご指定は`docs/09_OBSIDIAN_VAULT_CLEANUP_PLAN.md`でしたが、`09`は前セッションで`09_PHASE3A_PERSONAL_OS_REPORT.md`として既に使用済みのため、番号衝突を避けて`10_OBSIDIAN_VAULT_CLEANUP_PLAN.md`としました。
> 2026-07-11追記: ユーザーから「どれを削除すればいいのか含めて決めてください」と最終判断を委任されたため、下部の「最終判断」を確定版に更新し、実行結果（成功/失敗）を追記しました。実行ログは本ファイル末尾「## 実行結果（2026-07-11）」を参照。

## 目的
Obsidian保管庫を、個人用AI会社と会社用AI会社の2つに整理する。

## 調査範囲についての注意

`ai-company`（コードリポジトリ、Cowork接続済みフォルダ）と、ユーザー指定により今回新たに接続した`Dropbox/maehiro/個人用`は調査できましたが、**`maehiro`フォルダ自体および`Dropbox`ルートは接続範囲外のため直接確認できていません**。この2つについてはユーザーの仮説（広すぎるコンテナフォルダ）をそのまま採用しています。

## 現在確認した保管庫

| 保管庫 | パス | .obsidian有無 | mdファイル数 | 最新更新 | 判断 |
|---|---|---:|---:|---|---|
| **AI会社** | `Dropbox/maehiro/個人用/AI会社` | ○ | 55 | 2026-07-08（chat-log要約）／2026-07-04（fund/positions.md, portfolio.md） | **実運用中の本命Vault** |
| personal-vault | `ai-company/vaults/personal-vault` | ○ | 7 | 2026-06-25（全ファイル同一時刻＝作成時のみ、以降更新なし） | 未使用スキャフォールド |
| crestix-vault | `ai-company/vaults/crestix-vault` | ○ | 10 | 2026-06-25（同上、うち5ファイルが0バイト） | 未使用スキャフォールド |
| holding-vault | `ai-company/vaults/holding-vault` | ○ | 7 | 2026-06-25（同上、ほぼ全ファイル0バイト） | ほぼ完全に未使用 |
| ai-company（リポジトリ全体） | `ai-company/`（repo root） | ○ | 115（ソースコード・docs・ローカルmemory混在） | 直近（本セッションの自動編集による見かけ上の最新であり、Obsidianでの人間の実利用ではない） | リポジトリ全体をVault化してしまっている状態 |
| maehiro | `Dropbox/maehiro` | 未確認（接続範囲外） | - | - | ユーザー仮説採用：広すぎるコンテナ |

**重要な発見**: `AI会社`（Dropbox）は独自の`.git`を持ち、リモートは`git@github.com:h1maekawa/ai-company-vault.git`。これは本番Vercelアプリが`GITHUB_OWNER`/`GITHUB_REPO`環境変数で実際に読み書きしている**GitHub Vaultリポジトリそのもののクローン**です（過去セッションの調査記録と一致）。一方`ai-company/vaults/{personal,crestix,holding}-vault`の3つは独自の`.git`を持たず、コードリポジトリ`ai-company`の一部としてのみ管理されている、いわば「見た目だけのVault」です。

**さらに重要な発見**: `AI会社`（Dropbox）の`memory/`配下には`memory/personal/`のみが存在し、**`memory/company/`が一件も存在しません**。会社側（Crestix / HD Business）の実データは、現状`ai-company`コードリポジトリのローカル`memory/company/`にしか存在せず、GitHub Vaultリポジトリにも`crestix-vault`にも同期された形跡がありません。これは「会社用Vault」を決める上で最も重要な制約です（詳細は次項）。

なお、`Dropbox/maehiro/個人用`直下には`AI会社`とは別に`daily/`, `inbox/`, `knowledge/`, `memory/`, `note/`, `personal/`という緩いフォルダ群があり、`memory/personal/note/affiliates/index.md`・`personal/note/kpi.md`など数ファイルのみ存在します。すべて2026-06-23作成のまま更新されておらず、`.obsidian`もなく、`AI会社`のVaultにも含まれない孤立したスクラッチファイルと判断しました（削除はしていません）。

## 個人用候補の比較

| 候補 | パス | メリット | デメリット | 判断 |
|---|---|---|---|---|
| **AI会社** | `Dropbox/maehiro/個人用/AI会社` | 実運用中（3日前まで更新）／GitHub Vaultリポジトリ(ai-company-vault)そのもの／note・fund・goals・rules等の実データが揃っている／本番アプリの読み書き先と完全に一致 | フォルダ名がコードリポジトリ名「ai-company」と紛らわしい／会社側データがまだない | **推奨: 個人用の正Vaultとして採用** |
| personal-vault | `ai-company/vaults/personal-vault` | シンプルなダッシュボード的体裁 | 実データがほぼ空／2026-06-25以降更新なし／GitHub Vault同期経路と接続されていない | 除外候補 |

## 会社用候補の比較

| 候補 | パス | メリット | デメリット | 判断 |
|---|---|---|---|---|
| crestix-vault | `ai-company/vaults/crestix-vault` | 会社用の名前・体裁は整っている | 中身がほぼ空（10ファイル中5ファイルが0バイト）／2026-06-25以降更新なし／GitHub Vault同期経路に接続されていない | 現状は「会社用の正」にできる状態ではない。**器として整備すれば候補になり得る** |
| （実データを持つ会社用Vault） | — | — | `memory/company/`・`memory/company/hd-business/`の実データは`ai-company`コードリポジトリのローカルにしか存在せず、どのObsidian Vault／GitHub Vaultリポジトリにも同期されていない | **現時点で「これ」と断言できる会社用Vaultは存在しない** |

## 残すべき保管庫

### 個人用AI会社
- 推奨保管庫: **AI会社**（`Dropbox/maehiro/個人用/AI会社`）
- 理由: 本番Vercelアプリが実際に読み書きしているGitHub Vaultリポジトリ（`ai-company-vault`）のローカルクローンであり、直近3日以内まで実データが更新され続けている唯一のVault。note/fund/goals/rulesなど、これまでのPhase1〜3分析で扱ってきたPersonal OSの実データがすべてここに存在する。

### 会社用AI会社
- 推奨保管庫: **現時点で該当なし（要意思決定）**
- 理由: `memory/company/`・`hd-business/`の実データは`ai-company`コードリポジトリのローカルにしか存在せず、GitHub Vaultにも`crestix-vault`にも同期されていない。次の2択のいずれかを選ぶ必要がある。
  1. `AI会社`と同じGitHub Vaultリポジトリ（`ai-company-vault`）内に`memory/company/`を追加し、Obsidianでは同じVault内の別フォルダとして扱う（1つのGitHubリポジトリ＝1つの正、という構成にできる）
  2. `crestix-vault`を正式な会社用Vaultとして育てる（現状は空なので、`memory/company/`の内容を移植する作業が別途必要）

## Obsidian一覧から外してよさそうな保管庫

| 保管庫 | 理由 | 注意点 |
|---|---|---|
| holding-vault | 全ファイルほぼ0バイト、2026-06-25以降更新なし、過去のPhase1調査でもどの秘書からも参照されていないことを確認済み | フォルダ自体は削除しない。一覧から外すだけ |
| personal-vault | 実データがほぼ空で、`AI会社`に実質的に統合済みと判断できる | 一覧から外す前に、`AI会社`にない独自情報がないか一度目視確認を推奨 |
| ai-company（リポジトリ全体） | ソースコード・ドキュメント・ローカル開発用memoryコピーが混在しており、Vaultとして開くと正Vault（AI会社）と紛らわしい | 開発中にmemoryファイルを見たい場合はVaultとしてではなくエディタ／Finderで見る運用に切り替える |
| maehiro | Dropbox内の広い個人名前空間フォルダで、AI会社以外の無関係ファイルも含む可能性が高い | 中身は未確認（接続範囲外）。外す前に一度中身を目視確認すると安全 |

## まだ削除してはいけないフォルダ

| フォルダ | 理由 |
|---|---|
| `Dropbox/maehiro/個人用/AI会社`全体 | 本番Vercelアプリが実際に読み書きしているGitHub Vaultリポジトリのクローン。ここを消すと本番のmemory参照経路の実体が失われる |
| `ai-company/memory/**/*.md`（コードリポジトリのローカルmemory） | 開発時のローカルfallbackとして`vault.ts`が参照する。特に`memory/company/`は、GitHub Vaultにまだ一度も同期されていない**唯一のコピー**のため、絶対に消してはいけない |
| `ai-company/vaults/`配下3フォルダ（personal/crestix/holding-vault） | Obsidian一覧から外すのと、フォルダ自体を消すのは別の操作。今回は一覧から外す判断材料の提示のみ |
| `Dropbox/maehiro/個人用`直下の孤立`memory/`・`personal/`フォルダ | 用途不明の古いスクラッチ（2026-06-23作成、以降未更新）。実害はないが内容未確認のため現段階では削除不可 |

## 次にユーザーがObsidian上で行う操作

1. Obsidianの保管庫一覧を開き、「holding-vault」を一覧から削除する（Remove from list。フォルダ自体は消えない）
2. 「personal-vault」の中身に`AI会社`にない独自メモがないか一度確認したうえで、一覧から削除する
3. 「ai-company」（リポジトリ全体を開いているもの）と「maehiro」を一覧から削除する
4. 「crestix-vault」は会社用Vaultの方針（上記2択）が決まるまで一覧に残しておく
5. 最終的に一覧に「AI会社」（＋方針決定後の会社用Vault）だけが残っている状態を確認する

## 最終削除前の確認事項

- [ ] 正の個人用Vaultが決まっている → **決定: AI会社（Dropbox）**
- [ ] 正の会社用Vaultが決まっている → **未決定。上記2択の意思決定が必要**
- [ ] 必要ファイルが移行済み → personal-vault/crestix-vault/holding-vaultに`AI会社`にない独自データがないか未確認（次フェーズで目視確認を推奨）
- [ ] GitHub / Obsidian同期が確認済み → `AI会社`は`ai-company-vault`リポジトリと同期確認済み。他3 vaultsは独立git管理なし（`ai-company`コードリポジトリの一部）
- [ ] バックアップがある → 今回はフォルダ削除を伴わないため必須ではないが、次フェーズで実際にフォルダを削除する前には必須

---

# 最終判断（確定版・2026-07-11）

ユーザーから「どれを削除すればいいのか含めて決めてください」と意思決定を委任されたため、A/B択を残さず確定した。

```
個人用として残すべきVault: AI会社（Dropbox/maehiro/個人用/AI会社、git remote: ai-company-vault）

会社用として残すべきVault: 同じくAI会社（選択肢Aを採用・統合）
  理由: crestix-vault（選択肢B）はGitHub同期経路を持たず、育てるには
  「独自リポジトリ化 or 手動同期の仕組み構築」という新規コストが発生する。
  一方AI会社は既に本番Vercelアプリの読み書き先そのものであり、
  memory/company/を同じリポジトリに追加するだけで「1リポジトリ＝1正」を維持できる
  （Evolution over Revolution原則にも合致）。
  → memory/company/（13ファイル）をAI会社（Dropbox）側にコピー済み、
    ローカルgitコミット済み（コミットdedc4c2、mainブランチ）。
    ★pushは未実施。ユーザーがgit push、またはObsidian Gitプラグインの同期操作を行う必要あり。

最終的にObsidianの保管庫一覧に残すのは「AI会社」1つのみ。
削除・一覧除外の対象: personal-vault、crestix-vault、holding-vault、
  ai-company（リポジトリ全体をVault化したもの）、maehiro

絶対に削除してはいけないフォルダ:
  - Dropbox/maehiro/個人用/AI会社 全体
  - ai-company/memory/**/*.md（ローカルmemory。特にmemory/company/はコピー元の原本）
```

## 現在の接続状況（2026-07-11時点）

- Claudeが読み書きアクセス可能な範囲: Coworkの接続フォルダのみ。具体的には
  - `ai-company`（コードリポジトリ、常時接続）
  - `Dropbox/maehiro/個人用`（本タスクのため新規に接続。`AI会社`を含む）
  - `maehiro`フォルダ自体・Dropboxルートは未接続・未確認のまま。
- git remote同期が確認できているのは`AI会社`（Dropbox）のみ: `git@github.com:h1maekawa/ai-company-vault.git`。本番Vercelアプリが`GITHUB_OWNER`/`GITHUB_REPO`環境変数で実際に読み書きしているのはこのリポジトリ。
- `ai-company/vaults/{personal,crestix,holding}-vault`の3つは独自gitを持たず、コードリポジトリの一部としてのみ存在（GitHub Vaultとは無関係）。
- `memory/company/`は今回`AI会社`側にコピー＋ローカルコミット（`dedc4c2`）まで完了。**pushは未実施** — 現時点ではまだGitHubリポジトリ本体（＝本番アプリの参照先）には反映されていない。

## 実行結果（2026-07-11）

実施した作業と結果:

1. **`memory/company/`のAI会社（Dropbox）へのコピー** — 成功。13ファイル追加、ローカルgitコミット`dedc4c2`まで完了。push未実施（要ユーザー操作）。
2. **バックアップ作成** — 成功。`ai-company/_backup_before_vault_cleanup_2026-07-11/`に以下を作成・確認済み:
   - `vaults-personal-crestix-holding.tar.gz`（personal-vault/crestix-vault/holding-vault、計42ファイル）
   - `repo-root-dot-obsidian.tar.gz`（リポジトリ直下`.obsidian/`、16ファイル）
3. **`vaults/{personal,crestix,holding}-vault`と repo直下`.obsidian/`の削除** — **失敗**。`rm -rf`を実行したが、対象ファイルほぼ全てで`Operation not permitted`エラーが発生し、削除後に確認したところ全ファイルがそのまま残存していた（`personal-vault`7ファイル、`crestix-vault`10ファイル、`holding-vault`7ファイル、`.obsidian`12ファイル、すべて変化なし）。原因はCoworkのサンドボックス側の保護（接続フォルダ内の既存ファイルはbash経由の削除がブロックされる仕様と判断）。この制約はClaude側では回避できない。

### ユーザーに手動で行っていただく必要がある操作

Claudeはこのサンドボックスから`ai-company`フォルダ内の既存ファイルを削除できないため、以下はFinder上でユーザー自身が行う必要がある（バックアップは上記の通り作成済み）。

1. Finderで`ai-company/vaults/personal-vault`、`ai-company/vaults/crestix-vault`、`ai-company/vaults/holding-vault`、`ai-company/.obsidian`を削除する（万一に備え、`ai-company/_backup_before_vault_cleanup_2026-07-11/`の2つのtar.gzはバックアップとして残しておくことを推奨）。
2. Obsidianアプリの保管庫一覧を開き、「holding-vault」「personal-vault」「crestix-vault」「ai-company」（リポジトリ全体を開いているもの）「maehiro」を一覧から削除する（Remove from list）。最終的に一覧に残るのは「AI会社」のみとなる。
3. `AI会社`（Dropbox）フォルダで`git push`するか、Obsidian Gitプラグインの同期を実行し、コミット`dedc4c2`（`memory/company/`追加）をGitHubの`ai-company-vault`リポジトリに反映する。これを行わないと、本番Vercelアプリはまだ会社側データを参照できない。

---

*本ドキュメントは当初は棚卸しのみを目的としていたが、2026-07-11にユーザーから最終判断の委任を受け、確定判断・実行結果・残タスクを追記した。*
