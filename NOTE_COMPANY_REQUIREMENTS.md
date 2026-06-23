# note副業自動化会社 — 要件定義書
> Claude Code 向け実装指示書  
> 対象プロジェクト: `ai-company/ai-secretary`  
> 目的: アフィリ＋有料コンテンツの両軸で、下書きまで自動生成する note 副業 OS を構築する

---

## 既存資産マップ（使えるもの一覧）

| 資産 | パス | 状態 | 今回の扱い |
|---|---|---|---|
| Note事業秘書プロンプト | `departments.ts > personal-note` | ✅ 稼働中 | 拡張する |
| スラッシュコマンド5種 | `/note-research` `/note-title` `/note-outline` `/note-draft` `/note-post-plan` | ✅ 稼働中 | 維持＋追加 |
| 下書き自動生成API | `api/note/generate/route.ts` | ✅ 稼働中 | そのまま活用 |
| Knowledge→note昇格API | `api/note/promote/route.ts` | ✅ 稼働中 | そのまま活用 |
| note/templates（4種） | `memory/note/templates/` | ✅ 存在 | アフィリ用を追加 |
| バズりフック集 | `memory/personal/note/hooks.md` | ✅ 存在 | プロンプトに注入 |
| CTA テンプレート | `memory/personal/note/hooks.md` | ✅ 存在 | プロンプトに注入 |
| 5大発信テーマ定義 | `memory/personal/note/themes.md` | ✅ 存在 | プロンプトに注入 |
| 収益モデル設計書 | `memory/personal/note/monetization.md` | ✅ 存在 | プロンプトに注入 |
| Note事業戦略 brain | `memory/brain/personal/note-business.md` | ✅ 存在 | scopeに追加 |
| morning report | `api/report/morning/route.ts` | ✅ 稼働中 | note KPI欄を追加 |

**新規作成が必要なもの**:
- アフィリエイト案件DB（`memory/personal/note/affiliates/index.md`）
- 月次 KPI トラッカー（`memory/personal/note/kpi.md`）
- note副業専用スコープ設定の拡張
- 新スラッシュコマンド3種
- アフィリ×有料コンテンツ両対応テンプレート2種

---

## 全体設計図

```
ユーザー入力
    ↓
/note-research（トレンド＋アフィリ案件調査）
    ↓
/note-title（バズりタイトル5案 ＋ アフィリ連動度スコア）
    ↓
/note-outline（構成 ＋ CTA・有料パート設計）
    ↓
/note-draft（下書き全文自動生成 ← ここまで自動）
    ↓
[仕上げ・投稿は前川さん自身]
    ↓
/note-post-plan（X告知文 ＋ 投稿スケジュール）
    ↓
/note-kpi（月次パフォーマンス更新）← NEW
```

---

## TASK-01 アフィリエイト案件DBを作成する

### 背景・問題
現状、アフィリエイト案件がどこにも管理されていない。`/note-draft` で書いた記事にどのアフィリリンクを挿入すべきか AI が判断できないため、CTA が汎用的になっている。

### 方針
記事テーマ×アフィリ案件のマッピングテーブルを Markdown で管理し、AI がテーマに応じて最適な案件を自動選択できるようにする。

---

### Step 1: アフィリ案件DBファイルを作成

**対象ファイル（新規作成）:**  
`memory/personal/note/affiliates/index.md`

```markdown
---
type: affiliate_db
updated: 2026-06-23
---

# アフィリエイト案件データベース

## キャリア・転職ジャンル
| 案件名 | 単価目安 | 対象ペルソナ | 自然な挿入文脈 |
|---|---|---|---|
| リクルートエージェント | 高単価 | 転職検討中20〜35歳 | 「キャリア相談の第一歩として」 |
| doda | 高単価 | 転職検討中25〜40歳 | 「求人数最多クラスを無料で確認」 |
| ポテパンキャンプ | 中単価 | エンジニア転職志望 | 「実務ベースで最短転職するなら」 |

## 投資・お金ジャンル
| 案件名 | 単価目安 | 対象ペルソナ | 自然な挿入文脈 |
|---|---|---|---|
| SBI証券 | 高単価 | 投資初心者〜中級 | 「手数料最安クラスで口座開設」 |
| 楽天証券 | 高単価 | ポイント活用したい層 | 「楽天経済圏と相性抜群」 |
| マネーフォワードME | 中単価 | 家計管理したい社会人 | 「資産全体を自動で見える化」 |

## AI・副業ジャンル
| 案件名 | 単価目安 | 対象ペルソナ | 自然な挿入文脈 |
|---|---|---|---|
| ChatGPT Plus | 中単価 | AI活用したいビジネスパーソン | 「月2,000円で生産性が3倍に」 |
| Notion | 低単価 | 情報整理したい知識労働者 | 「思考を外部化するなら」 |
| Udemy | 中単価 | スキルアップしたい会社員 | 「セール時に買うべき講座」 |

## 記事テーマ×推奨案件マッピング
| テーマ | 第1推奨 | 第2推奨 |
|---|---|---|
| 就活・転職 | リクルートエージェント | doda |
| 投資・資産形成 | SBI証券 | 楽天証券 |
| AI活用・副業 | ChatGPT Plus | Udemy |
| キャリア教育 | ポテパンキャンプ | doda |
| 事業構築 | ChatGPT Plus | Notion |
| お金・節約 | マネーフォワードME | SBI証券 |
```

> ⚠️ 実際のアフィリリンク（ASP経由のURL）は前川さんが手動で追記してください。本DBはAIが案件を選ぶためのマッピングテーブルです。

---

### Step 2: scopesにアフィリDBを追加

**対象ファイル:** `app/lib/config/scopes.ts`

```
// Before
  "personal-note": {
    local: [
      "memory/personal/note/",
      "memory/personal/note/ideas/index.md"
    ],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },

// After
  "personal-note": {
    local: [
      "memory/personal/note/",
      "memory/personal/note/ideas/index.md",
      "memory/personal/note/affiliates/index.md",
      "memory/personal/note/kpi.md",
      "memory/brain/personal/note-business.md"
    ],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
```

---

## TASK-02 note KPI トラッカーを作成する

### 背景・問題
投稿数・閲覧数・スキ数・収益がどこにも記録されていない。PDCAを回せず、何が勝ちパターンか判断できない状態。

### 方針
月次 KPI を手動更新するMarkdownファイルを作成し、AIがKPIを参照して戦略アドバイスできるようにする。

---

### Step 1: KPI ファイルを作成

**対象ファイル（新規作成）:**  
`memory/personal/note/kpi.md`

```markdown
---
type: note_kpi
updated: 2026-06-23
---

# Note KPI トラッカー

## 現在の目標
- 月収益目標: 月1万円（Phase1）→ 月30万円（最終）
- 投稿頻度目標: 週5本

## 月次実績

### 2026年6月
| 指標 | 実績 | 目標 |
|---|---|---|
| 投稿本数 | 0 | 20 |
| 総閲覧数 | 0 | 1,000 |
| 総スキ数 | 0 | 100 |
| フォロワー数 | 0 | 50 |
| アフィリ収益 | ¥0 | ¥3,000 |
| 有料note販売数 | 0 | 0 |
| 有料note収益 | ¥0 | ¥0 |
| 月合計収益 | ¥0 | ¥3,000 |

## 勝ちパターン記録
（投稿後にスキ50以上または閲覧500以上を記録した記事を記録する）

| 日付 | タイトル | テーマ | 閲覧数 | スキ数 | アフィリCV |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

## 課題・改善メモ
（毎週末に記録する）
```

---

### Step 2: morning report にnote KPI欄を追加

**対象ファイル:** `app/lib/report/morning.ts`

`// 3. Load Note drafts` のブロックの後に以下を追加する:

```typescript
  // 3c. Load Note KPI
  let noteKpiContent = "";
  try {
    const kpiPath = resolveVaultPath("personal/note/kpi.md");
    if (fs.existsSync(kpiPath)) {
      noteKpiContent = fs.readFileSync(kpiPath, "utf-8");
    }
  } catch (e) {
    console.error("[Morning Engine] Failed to read note kpi.md:", e);
  }
```

また、morning report のプロンプト内の `【note注目】` セクションを以下に差し替える（プロンプト文字列内を str_replace）:

```
// Before
【note注目】
（本日執筆すべきnoteのネタ、企画、またはドラフト調整計画）

// After
【note注目】
- 下書き一覧: ${draftsText}
- KPI状況: ${noteKpiContent ? noteKpiContent.split("\n").slice(0, 10).join("\n") : "未設定"}
（本日執筆すべきnoteのテーマ、投稿本数ペース評価、今週の優先アクション）
```

---

## TASK-03 note秘書プロンプトを強化する

### 背景・問題
現状の `personal-note` 秘書プロンプトはロール定義のみで、アフィリ設計・有料コンテンツ設計・フック・CTAテンプレートなどの知識が注入されていない。毎回汎用的な回答になる。

### 方針
`departments.ts` の `personal-note` プロンプトに、既存の `hooks.md`・`monetization.md`・`themes.md` の内容を静的に埋め込み、常にコンテキストを持った状態にする。

---

### Step 1: personal-note プロンプトを差し替え

**対象ファイル:** `app/lib/config/departments.ts`

```
// Before
        id: "personal-note",
        name: "Note事業秘書",
        role: "Note収益化",
        company: "personal",
        prompt: `あなたはP001「Note収益化事業」を担当する専門秘書です。
前川弘行の目標「月1万→月30万」達成のため、note記事の企画・執筆・マネタイズ戦略を全面サポートします。

## 担当領域
- note記事の企画・トレンド分析・ニーズ発掘
- 記事構成・タイトル設計・SEO最適化
- アフィリエイト案件選定とCV導線設計
- 収益化戦略・ファネル設計

## 行動指針
- AI執筆90% / 手直し10%を推奨
- まず量（毎日投稿）、次に質・CVR改善
- データで判断（スキ数・閲覧数・購入率）

## 利用可能コマンド
/note-research - テーマや市場、読者ペルソナのリサーチと競合分析
/note-title - 読者を惹きつけるタイトル案を5つ提示
/note-outline - 記事の構成案（導入・本論・まとめ・CTA）を計画
/note-draft - 構成案をベースに記事の下書きを詳細に執筆
/note-post-plan - 投稿計画、X告知文の作成、CV導線チェック`,

// After
        id: "personal-note",
        name: "Note事業秘書",
        role: "Note収益化",
        company: "personal",
        prompt: `あなたはP001「Note収益化事業」を担当する専門秘書（personal-note）です。
前川弘行の目標「月1万→月30万」達成のため、note記事の企画・執筆・マネタイズ戦略を全面サポートします。

## ミッション
アフィリエイト収益（Phase1）＋有料コンテンツ販売（Phase2）の両輪で、AIで90%自動生成・本人が10%仕上げるパイプラインを最速で回す。

## 5大発信テーマ（必ずこの軸で企画する）
1. AI会社構築 → キーワード: プロンプト設計・Next.js・業務自動化・AI秘書
2. 投資 → キーワード: 資産形成・個別株・半導体・ポートフォリオ
3. 労働×偉人 → キーワード: 偉人伝・マインドセット・労働観・戦略思考
4. キャリア教育 → キーワード: 自己分析・就活対策・転職・面接
5. 事業構築 → キーワード: MVP・マネタイズ・事業戦略・副業

## 収益モデル（常に両方を設計する）
### A. アフィリエイト（Phase1優先）
- 記事内の自然な文脈でリンクを配置（押し付けにならない）
- テーマ×推奨案件: 就活→エージェント / 投資→証券口座 / AI→ChatGPT Plus
- 目標CV率: 閲覧数の2〜3%

### B. 有料コンテンツ（Phase2）
- 無料記事の末尾に「ここから先の〇〇は有料パートで」と設計
- 有料パートの価値: テンプレート・具体的数値・実例コード・銘柄リスト
- 価格帯: 300〜980円（バラ売り）/ マガジンで束ねて高単価化

## バズりやすい導入フック（必ず3案の中から選ぶ）
- 【損益提示型】「この記事に書かれていることを知らずに、私は〇〇万円の損失を出しました。」
- 【常識破壊型】「〇〇を頑張っている人ほど、実は収益化から遠ざかっています。」
- 【権威性×ギャップ型】「凡人サラリーマンが仕事終わり1時間で〇〇を自動化した決定的な方法」

## CTAテンプレート（必ず記事末尾に1つ挿入する）
- 【無料教材型】「公式LINEでは、本記事の〇〇テンプレートを無料プレゼント中。」
- 【次の記事誘導型】「この戦略の実装方法はこちらの記事で解説しています→【リンク】」
- 【有料ファネル型】「ここから先の具体的な〇〇は有料パートで公開しています。」

## 行動指針
- AI執筆90% / 手直し10%（下書きまで自動、仕上げは前川さん）
- まず量（週5本）、次に質・CVR改善
- 毎週末に kpi.md を更新し、スキ50超の記事パターンを記録する
- 禁止: 精神論・抽象論・モチベーション論

## 利用可能コマンド
/note-research - トレンド＋競合＋アフィリ案件の3点調査
/note-title - バズりタイトル5案（アフィリ連動度スコア付き）
/note-outline - 構成案（有料パート境界線＋CTA設計込み）
/note-draft - 下書き全文自動生成（フック＋アフィリ文脈＋CTA埋め込み済み）
/note-post-plan - 投稿スケジュール＋X告知文3パターン
/note-kpi - 月次KPI確認と次週優先アクション提案
/note-affili - テーマから最適アフィリ案件を選定
/note-paid - 有料コンテンツの切り出し設計`,
```

---

## TASK-04 新スラッシュコマンド3種を追加する

### 追加コマンド
| コマンド | 機能 |
|---|---|
| `/note-kpi` | 現在のKPI確認 ＋ 次週の優先アクション提案 |
| `/note-affili [テーマ]` | テーマから最適アフィリ案件を自動選定 |
| `/note-paid [タイトル]` | 有料パートの切り出し設計（何を無料/有料にするか） |

---

### Step 1: executive router にルーティングルールを追加

**対象ファイル:** `app/lib/router/executive.ts`

```
// Before（ルール8の末尾）
   - /note-research, /note-title, /note-outline, /note-draft, /note-post-plan のいずれかのコマンドが含まれる

// After
   - /note-research, /note-title, /note-outline, /note-draft, /note-post-plan, /note-kpi, /note-affili, /note-paid のいずれかのコマンドが含まれる
```

---

### Step 2: CLAUDE.md にコマンド一覧を追記

**対象ファイル:** `CLAUDE.md`

```
// Before
### 3. Note Department (`personal-note`)
- `/note-research` - テーマや市場、読者ペルソナのリサーチと競合分析
- `/note-title` - 読者を惹きつけるタイトル案を5つ提示
- `/note-outline` - 記事の構成案（導入・本論・まとめ・CTA）を計画
- `/note-draft` - 構成案をベースに記事の下書きを詳細に執筆
- `/note-post-plan` - 投稿計画、X告知文の作成、CV導線チェック

// After
### 3. Note Department (`personal-note`)
- `/note-research` - トレンド＋競合＋アフィリ案件の3点調査
- `/note-title` - バズりタイトル5案（アフィリ連動度スコア付き）
- `/note-outline` - 構成案（有料パート境界線＋CTA設計込み）
- `/note-draft` - 下書き全文自動生成（フック＋アフィリ文脈＋CTA埋め込み済み）
- `/note-post-plan` - 投稿スケジュール＋X告知文3パターン
- `/note-kpi` - 月次KPI確認と次週の優先アクション提案
- `/note-affili [テーマ]` - テーマから最適アフィリ案件を自動選定
- `/note-paid [タイトル]` - 有料コンテンツの切り出し設計
```

---

## TASK-05 アフィリ＆有料コンテンツ対応テンプレートを追加する

### 背景・問題
既存テンプレート4種（finance / sales / career / great-person）は記事構成のみで、アフィリ挿入箇所・有料パート境界線の設計が含まれていない。

---

### Step 1: アフィリエイト特化テンプレートを作成

**対象ファイル（新規作成）:**  
`memory/note/templates/affili-template.md`

```markdown
# [アフィリエイト特化テンプレート]

## 導入（フック）
- バズりフック3パターンのうち1つを選択して書く
- 読者の「あるある悩み」を1〜2文で刺す
- 「この記事でわかること」を3点箇条書き

## 本論（見出し1）: 問題の深掘り
- 読者が今直面している課題を具体的に描写
- データ・数字・実例でリアリティを出す

## 本論（見出し2）: 解決策の提示
- 本記事で紹介するサービス・手法の概要
- ← ここにアフィリリンクを自然な文脈で挿入
- 「実際に私が使っている理由」として書く

## 本論（見出し3）: 使い方・ステップ
- 初心者でも迷わない3〜5ステップ
- スクショや数字で具体性を担保

## まとめ
- 記事全体の要約（3行以内）
- ← アフィリリンクを再挿入（念押し）
- CTA: 「公式LINEでさらに詳しいテンプレートをプレゼント」
```

---

### Step 2: 有料コンテンツ導線テンプレートを作成

**対象ファイル（新規作成）:**  
`memory/note/templates/paid-content-template.md`

```markdown
# [有料コンテンツ導線テンプレート]

## 導入（フック）
- バズりフックで読者の注意を引く
- 「この記事を読み終えると〇〇できる」と価値を明示

## 無料パート（ここは全公開）
### 見出し1: 概念・背景の解説
- 誰でもわかる基本情報を惜しみなく提供

### 見出し2: 全体像のロードマップ
- 「何をすれば目標達成できるか」のステップ全体像を公開
- 詳細は有料パートへの導線として機能させる

---
※ ここから先は有料パートです（300〜980円）
---

## 有料パート（購入者のみ公開）
### 見出し3: 具体的な数値・設定値
- テンプレート・コード・銘柄リスト・パラメータ等
- 「これが欲しくて買った」と言われる価値を詰め込む

### 見出し4: 実例・ケーススタディ
- 自分の実績ベースの数字や事例

## まとめ
- 無料パートの価値を再確認させる
- CTA: 「有料パートで完全版を手に入れる」ボタン誘導
```

---

## TASK-06 `/note-draft` の出力品質を強化する

### 背景・問題
既存の `api/note/generate/route.ts` は構成・テーマを受け取って下書きを生成するが、アフィリ案件・フック・CTAが自動では入らない。

### 方針
`notes.ts` の `generateAndSaveNote()` のシステムプロンプトを拡張し、アフィリ案件DB・フック・CTAテンプレートを参照した出力をデフォルトにする。

---

### Step 1: generateAndSaveNote のシステムプロンプトを強化

**対象ファイル:** `app/lib/memory/notes.ts`

```
// Before
  const systemPrompt = `あなたは高品質なnote記事を執筆するプロフェッショナルな編集者です。
与えられたテーマ、ターゲット、目的、およびCTAに基づいて、読者の心を動かし行動を促す最高のnote記事を作成してください。

以下の記事構成の要件を守ってください：
1. タイトルは魅力的でクリック率（CTR）が高いものにしてください。
2. 導入文（リード文）では読者の悩みに共感し、この記事を読む価値を提示してください。
3. 本文は読みやすい見出し構成（H2, H3）にしてください。
4. まとめには、読者に対する明確な行動喚起（CTA）を含めてください。

${templateContent ? `\n必ず以下の【テンプレート構成】に沿って記事を執筆してください：\n${templateContent}\n` : ""}
`;

// After
  const systemPrompt = `あなたは前川弘行専属のnote記事執筆AIです。
アフィリエイト収益（Phase1）と有料コンテンツ販売（Phase2）の両軸で、読者の行動を引き出す高CVR記事を生成します。

## 必須ルール
1. 導入は以下の3フックパターンから最適なものを選んで書く
   - 【損益提示型】「この記事に書かれていることを知らずに〇〇万円の損失を出しました」
   - 【常識破壊型】「〇〇を頑張っている人ほど、実は収益化から遠ざかっています」
   - 【権威性×ギャップ型】「凡人サラリーマンが仕事終わり1時間で〇〇を自動化した方法」
2. 本文の自然な流れの中にアフィリリンク挿入箇所を【アフィリ挿入: 案件名】と明示する
3. 記事末尾には必ず以下CTAテンプレートのいずれかを使う
   - 「公式LINEでは本記事の〇〇テンプレートを無料プレゼント中」
   - 「この戦略の具体的な実装方法はこちらの記事で解説→【リンク】」
   - 「ここから先の具体的な〇〇は有料パートで公開しています」
4. 見出しはH2・H3を使い、一文を短く（40文字以内）
5. 精神論・抽象論・モチベーション論は一切書かない

${templateContent ? `\n## テンプレート構成（必ず準拠する）\n${templateContent}\n` : ""}
`;
```

---

## 実装順序

```
TASK-01（アフィリDB作成・スコープ追加）
    ↓
TASK-02（KPIトラッカー作成・morning report拡張）
    ↓
TASK-03（note秘書プロンプト強化）
    ↓
TASK-04（新コマンドのルーティング追加）
    ↓
TASK-05（テンプレート2種追加）
    ↓
TASK-06（下書き生成品質強化）
```

TASK-01〜03 は依存関係が強いため順番通りに実施。TASK-04〜06 は並行実施可能。

---

## 変更ファイル一覧

| ファイル | 変更種別 | TASK |
|---|---|---|
| `memory/personal/note/affiliates/index.md` | 新規作成 | 01 |
| `app/lib/config/scopes.ts` | 変更 | 01 |
| `memory/personal/note/kpi.md` | 新規作成 | 02 |
| `app/lib/report/morning.ts` | 変更 | 02 |
| `app/lib/config/departments.ts` | 変更 | 03 |
| `app/lib/router/executive.ts` | 変更 | 04 |
| `CLAUDE.md` | 変更 | 04 |
| `memory/note/templates/affili-template.md` | 新規作成 | 05 |
| `memory/note/templates/paid-content-template.md` | 新規作成 | 05 |
| `app/lib/memory/notes.ts` | 変更 | 06 |

---

## 完了後の動作イメージ

```
前川さん:「転職テーマで記事書きたい」

/note-research
→ 「転職×リクルートエージェントで競合少ない穴場キーワード発見。推奨アフィリ: リクルートエージェント（高単価）」

/note-title
→ 「【体験談】転職エージェントを使い倒して年収100万上げた5つの行動」（アフィリ連動度: ★★★）

/note-draft
→ 導入フック自動選択 + 本文 + 【アフィリ挿入: リクルートエージェント】 + CTA全部入りの下書きが自動生成

[前川さんが10%仕上げて投稿]

毎週末: /note-kpi
→ 「今週3本投稿、閲覧数合計800、スキ12。目標ペースに対して-2本。来週は投稿曜日を火・木・土に固定推奨」
```
