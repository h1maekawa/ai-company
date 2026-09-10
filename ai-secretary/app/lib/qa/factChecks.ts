/**
 * ファクトチェックの自動化 — 要件9「数値を含む記述の参照元突合」
 *
 * 投資系コンテンツで一番危ないのは「AIが数値を作ってしまう」こと。
 * そこで本文から数値を抜き出し、参照元（リサーチ抜粋・保有ポートフォリオ）に
 * 同じ数値が存在するかを機械的に突き合わせる。
 *
 * 判定の考え方:
 *   - 参照元に無い数値 = 出所不明。人間確認へ回す（blocking）
 *   - ただし一般的すぎる数値（年号・1桁・順序を表す数など）は誤検知が多いので対象外
 *   - 参照元が1件も無い場合は「通過」ではなく skipped にする（黙って通さない）
 *
 * 目的は「AIが作った数字を承認前に止める」ことであって、
 * 正しさの証明ではない。突合が通っても人間の確認を不要にはしない。
 */

import { QaCheck, check, skippedCheck } from "./types";

/** 本文から抜き出した数値表現 */
export type ExtractedNumber = {
  /** 表示のまま（例: "12.5%", "1,200円"） */
  raw: string;
  /** 正規化した数値 */
  value: number;
  /** 単位らしき文字（%, 円, 倍, ドル など）。無ければ null */
  unit: string | null;
};

/** 突合の対象外にする数値。誤検知が実害を上回るもの */
function isCommonplace(value: number, unit: string | null, raw: string): boolean {
  // 年号（1900〜2100）は文脈語として頻出する
  if (!unit && value >= 1900 && value <= 2100 && Number.isInteger(value)) return true;
  // 1桁の整数（「3つの理由」「2倍」等）は本文の構成語であることが多い
  if (Number.isInteger(value) && Math.abs(value) < 10) return true;
  // 「第1」「1位」のような順序表現
  if (/^第|位$|人目$|回目$/.test(raw)) return true;
  return false;
}

const NUMBER_PATTERN =
  /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|％|円|ドル|ドル台|倍|万円|億円|万|億|pt|ポイント)?/g;

/** 本文から数値表現を抜き出す */
export function extractNumbers(text: string): ExtractedNumber[] {
  const results: ExtractedNumber[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const [raw, digits, unit] = match;
    const value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    results.push({ raw: raw.trim(), value, unit: unit ?? null });
  }
  return results;
}

/** 参照元テキスト側に同じ数値が出てくるか */
function appearsInSources(target: ExtractedNumber, sources: string[]): boolean {
  return sources.some((source) => {
    for (const candidate of extractNumbers(source)) {
      if (candidate.value !== target.value) continue;
      // 単位が両方に付いている場合だけ一致を要求する
      if (target.unit && candidate.unit && target.unit !== candidate.unit) continue;
      return true;
    }
    return false;
  });
}

export type FactCheckInput = {
  /** 検査対象の本文 */
  text: string;
  /**
   * 突合に使う参照元テキスト。
   * リサーチ抜粋・保有データの説明文など、事実の出所になるものだけを入れる。
   */
  sources: string[];
};

/**
 * 数値の突合。参照元に無い数値があれば blocking で落とす。
 * 参照元が空なら判定不能として skipped（承認フィードに「未突合」と出る）。
 */
export function checkNumbersAgainstSources(input: FactCheckInput): QaCheck {
  const numbers = extractNumbers(input.text).filter(
    (n) => !isCommonplace(n.value, n.unit, n.raw)
  );

  if (numbers.length === 0) {
    return check("fact.numbers", "数値の裏取り", "blocking", null);
  }

  const usableSources = input.sources.filter((s) => s && s.trim());
  if (usableSources.length === 0) {
    return skippedCheck(
      "fact.numbers",
      "数値の裏取り",
      "blocking",
      `本文に${numbers.length}件の数値があるが、突合できる参照元がありません`
    );
  }

  const unmatched = numbers.filter((n) => !appearsInSources(n, usableSources));
  return check(
    "fact.numbers",
    "数値の裏取り",
    "blocking",
    unmatched.length > 0
      ? `参照元に無い数値: ${[...new Set(unmatched.map((n) => n.raw))].join(" / ")}`
      : null
  );
}

/**
 * 断定的な将来予測の検出。
 * 投資助言と受け取られる表現は数値の正しさとは別に止める必要がある。
 * （runXSafetyGate の UNSAFE_CLAIMS と役割が重なるが、
 *   あちらは投稿の安全弁、こちらは承認フィードに理由を出すための検査）
 */
const FORWARD_LOOKING = [
  /必ず(?:上がる|下がる|儲かる)/,
  /確実に(?:上がる|下がる|増える)/,
  /間違いなく(?:上がる|下がる)/,
  /元本保証/,
  /絶対に(?:損しない|儲かる)/,
];

export function checkForwardLookingClaims(text: string): QaCheck {
  const hits = FORWARD_LOOKING.filter((pattern) => pattern.test(text)).map(
    (pattern) => text.match(pattern)?.[0]
  );
  return check(
    "fact.forward_looking",
    "断定的な将来予測を含まない",
    "blocking",
    hits.length > 0 ? `断定表現: ${hits.filter(Boolean).join(" / ")}` : null
  );
}
