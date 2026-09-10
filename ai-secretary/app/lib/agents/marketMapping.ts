/**
 * 市況ブリーフ → リサーチ材料への写像（決定論的・純関数） — 要件5
 *
 * 副作用のある取り込み処理（runMarketIntake）から切り離してある。
 * 混入防止のルールはここに集約され、単体でテストできる。
 * marketData/calc.ts と同じ方針（判定・変換は純関数、I/Oは別ファイル）。
 */

import type { ResearchItem } from "@/app/lib/note/research/types";

/** 市況由来のResearchItemを識別する接頭辞。重複取り込みの判定に使う */
const MARKET_ITEM_PREFIX = "mkt-";

/** 投資系の話題を寄せるジャンル。実在しないIDを入れないため最小限にする */
const MARKET_GENRE_IDS = ["asset-building"];

/** 写像に必要な最小限のブリーフ形状（InvestmentLearningBrief の部分集合） */
export type BriefForMapping = {
  id: string;
  date: string;
  whatHappened: string;
  whyRelevant: string;
  termToLearn: { term: string; explanation: string };
  nextThingsToWatch: string[];
  todaysQuestion: string;
  factsUsed: { tickers: string[] };
  createdAt: string;
};

/** briefのIDからResearchItemのIDを決める（同じbriefは必ず同じID＝重複しない） */
export function marketItemId(briefId: string): string {
  return `${MARKET_ITEM_PREFIX}${briefId}`;
}

/**
 * Investment Learning Brief を ResearchItem へ写像する。
 *
 * 入れないもの（learningBriefと同じ原則）:
 *   - aiInterpretation … 解釈は生成側が本人の視点で行う。材料は事実に留める
 *   - pnlSnapshot 等の非公開の数値 … 総資産・保有数量・取得単価は外に出さない
 * factsUsed からは tickers だけを使う。
 */
export function briefToResearchItem(brief: BriefForMapping, now = new Date()): ResearchItem {
  const excerpt = [
    brief.whatHappened,
    brief.whyRelevant,
    brief.termToLearn?.term
      ? `用語: ${brief.termToLearn.term} — ${brief.termToLearn.explanation}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: marketItemId(brief.id),
    platform: "web",
    sourceType: "trend",
    // 外部URLではなく内部のSSOT参照。出所を辿れるようにしておく
    sourceUrl: `vault://memory/personal/note/investment-learning-briefs#${brief.id}`,
    title: `市況メモ ${brief.date}${
      brief.factsUsed?.tickers?.length ? `（${brief.factsUsed.tickers.join(", ")}）` : ""
    }`,
    textExcerpt: excerpt,
    authorName: "Market Agent",
    publishedAt: brief.createdAt,
    detectedGenreIds: MARKET_GENRE_IDS,
    // 生成側が使う「型」。市況ネタは読者の疑問から入るのが定石
    readerProblem: brief.todaysQuestion || undefined,
    emotionalAngle: brief.nextThingsToWatch?.length
      ? `次に見ること: ${brief.nextThingsToWatch.join(" / ")}`
      : undefined,
    fetchedAt: now.toISOString(),
  };
}
