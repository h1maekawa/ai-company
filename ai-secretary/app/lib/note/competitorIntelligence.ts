import type { ContentPerformance, ResearchItem } from "./research/types";

export type ContentPattern = {
  id: string; sourceItemId: string; platform: ResearchItem["platform"]; topic: string;
  observedMetrics?: { impressions?: number; likes?: number; replies?: number; reposts?: number };
  hookType?: string; openingType?: string; structure: string[]; numberLead: boolean;
  questionLead: boolean; ctaStyle?: string; lengthBucket?: "short" | "medium" | "long";
  observedAt: string;
};

export type ContentComparison = {
  ownContentId: string; competitorContentIds: string[]; observations: string[];
  hypotheses: string[]; nextExperiments: string[]; evidenceCount: number;
  confidence: "low" | "medium" | "high"; createdAt: string;
};

const words = (value: string) => new Set(value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
export function topicSimilarity(a: string, b: string): number {
  const left = words(a), right = words(b); if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / new Set([...left, ...right]).size;
}

function engagement(item: ResearchItem): number {
  const m = item.publicMetrics; return (m?.likes ?? 0) + (m?.replies ?? 0) + (m?.reposts ?? 0);
}

export function selectComparableContent(input: { items: ResearchItem[]; topic: string; genreId?: string; now?: Date; max?: number }): ResearchItem[] {
  const now = input.now ?? new Date();
  return input.items.filter((item) => {
    const role = item.sourceRole ?? (item.sourceType === "reference-account" ? "reference" : item.sourceType === "trend" ? "buzz" : "news");
    const age = now.getTime() - new Date(item.publishedAt ?? item.fetchedAt).getTime();
    return (role === "reference" || role === "buzz") && age >= 0 && age <= 30 * 86_400_000
      && (!input.genreId || item.detectedGenreIds.includes(input.genreId))
      && topicSimilarity(input.topic, `${item.title ?? ""} ${item.textExcerpt}`) > 0
      && Boolean(item.publicMetrics && Object.values(item.publicMetrics).some((value) => typeof value === "number"));
  }).sort((a, b) => {
    const similarity = topicSimilarity(input.topic, `${b.title ?? ""} ${b.textExcerpt}`) - topicSimilarity(input.topic, `${a.title ?? ""} ${a.textExcerpt}`);
    return similarity || engagement(b) - engagement(a);
  }).slice(0, Math.min(5, input.max ?? 5));
}

export function extractContentPattern(item: ResearchItem): ContentPattern {
  const excerpt = item.textExcerpt.trim(); const first = excerpt.split(/\n|。/)[0] ?? "";
  return { id: `pattern:${item.id}`, sourceItemId: item.id, platform: item.platform,
    topic: item.title ?? item.detectedGenreIds[0] ?? "unknown",
    observedMetrics: item.publicMetrics ? { impressions: item.publicMetrics.impressions, likes: item.publicMetrics.likes, replies: item.publicMetrics.replies, reposts: item.publicMetrics.reposts } : undefined,
    hookType: item.hookPattern, openingType: /^\d/.test(first) ? "number-lead" : /[?？]$/.test(first) ? "question" : first.length <= 30 ? "short-hook" : "statement",
    structure: item.structurePattern ? item.structurePattern.split(/\s*(?:→|>|\/|,)\s*/).filter(Boolean) : [],
    numberLead: /^\d/.test(first), questionLead: /[?？]$/.test(first), ctaStyle: item.ctaPattern,
    lengthBucket: excerpt.length <= 160 ? "short" : excerpt.length <= 250 ? "medium" : "long", observedAt: item.fetchedAt };
}

export function compareOwnWithCompetitors(own: ContentPerformance, items: ResearchItem[], now = new Date()): ContentComparison {
  const patterns = items.map(extractContentPattern); const observations: string[] = [];
  const count = (key: "numberLead" | "questionLead") => patterns.filter((p) => p[key]).length;
  if (count("numberLead")) observations.push(`${patterns.length}件中${count("numberLead")}件が数字始まり`);
  if (count("questionLead")) observations.push(`${patterns.length}件中${count("questionLead")}件がQuestion Hook`);
  const hypotheses = observations.map((value) => `${value}。相関の可能性があり、単一変数の実験で検証する価値がある`);
  const nextExperiments = count("numberLead") >= 2 ? ["[hook] 次の3投稿で数字Hookを検証"] : count("questionLead") >= 2 ? ["[question] 次の3投稿でQuestion Hookを検証"] : [];
  return { ownContentId: own.contentId, competitorContentIds: items.map((item) => item.id), observations, hypotheses, nextExperiments,
    evidenceCount: patterns.length, confidence: patterns.length >= 5 ? "high" : patterns.length >= 3 ? "medium" : "low", createdAt: now.toISOString() };
}
