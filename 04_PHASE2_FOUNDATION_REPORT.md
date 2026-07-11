# Phase2 Foundation 実装レポート

> `01_CURRENT_SYSTEM_ANALYSIS.md` / `02_AI_COMPANY_V2_ARCHITECTURE.md` を前提に実施した
> 「実装前の地ならし」の成果物一覧。既存構造（Department/Secretary ID/API形式/Obsidian/Memory方針）は無変更。

---

## 1. 変更したファイル一覧

| ファイル | 変更内容 |
|---|---|
| `ai-secretary/app/lib/config/departments.ts` | `Secretary`型に`skillIds?: string[]`を追加（オプショナル、コメント付き）。**既存16秘書の定義オブジェクトは1件も変更していない**。 |
| `ai-secretary/app/lib/report/morning.ts` | `fs`/`path`/`resolveVaultPath`によるローカルファイルシステム直読みを全廃し、`vault.ts`の`getVaultFile`/`listVaultDirectory`経由に置き換え。関数シグネチャ・戻り値（Markdown文字列）・入力データの構成は不変。 |

## 2. 作成したファイル一覧

| ファイル | 内容 |
|---|---|
| `ai-secretary/app/lib/skills/types.ts` | `SkillDefinition`型・`SkillCategory`型の定義 |
| `ai-secretary/app/lib/skills/registry.ts` | `SKILL_REGISTRY`配列（5件登録、すべて`status: "planned"`＝未実装）と`getSkillById`/`getSkillsForSecretary`/`listSkills`/`getSkillsByCategory`ヘルパー |
| `ai-secretary/app/lib/skills/index.ts` | 上記のbarrel export |
| `ai-secretary/app/api/skills/route.ts` | `GET /api/skills`（読み取り専用、認証あり） |
| `docs/03_MEMORY_MANIFEST.md` | Secretary別Memory参照台帳＋Memory棚卸し（ルート直下にも同内容を`03_MEMORY_MANIFEST.md`として配置済み。既存の`00`〜`02`と並べて参照できるようにするため） |
| `04_PHASE2_FOUNDATION_REPORT.md`（本ファイル） | 本レポート |

**Memory（`memory/**/*.md`）ディレクトリへの削除・移動・新規Vault作成は一切行っていない。**

---

## 3. Memory Manifestの内容（要約）

詳細は`docs/03_MEMORY_MANIFEST.md`参照。正とする参照元は`scopes.ts`。主な発見:

- **`personal-morning`は「チャット対話」と「`/api/report/morning`」でMemory取得経路が完全に別だった**（前者は`scopes.ts`経由、後者は独自のfs直読み＝今回修正した箇所）。
- `personal-note`のスコープにある`memory/personal/note/affiliates/index.md`・`kpi.md`は**現物が存在しない**。ディレクトリ指定（`memory/personal/note/`）により`hooks.md`・`themes.md`・`monetization.md`等は実際には再帰的に読み込まれている。
- `memory/note/`（トップレベル）と`memory/crestix/`は、**どのSecretaryスコープからも参照されていない孤立ディレクトリ**であることを確認（内容は棚卸しのみ、削除はしていない）。
- `company-ceo`は`strategy/index.md`のみ、`company-system`は`strategy.md`のみを読んでおり、2つの戦略ファイルを2秘書で分けて参照している非対称構造を確認。
- HD Business系5秘書（`hd-kpi-manager`等）はスコープとファイル実在の整合性が最も高く、問題なし。

---

## 4. Skill Registryの内容

`ai-secretary/app/lib/skills/registry.ts`に5件登録（すべて実処理なし＝`status: "planned"`）。

| Skill ID | カテゴリ | 利用可能Secretary | 概要 |
|---|---|---|---|
| `note-draft-format` | format | `personal-note` | note下書きの構成整形（フック・アフィリ挿入箇所・CTA） |
| `fund-log-format` | format | `personal-fund` | 投資判断ログのMarkdown整形 |
| `hd-kpi-calculation` | calculation | `hd-kpi-manager` | 売上目標からのFlow KPI逆算計算 |
| `precheck-memo-format` | format | `hd-closing-manager` | クロージング前の前確メモ整形 |
| `morning-report-compose` | generation | `personal-morning` | 朝会レポートの横断集約・構成（将来`report/morning.ts`から切り出す候補） |

`GET /api/skills`で`id`/`name`/`category`/`allowedSecretaries`を返す（認証はほかのAPIと同じ`verifyApiSecret`）。

---

## 5. Morning Reportの修正内容

**Before**: `fs.existsSync` + `fs.readFileSync` + `resolveVaultPath`（`VAULT_ROOT`＝ローカルDropboxパス）で`positions.md`・note下書き一覧・`note/kpi.md`・`hd-business/kpi.md`・`hd-business/pipeline.md`・`goals.md`を直読み。Vercel本番ではこのパスが存在せず、全項目が空データになっていた可能性が高い。

**After**: `vault.ts`の`getVaultFile()`/`listVaultDirectory()`経由に統一。これは他のAPI（`/api/chat`, `/api/fund/*`, `/api/note/*`）と同じ抽象化で、**GitHub Contents API（本番）とローカルfs（開発時のみの自動フォールバック）を`vault.ts`内部で自動判定**する。ファイルが存在しない場合は例外を投げず空文字列/空配列を返す（`safeGetFile`/`safeListDirectory`ヘルパーで吸収）。既存の`generateMorningReport()`の戻り値（Markdown文字列）・`/api/report/morning`のレスポンス形式は変更していない。

---

## 6. 既存API互換の維持確認

| API | 変更 | 互換性 |
|---|---|---|
| `POST /api/chat` | なし | ✅ 維持 |
| `GET /api/report/morning` | 内部実装（`morning.ts`）のみ変更、レスポンス形式（`{success, report}`）は不変 | ✅ 維持 |
| `POST /api/fund/log` | なし | ✅ 維持 |
| `GET /api/fund/report` | なし | ✅ 維持 |
| `POST /api/note/generate` | なし | ✅ 維持 |
| `POST /api/note/promote` | なし | ✅ 維持 |
| `POST /api/knowledge/save` | なし | ✅ 維持 |
| `GET /api/skills`（新規） | 追加 | 読み取り専用、既存APIには影響なし |

Department/Secretary IDは1件も変更していない（`departments.ts`の型定義に1フィールド追加したのみ）。

---

## 7. ビルド確認

- `npx tsc --noEmit`: **エラー0件で完了**（新規ファイル・変更ファイルすべて型チェック済み）。
- `npm run build`（Next.js本ビルド）: 本セッションのサンドボックス環境ではプロセスが45秒の実行上限内に完了せず、フルビルドの完了確認までは至らなかった（既存の`.next/`ビルドキャッシュから見て、通常はビルド自体は成立する環境）。型チェックが通っていること、変更が既存の型・関数シグネチャ・レスポンス形式を壊していないことから実害は低いと判断するが、**最終確認として、ローカルまたはVercelのデプロイビルドで`npm run build`の完走を確認することを推奨**。

---

## 8. やらなかったこと（確認）

Media Room新設、YouTube/X/Threads/Podcast連携、外部API連携、既存Memoryの削除、既存Directoryの大幅変更、既存Promptの全面リライト、UIの大規模改修、新Vault、新DB — **いずれも実施していない**。

---

## 9. 次に実装すべきPhase3の提案

Phase2で「土台」ができたので、Phase3以降は以下の順で安全に積み増せる:

1. **`personal-morning`のMemory取得経路の一本化**: 今回`report/morning.ts`は修正したが、チャット対話時（`scopes.ts`経由）とレポートAPI時（`vault.ts`直接呼び出し）で経路のコード自体は依然として2種類残っている。将来的に`morning-report-compose` Skillへ処理を切り出せば、どちらの入口からでも同じロジックを通せる。
2. **Skill実処理の第一弾実装**: `hd-kpi-calculation`（売上目標からの逆算は純粋な算術で、LLMに頼らず確定値を出せる＝最もROIが高い）から着手するのが妥当。次点で`fund-log-format`（`/api/fund/log`が今書いているMarkdown整形ロジックをSkillへ移すだけで済み、リスクが低い）。
3. **`memory/personal/note/affiliates/index.md`・`kpi.md`の実ファイル作成**: `note-draft-format` Skillを実装するタイミングで一緒に用意すると、Note Departmentの実力が素直に上がる。
4. **`skillIds`の実際の付与**: 上記Skillが1つでも`status: "implemented"`になった段階で、対応する秘書定義（例: `hd-kpi-manager`）に`skillIds: ["hd-kpi-calculation"]`を付与する。既存秘書定義への初めての変更になるため、1件ずつ検証しながら進める。
5. **Memory棚卸し結果への対応判断**: `memory/note/`・`memory/crestix/`の扱い（残す/退避）は今回判断を保留した。Phase3以降、実際にMedia Platform化（Room新設）に着手するタイミングで改めて要否を判断するのが自然。

---

*本レポートはPhase2 Foundationの最終成果物。次セッションはこのレポートとdocs/03_MEMORY_MANIFEST.mdを起点に進める想定。*
