import { SkillDefinition } from "./types";

/**
 * Skill Registry — 登録済みSkillの一覧。
 *
 * Phase2 Foundationでは「登録・参照ができる」ことを優先し、実処理は空のまま登録した。
 * Phase3A（Personal OS Skill移植・実行基盤）で、cc-secretary/cc-companyの操作一覧を参考に
 * Personal OS用Skillを整理し、5件（personal-capture/personal-todo-add/personal-today-show/
 * note-draft-format/fund-log-format）に実処理を追加した（executor.ts参照）。
 *
 * 新しいSkillを追加する場合はこの配列に1エントリ追加するだけでよい。
 * 既存のDepartment/Secretary定義（config/departments.ts）は一切変更不要。
 */
export const SKILL_REGISTRY: SkillDefinition[] = [
  // ─── Personal OS: 本Phaseで実処理を追加した5件 ─────────────────────
  {
    id: "personal-capture",
    name: "Personal Capture",
    description:
      "雑多な入力をInboxに保存しやすいMarkdown形式へ整形する。cc-secretaryの「メモ [内容] / capture [text]」を参考にした最小キャプチャ整形。",
    category: "format",
    allowedSecretaries: ["personal-ceo", "personal-morning", "executive-assistant"],
    inputSchemaDescription: "content（本文）・source（任意、発生元）・tags（任意、タグ配列）",
    outputSchemaDescription: "Date/Source/Tags＋内容を持つInbox Capture形式のMarkdown",
    status: "implemented",
  },
  {
    id: "personal-todo-add",
    name: "Personal Todo Add",
    description:
      "cc-secretaryの「タスク追加 [内容]」を参考に、今日のTODOに追記しやすいMarkdownタスク行を生成する。",
    category: "format",
    allowedSecretaries: ["personal-ceo", "personal-morning", "executive-assistant"],
    inputSchemaDescription: "task（内容）・priority（high/normal/low、任意）・dueDate（任意）・memo（任意）",
    outputSchemaDescription: "`- [ ] タスク`形式のMarkdownタスク行（Priority/Due/Memo付き）",
    status: "implemented",
  },
  {
    id: "personal-today-show",
    name: "Personal Today Show",
    description:
      "cc-secretaryの「今日のタスク」を参考にした表示枠生成。このPhaseではMemory読み込みは行わず、枠のみを返す。",
    category: "format",
    allowedSecretaries: ["personal-morning", "personal-ceo"],
    inputSchemaDescription: "date（任意、省略時は当日）",
    outputSchemaDescription: "最優先／通常／余裕があれば／完了の4セクションを持つ「今日のタスク」Markdown枠",
    status: "implemented",
  },
  {
    id: "note-draft-format",
    name: "Note Draft Format",
    description:
      "noteのアイデアや話した内容を、下書きとして扱いやすいMarkdown構成メモへ整形する。/api/note/generate（LLMによる本文自動生成）とは別物の軽量フォーマッタ。",
    category: "format",
    allowedSecretaries: ["personal-note", "personal-ceo", "personal-morning"],
    inputSchemaDescription:
      "title・theme・targetReader・hook（冒頭フック）・bodyMemo・cta・paidPartIdea",
    outputSchemaDescription:
      "タイトル／テーマ／想定読者／冒頭フック／本文メモ／CTA／有料パート案／次に追記することを持つMarkdown",
    status: "implemented",
  },
  {
    id: "fund-log-format",
    name: "Fund Log Format",
    description:
      "投資判断を投資判断ログとして保存しやすいMarkdownへ整形する。既存 /api/fund/log のMarkdown形式（テーブル・絵文字ラベル）とは別の簡潔フォーマットで、このPhaseでは統合しない。",
    category: "format",
    allowedSecretaries: ["personal-fund", "personal-finance", "personal-morning"],
    inputSchemaDescription:
      "ticker・companyName・action・decisionScore・reason・risk・timeHorizon・positionSize・memo",
    outputSchemaDescription: "基本情報（Ticker/Company/Action/Decision Score等）＋判断理由＋リスク＋メモを持つMarkdown",
    status: "implemented",
  },

  // ─── Personal OS: Registry登録のみ（次Phase以降で実処理化） ─────────
  {
    id: "personal-idea-create",
    name: "Personal Idea Create",
    description:
      "cc-secretaryの「アイデア [タイトル]」を参考に、新規アイデアファイル（memory/personal/ideas/）を作成する。",
    category: "generation",
    allowedSecretaries: ["personal-note"],
    inputSchemaDescription: "title・概要・課題背景（任意）",
    outputSchemaDescription: "アイデアテンプレート形式のMarkdown（概要/課題・背景/解決策/ネクストステップ）",
    status: "planned",
  },
  {
    id: "personal-research-create",
    name: "Personal Research Create",
    description:
      "cc-secretaryの「調査 [タイトル]」を参考に、新規リサーチファイル（memory/personal/research/）を作成する。",
    category: "research",
    allowedSecretaries: ["personal-note"],
    inputSchemaDescription: "title・目的（任意）",
    outputSchemaDescription: "リサーチテンプレート形式のMarkdown（目的/調査内容/結論/参考リンク）",
    status: "planned",
  },
  {
    id: "personal-knowledge-save",
    name: "Personal Knowledge Save",
    description:
      "cc-secretaryのナレッジ記録を参考に、恒久的な参照ノート（memory/personal/knowledge/）を作成する。",
    category: "format",
    allowedSecretaries: ["personal-note"],
    inputSchemaDescription: "topic・ポイント（任意）・詳細（任意）",
    outputSchemaDescription: "ナレッジテンプレート形式のMarkdown（ポイント/詳細/参考リンク/メモ）",
    status: "planned",
  },
  {
    id: "personal-weekly-review",
    name: "Personal Weekly Review",
    description:
      "cc-secretaryの「週次レビュー」を参考に、今週のdailyファイルから完了/未完了タスクを収集してレビューファイルを生成する。Memory読み込みが前提のため、次Phase（保存機能）と合わせて実装する。",
    category: "generation",
    allowedSecretaries: [],
    inputSchemaDescription: "対象週（任意、省略時は今週）",
    outputSchemaDescription: "週次レビューテンプレート形式のMarkdown（完了タスク/うまくいったこと/改善点/来週の目標/持ち越し）",
    status: "planned",
  },
  {
    id: "personal-dashboard",
    name: "Personal Dashboard",
    description:
      "cc-secretaryの「ダッシュボード」を参考に、Personal OS全カテゴリの件数・最近のアクティビティを集計表示する。Memory読み込みが前提のため次Phase以降で実装する。",
    category: "generation",
    allowedSecretaries: [],
    inputSchemaDescription: "なし（全カテゴリを走査）",
    outputSchemaDescription: "カテゴリ別件数・最終レビュー日等のサマリーMarkdown",
    status: "planned",
  },
  {
    id: "personal-inbox-organize",
    name: "Personal Inbox Organize",
    description:
      "cc-secretaryの「受信箱整理」を参考に、Inbox項目を読み込み適切なカテゴリへの振り分けを提案する。Memory読み込み・書き込みの両方が前提のため次Phase以降で実装する。",
    category: "generation",
    allowedSecretaries: [],
    inputSchemaDescription: "対象日または未整理Inbox全件",
    outputSchemaDescription: "振り分け提案リスト（項目→推奨カテゴリ、理由付き）",
    status: "planned",
  },
  {
    id: "morning-report-compose",
    name: "Morning Report Compose",
    description:
      "Inbox・タスク・投資ポジション・note下書き・HD Business KPIを横断集約し、朝会レポートの各セクションを構成する。現状は report/morning.ts 内にロジックが直書きされているが、将来的にSkillとして切り出す候補。",
    category: "generation",
    allowedSecretaries: ["personal-morning"],
    inputSchemaDescription:
      "ContextBusのInbox/タスク一覧、fund/positions.md、note下書き一覧、note/kpi.md、hd-business/kpi.md・pipeline.md、goals.md",
    outputSchemaDescription:
      "朝会レポートMarkdown（今日やること/最重要/止まっていること/投資注目/note注目/HD営業進捗/売上最大行動）",
    status: "planned",
  },

  // ─── HD Business（Phase2 Foundationから継続。今回のPersonal OS拡張の対象外） ──
  {
    id: "hd-kpi-calculation",
    name: "HD KPI Calculation",
    description:
      "売上目標から受注数・商談数・アポ数・架電数を逆算するFlow KPI計算（受注目標=売上目標÷平均単価 等の実計算）。現状はhd-kpi-manager秘書のprompt内でLLMに計算式を提示しているのみで、確定値の実計算は行っていない。",
    category: "calculation",
    allowedSecretaries: ["hd-kpi-manager"],
    inputSchemaDescription:
      "売上目標・平均単価・各転換率（受注率/商談率/アポ率）、または /hd-sim の変数指定",
    outputSchemaDescription:
      "必要受注数・必要商談数・必要アポ数・必要架電数の逆算結果（数値）",
    status: "planned",
  },
  {
    id: "precheck-memo-format",
    name: "Precheck Memo Format",
    description:
      "クロージング前の案件（高確度案件A/S）について、確度・商材別リードタイム・懸念事項を整理した前確メモを定型フォーマットで生成する。",
    category: "format",
    allowedSecretaries: ["hd-closing-manager"],
    inputSchemaDescription: "案件名・確度ランク・商談内容・懸念点・希望クロージング期日",
    outputSchemaDescription: "前確メモMarkdown（案件概要・確度根拠・リスク・次アクション）",
    status: "planned",
  },
];

/**
 * IDからSkillを取得する。
 */
export function getSkillById(skillId: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.id === skillId);
}

/**
 * 指定したSecretaryが利用できるSkillの一覧を返す。
 *
 * SkillDefinition.allowedSecretaries が正の情報源。
 * departments.ts の Secretary.skillIds は「その秘書が使う想定のSkill一覧」を人間が読むための
 * 宣言であり、実行時の許可判定は本関数（＝allowedSecretaries）が行う。
 */
export function getSkillsForSecretary(secretaryId: string): SkillDefinition[] {
  return SKILL_REGISTRY.filter((s) => s.allowedSecretaries.includes(secretaryId));
}

/**
 * 全Skillの一覧を返す（/api/skills 用）。
 */
export function listSkills(): SkillDefinition[] {
  return SKILL_REGISTRY;
}

/**
 * カテゴリでフィルタしたSkill一覧を返す。
 */
export function getSkillsByCategory(category: SkillDefinition["category"]): SkillDefinition[] {
  return SKILL_REGISTRY.filter((s) => s.category === category);
}
