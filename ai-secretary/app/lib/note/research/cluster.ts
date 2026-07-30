/**
 * 調査結果のクラスタリングと採点。
 *
 * 採点は**決定的な計算**で行う。AIの気分でスコアが変わらないようにするため、
 * ここでは一切AIを呼ばない（テーマ名の整形だけ別途AIに任せることはできる）。
 *
 * 配点:
 *   話題性 25 / まえみち適合 25 / 本人体験の一致 20 /
 *   収益導線の一致 15 / オリジナル化しやすさ 15
 */

import { ALL_GENRE_IDS, Brand } from "../types";
import { hashId } from "./fetcher";
import {
  ExperienceEntry,
  ResearchItem,
  TrendCluster,
  detectHighRisk,
} from "./types";

/* ─── 日本語向けの軽量トークナイザ ───────────────── */

const STOP_WORDS = new Set([
  "する", "こと", "もの", "ため", "よう", "これ", "それ", "ある", "いる", "なる",
  "から", "まで", "ない", "です", "ます", "した", "して", "され", "そして", "しかし",
  "the", "and", "for", "you", "your", "with", "that", "this", "are", "was",
]);

/** 2〜4文字のn-gramと英単語を混ぜて特徴語を作る */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = text.toLowerCase().replace(/[!-/:-@[-`{-~、。「」（）｜・…]/g, " ");

  for (const word of normalized.split(/\s+/)) {
    if (word.length >= 3 && /[a-z0-9]/.test(word) && !STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }

  const jp = normalized.replace(/[^ぁ-んァ-ヶー一-龠]/g, "");
  for (let n = 2; n <= 3; n += 1) {
    for (let i = 0; i + n <= jp.length; i += 1) {
      const gram = jp.slice(i, i + n);
      if (!STOP_WORDS.has(gram)) tokens.add(gram);
    }
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * 包含率（小さいほうの集合がどれだけ相手に含まれるか）。
 * 長さが大きく違う文どうしを比べるときは jaccard より適している。
 * 例: 短い過去タイトル vs 長い調査本文 — jaccard では低く出てしまう
 */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/* ─── クラスタリング ───────────────────────── */

const SIMILARITY_THRESHOLD = 0.18;

type Group = { items: ResearchItem[]; tokens: Set<string> };

/** 似たResearchItemを1テーマにまとめる */
export function groupItems(items: ResearchItem[]): ResearchItem[][] {
  const groups: Group[] = [];

  for (const item of items) {
    const text = `${item.title ?? ""} ${item.readerProblem ?? ""} ${item.textExcerpt}`;
    const tokens = tokenize(text);

    let best: { group: Group; score: number } | null = null;
    for (const group of groups) {
      const score = jaccard(tokens, group.tokens);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { group, score };
      }
    }

    if (best) {
      best.group.items.push(item);
      for (const token of tokens) best.group.tokens.add(token);
    } else {
      groups.push({ items: [item], tokens });
    }
  }

  return groups.map((g) => g.items);
}

/* ─── 採点 ───────────────────────────────── */

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** 話題性: ソース数と公開メトリクスから。数値が無いソースは件数だけで評価する */
function scoreTrend(items: ResearchItem[]): number {
  const sourceScore = Math.min(items.length, 5) * 3; // 最大15
  const engagement = items.reduce((sum, i) => {
    const m = i.publicMetrics;
    if (!m) return sum;
    return sum + (m.likes ?? 0) + (m.reposts ?? 0) * 2 + (m.replies ?? 0) * 2;
  }, 0);
  // 対数で頭打ちにする（1件のバズだけで満点にしない）
  const engagementScore = engagement > 0 ? Math.min(10, Math.log10(engagement + 1) * 4) : 0;
  return clamp(sourceScore + engagementScore, 25);
}

/** まえみち適合: 5ジャンルに入っているか＋読者の悩みと重なるか */
function scoreBrandFit(items: ResearchItem[], brand: Brand): number {
  const genreIds = new Set(items.flatMap((i) => i.detectedGenreIds));
  const inBrandGenres = [...genreIds].filter((g) => ALL_GENRE_IDS.includes(g));
  if (inBrandGenres.length === 0) return 0;

  const genreScore = Math.min(inBrandGenres.length, 2) * 7; // 最大14

  const painTokens = tokenize(brand.painPoints.join(" "));
  const itemTokens = tokenize(
    items.map((i) => `${i.title ?? ""} ${i.readerProblem ?? ""}`).join(" ")
  );
  const painScore = jaccard(painTokens, itemTokens) * 40; // 悩みが重なるほど加点

  return clamp(genreScore + painScore, 25);
}

/** 本人体験の一致: 登録済み体験と重なるか（本人確認済みを優先） */
function scoreExperienceFit(
  items: ResearchItem[],
  experiences: ExperienceEntry[]
): { score: number; matchedIds: string[] } {
  if (experiences.length === 0) return { score: 0, matchedIds: [] };

  const itemTokens = tokenize(
    items.map((i) => `${i.title ?? ""} ${i.readerProblem ?? ""} ${i.textExcerpt}`).join(" ")
  );
  const genreIds = new Set(items.flatMap((i) => i.detectedGenreIds));

  const scored = experiences
    .map((exp) => {
      const expTokens = tokenize(
        `${exp.title} ${exp.summary} ${exp.whatHappened} ${exp.reusableFacts.join(" ")}`
      );
      const overlap = jaccard(itemTokens, expTokens);
      const genreHit = exp.genres.some((g) => genreIds.has(g)) ? 0.15 : 0;
      // 未確認の体験は満額では評価しない（断定的に書けないため）
      const trust = exp.verifiedByUser ? 1 : 0.4;
      return { exp, value: (overlap + genreHit) * trust };
    })
    .filter((s) => s.value > 0.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  if (scored.length === 0) return { score: 0, matchedIds: [] };

  const score = clamp(scored[0].value * 60 + (scored.length - 1) * 3, 20);
  return { score, matchedIds: scored.map((s) => s.exp.id) };
}

/** 収益導線の一致: 有料note・アフィリエイトに繋がる題材か */
function scoreMonetizationFit(items: ResearchItem[]): number {
  const text = items.map((i) => `${i.title ?? ""} ${i.textExcerpt}`).join(" ");
  const signals = [
    "手順", "テンプレート", "プロンプト", "設定", "使い方", "比較",
    "始め方", "作り方", "チェックリスト", "ツール", "おすすめ",
  ];
  const hits = signals.filter((s) => text.includes(s)).length;
  return clamp(hits * 4, 15);
}

/** オリジナル化しやすさ: 自分の手を動かした話に変換できるか */
function scoreOriginality(items: ResearchItem[], matchedExperiences: number): number {
  // 体験が紐づくほど、他者の焼き直しにならず自分の記事にしやすい
  const base = matchedExperiences > 0 ? 9 : 3;
  // ソースが1つしか無い＝独占的に語れる余地がある
  const scarcity = items.length <= 2 ? 4 : 1;
  const howTo = items.some((i) => /手順|方法|やり方|試し/.test(`${i.title ?? ""}${i.textExcerpt}`))
    ? 2
    : 0;
  return clamp(base + scarcity + howTo, 15);
}

/* ─── 減点とブロック ───────────────────────── */

export type ScoringContext = {
  brand: Brand;
  experiences: ExperienceEntry[];
  /** 過去に扱ったテーマ（重複減点用） */
  pastTitles: string[];
};

function applyPenalties(
  items: ResearchItem[],
  ctx: ScoringContext,
  matchedIds: string[]
): { penalties: string[]; deduction: number } {
  const penalties: string[] = [];
  let deduction = 0;

  const text = items.map((i) => `${i.title ?? ""} ${i.textExcerpt}`).join(" ");
  const tokens = tokenize(text);

  // 過去投稿との重複。
  // 過去タイトルは短く、調査本文は長いことが多いので包含率で見る
  for (const past of ctx.pastTitles) {
    if (overlapCoefficient(tokens, tokenize(past)) > 0.6) {
      penalties.push(`過去に扱ったテーマと重複（${past.slice(0, 20)}…）`);
      deduction += 15;
      break;
    }
  }

  // 根拠が薄い（公開メトリクスがどこにも無い）
  if (!items.some((i) => i.publicMetrics)) {
    penalties.push("公開された反応数が取れておらず、話題性の根拠が弱い");
    deduction += 5;
  }

  // まえみちの5ジャンルから離れている
  const genreIds = new Set(items.flatMap((i) => i.detectedGenreIds));
  if (![...genreIds].some((g) => ALL_GENRE_IDS.includes(g))) {
    penalties.push("まえみちの5ジャンルから離れている");
    deduction += 20;
  }

  // 体験が無いのに体験談が要りそうな題材
  const needsExperience = /やってみた|試した|使ってみた|実践/.test(text);
  if (needsExperience && matchedIds.length === 0) {
    penalties.push("体験談が必要なテーマだが、登録済みの本人の体験が無い");
    deduction += 10;
  }

  // 短期的な煽りだけ
  if (/絶対|必ず|誰でも|今すぐ|やらないと損/.test(text)) {
    penalties.push("煽り表現が中心で、まえみちの文体と合わない");
    deduction += 8;
  }

  return { penalties, deduction };
}

/* ─── 本体 ───────────────────────────────── */

export function buildClusters(
  items: ResearchItem[],
  ctx: ScoringContext,
  existing: TrendCluster[] = []
): TrendCluster[] {
  const now = new Date().toISOString();
  const groups = groupItems(items);
  const existingById = new Map(existing.map((c) => [c.id, c]));

  const clusters: TrendCluster[] = groups.map((group) => {
    const primary = group[0];
    const title = primary.title?.slice(0, 60) ?? primary.textExcerpt.slice(0, 40);
    const id = hashId("c", group.map((g) => g.sourceUrl).sort().join("|"));

    const trendScore = scoreTrend(group);
    const brandFitScore = scoreBrandFit(group, ctx.brand);
    const { score: experienceFitScore, matchedIds } = scoreExperienceFit(group, ctx.experiences);
    const monetizationFitScore = scoreMonetizationFit(group);
    const originalityScore = scoreOriginality(group, matchedIds.length);

    const { penalties, deduction } = applyPenalties(group, ctx, matchedIds);

    const raw =
      trendScore + brandFitScore + experienceFitScore + monetizationFitScore + originalityScore;
    const totalScore = Math.max(0, raw - deduction);

    const riskLabel = detectHighRisk(
      group.map((g) => `${g.title ?? ""} ${g.textExcerpt}`).join(" ")
    );

    const prior = existingById.get(id);

    return {
      id,
      title,
      summary: group
        .map((g) => g.readerProblem)
        .filter((p): p is string => Boolean(p) && p !== "（未分析）")
        .slice(0, 2)
        .join(" / ") || `${group.length}件の類似トピック`,
      genreIds: [...new Set(group.flatMap((g) => g.detectedGenreIds))],
      researchItemIds: group.map((g) => g.id),
      sourceCount: group.length,
      firstDetectedAt: prior?.firstDetectedAt ?? now,
      lastDetectedAt: now,
      trendScore,
      brandFitScore,
      experienceFitScore,
      monetizationFitScore,
      originalityScore,
      totalScore,
      penalties,
      blocked: Boolean(riskLabel),
      blockReason: riskLabel ? `${riskLabel}に関する題材のため自動公開対象外` : undefined,
      matchedExperienceIds: matchedIds,
      // 既に使った/却下したテーマの状態は維持する
      status: prior && prior.status !== "candidate" ? prior.status : "candidate",
    };
  });

  return clusters.sort((a, b) => b.totalScore - a.totalScore);
}
