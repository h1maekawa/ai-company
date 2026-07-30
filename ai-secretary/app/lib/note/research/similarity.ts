/**
 * コピー・言い換え防止のチェック。
 *
 * 生成物が
 *  1. 調査した他者の文章
 *  2. 自分の過去投稿
 * のどちらかに似すぎていないかを、決定的に判定する。
 *
 * 閾値を超えたものは approved にできない（UI/APIで弾く）。
 */

import { overlapCoefficient, tokenize } from "./cluster";

/** これ以上似ていたら他者のコピーとみなす */
export const COPY_THRESHOLD = 0.45;
/** これ以上似ていたら自分の焼き直しとみなす */
export const SELF_REPEAT_THRESHOLD = 0.55;

export type SimilarityCheck = {
  score: number;
  similarTo?: string;
  /** true なら承認・投稿を止める */
  blocked: boolean;
  reason?: string;
};

export type SimilarityCandidate = { label: string; text: string };

/** 連続一致する最長の文字列長（言い換えでなく丸写しの検出用） */
function longestCommonRun(a: string, b: string): number {
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  let best = 0;
  for (let i = 0; i < short.length; i += 1) {
    for (let len = best + 1; i + len <= short.length; len += 1) {
      if (long.includes(short.slice(i, i + len))) best = len;
      else break;
    }
  }
  return best;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * 生成文を、他者の調査結果と自分の過去投稿の両方に対して照合する。
 * sources には他者の抜粋、pastPosts には自分の過去投稿を渡す。
 */
export function checkSimilarity(
  text: string,
  sources: SimilarityCandidate[],
  pastPosts: SimilarityCandidate[]
): SimilarityCheck {
  const tokens = tokenize(text);
  const normalized = normalize(text);

  let worst: SimilarityCheck = { score: 0, blocked: false };

  const evaluate = (
    candidates: SimilarityCandidate[],
    threshold: number,
    reason: string
  ) => {
    for (const candidate of candidates) {
      if (!candidate.text.trim()) continue;
      // 長さが違っても検出できるよう包含率で見る
      const overlap = overlapCoefficient(tokens, tokenize(candidate.text));

      // 30文字以上そのまま一致していたら、スコアに関係なく丸写し扱い
      const run = longestCommonRun(normalized, normalize(candidate.text));
      const verbatim = run >= 30;

      const score = verbatim ? 1 : overlap;
      if (score > worst.score) {
        worst = {
          score: Number(score.toFixed(3)),
          similarTo: candidate.label,
          blocked: verbatim || score >= threshold,
          reason: verbatim ? `${run}文字がそのまま一致しています` : score >= threshold ? reason : undefined,
        };
      }
    }
  };

  evaluate(sources, COPY_THRESHOLD, "調査した他者の投稿に似すぎています");
  evaluate(pastPosts, SELF_REPEAT_THRESHOLD, "自分の過去投稿と内容が重複しています");

  return worst;
}
