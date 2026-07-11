/**
 * Skills Registry — 型定義
 *
 * Phase2 Foundation: この段階では「Skillを実行すること」ではなく
 * 「Skillをコード上で一覧管理し、どのSecretaryがどのSkillを使えるかを明確にすること」を優先する。
 * 実処理（execute）は本フェーズでは実装しない（空のまま登録する）。
 *
 * 既存のDepartment/Secretary定義（app/lib/config/departments.ts）には一切手を入れず、
 * Secretary側からは将来 `skillIds?: string[]` で参照する想定（registry.ts側の
 * getSkillsForSecretary() が department.ts の skillIds と本ファイルの allowedSecretaries の
 * 両方を突き合わせて解決する）。
 */

export type SkillCategory =
  | "format"       // 出力フォーマット整形（Markdownテーブル生成・テンプレ適用等）
  | "calculation"  // 数値計算（KPI逆算・アセットアロケーション計算等）
  | "generation"   // コンテンツ生成（下書き構成・記事本文等、LLM呼び出しを伴うもの）
  | "research"     // 調査・情報収集
  | "external";    // 外部API連携（将来のYouTube/X/Threads等、Phase2では未実装）

/**
 * Skill定義。
 *
 * 実処理を持たせる場合は将来的に `execute?: (input: unknown) => Promise<unknown>` のような
 * オプショナルフィールドを追加する想定だが、Phase2では意図的に含めない
 * （「登録・参照ができる」ことを先に安定させるため）。
 */
export type SkillDefinition = {
  /** 一意なSkill ID。kebab-case。 */
  id: string;
  /** 表示名 */
  name: string;
  /** このSkillが何をするものかの説明 */
  description: string;
  /** 分類 */
  category: SkillCategory;
  /** このSkillを利用できるSecretary IDの一覧（空配列 = 現状どの秘書にも未割当） */
  allowedSecretaries: string[];
  /** 入力として期待するデータの説明（自然言語。厳密なJSON Schemaは将来必要になった時点で追加） */
  inputSchemaDescription: string;
  /** 出力として返すデータの説明（自然言語） */
  outputSchemaDescription: string;
  /**
   * 実装状況。Phase2ではすべて "planned"（未実装）で登録する。
   * 将来実処理を追加したSkillは "implemented" に更新する。
   */
  status: "planned" | "implemented";
};

/**
 * Phase3A: Skill実行基盤の型。
 * executor.ts の executeSkill() がこの形で入出力を受け渡しする。
 * このPhaseではMemoryへの保存は行わない（呼び出し元はMarkdown/outputを受け取るだけ）。
 */
export type SkillExecutionInput = {
  skillId: string;
  secretaryId: string;
  input: Record<string, unknown>;
};

export type SkillExecutionResult = {
  skillId: string;
  secretaryId: string;
  ok: boolean;
  output?: Record<string, unknown>;
  markdown?: string;
  warnings?: string[];
  error?: string;
};
