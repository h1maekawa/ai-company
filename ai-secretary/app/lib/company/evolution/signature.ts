/**
 * Task Signature — v3.1 Phase 3 §4 / §5
 *
 * 「山田様への商談後メールを作って」と「佐藤様への商談後メール作って」を
 * 同じ仕事として数えるための正規化。生文そのものをIDにしない。
 *
 * Phase 3ではLLM分類を必須にしない（§4）。
 * 決定論的な正規化を優先する理由は3つ:
 *   - 同じ入力が常に同じsignatureになる（提案の再現性が保てる）
 *   - コストがかからない（分析のたびにLLMを呼ばない）
 *   - 失敗しても静かに間違えない（分類できなければ other に落ちる）
 *
 * 正規化ルールを将来変えられるよう signatureVersion を持つ（§5）。
 * ルールを変えたらバージョンを上げること。
 * 異なるバージョンのsignatureは同一視しない（古い集計に新ルールを混ぜない）。
 */

import type { CompanyEvent } from "../events";

/** 正規化ルールのバージョン。ルール変更時に必ず上げる */
export const SIGNATURE_VERSION = "v1";

export type TaskSignature = {
  signatureVersion: string;
  /** どの部門の仕事か */
  department: string;
  /** 誰がやったか（AI社員ID または 役割） */
  agent: string;
  /** 何をする仕事か。正規化済みの動詞句 */
  operation: string;
  /** 使ったツール（記録があるもののみ、昇順） */
  tools: string[];
  /** 集計キー。"<department>.<operation>" 形式 */
  normalizedIntent: string;
};

/* ─── 文字列の正規化 ─────────────────────────────── */

/** 人名らしき表現（敬称つき）。固有名詞除去の主対象 */
const HONORIFIC = /[一-龯ぁ-んァ-ヶA-Za-z][一-龯ぁ-んァ-ヶA-Za-z]{0,7}(?:様|さん|氏|君|さま|殿)/g;
/** 会社名らしき表現 */
const COMPANY = /(?:株式会社|有限会社|合同会社)[^\s、。]{0,12}|[^\s、。]{1,12}(?:株式会社|Inc\.|Corp\.)/g;
const URL = /https?:\/\/\S+/g;
const EMAIL = /[\w.+-]+@[\w.-]+\.\w+/g;
const DATE = /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日/g;
const TIME = /\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}時\d{0,2}分?/g;

/**
 * 固有名詞・日付・時刻・URL・数値を落として、仕事の種類だけを残す。
 * 落としすぎると別の仕事が混ざるため、動詞と対象語は残す。
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(URL, " ")
    .replace(EMAIL, " ")
    .replace(DATE, " ")
    .replace(TIME, " ")
    .replace(COMPANY, " ")
    .replace(HONORIFIC, " ")
    .replace(/\d+(?:\.\d+)?/g, " ") // 残った数値
    .replace(/[「」『』（）()［］\[\]【】"'`,、。．・:;|\\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ─── operation の決定 ───────────────────────────── */

/**
 * 正規化済みテキスト → operation。
 *
 * 上から順に評価し、最初に当たったものを採る。
 * 順序が結果を決めるため、変更したら回帰テストで固定すること。
 * どれにも当たらなければ "other"（無理に分類しない）。
 */
const OPERATION_RULES: { operation: string; pattern: RegExp }[] = [
  { operation: "followup_email", pattern: /(商談|打ち合わせ|面談|訪問).*(メール|お礼|フォロー)|フォロー.*メール/ },
  { operation: "email_draft", pattern: /メール.*(作|書|下書き|ドラフト)/ },
  { operation: "publish", pattern: /(投稿|公開|予約|アップ)(して|する|しといて)?/ },
  { operation: "seo", pattern: /(seo|タイトル|見出し|タグ|検索順位)/ },
  { operation: "article_draft", pattern: /(記事|note|原稿|下書き).*(書|作|執筆)|執筆/ },
  { operation: "fact_check", pattern: /(裏取り|ファクト|事実確認|裏付け|検証)/ },
  /*
   * 専門領域のリサーチは、一般の market_research より先に評価する。
   * 「病院の競合調査」は競合調査であると同時に医療領域の仕事であり、
   * market_research に吸われると領域ごとの集計（部署候補の判定）が割れてしまう。
   * 具体的なルールを上に置くこと。
   */
  { operation: "medical_research", pattern: /(医療|病院|クリニック|診療|薬事)/ },
  { operation: "market_research", pattern: /(市況|相場|市場|競合|業界).*(調査|リサーチ|調べ)|市場調査/ },
  { operation: "affiliate_research", pattern: /(a8|アフィリ|案件|単価|報酬).*(調査|探|調べ)|案件/ },
  { operation: "research", pattern: /(調査|リサーチ|調べ|収集|集め)/ },
  { operation: "report", pattern: /(レポート|報告|まとめ|集計)/ },
  { operation: "proposal", pattern: /(提案|企画|プラン|設計)(書|案)?/ },
];

export function detectOperation(normalized: string): string {
  for (const rule of OPERATION_RULES) {
    if (rule.pattern.test(normalized)) return rule.operation;
  }
  return "other";
}

/* ─── Signature の生成 ───────────────────────────── */

/**
 * イベント1件から TaskSignature を作る。
 *
 * Skill が記録されている場合は、文面よりSkill IDを信頼する（§4「既知Skillの利用」）。
 * 人が書いた文面より、実際に呼ばれた処理のほうが仕事の種類を正確に表すため。
 */
export function buildTaskSignature(event: CompanyEvent): TaskSignature {
  const normalized = normalizeText(event.action ?? "");
  const operation = event.skillId ? `skill:${event.skillId}` : detectOperation(normalized);
  const department = event.department || "unassigned";
  const tools = [...new Set(event.tools ?? [])].sort();

  return {
    signatureVersion: SIGNATURE_VERSION,
    department,
    agent: event.actor || "unknown",
    operation,
    tools,
    normalizedIntent: `${department}.${operation}`,
  };
}

/** 集計キー。同じ仕事が同じ文字列になる */
export function signatureKey(signature: TaskSignature): string {
  return `${signature.signatureVersion}|${signature.normalizedIntent}`;
}

/** ツール列も含めたキー。Workflow検出で実行手順の同一性を見るのに使う */
export function signatureKeyWithTools(signature: TaskSignature): string {
  return `${signatureKey(signature)}|${signature.tools.join(">")}`;
}

/** operation が分類できたか。other は反復検出の対象から外す判断に使う */
export function isClassified(signature: TaskSignature): boolean {
  return signature.operation !== "other";
}
