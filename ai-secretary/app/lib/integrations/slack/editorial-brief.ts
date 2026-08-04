import type { ResearchItem, TrendCluster } from "../../note/research/types";
import type { EditorialBrief } from "./editorial-context";

const compact = (value: string, max = 240) =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

export function buildEditorialBrief(input: {
  topic?: string;
  destination: "x" | "note" | "both";
  candidates: TrendCluster[];
  items: ResearchItem[];
}): EditorialBrief {
  const selected = input.candidates.slice(0, 3);
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const createdAt = new Date();
  return {
    id: `brief-${createdAt.getTime()}`,
    topic: input.topic || "今日の注目テーマ",
    destination: input.destination,
    headline: "今日の気になるニュース",
    overview: `「${input.topic || "指定テーマ"}」について、考える材料を${selected.length}件に整理しました。`,
    newsItems: selected.map((candidate) => {
      const sources = candidate.researchItemIds
        .map((id) => itemById.get(id))
        .filter((item): item is ResearchItem => Boolean(item));
      return {
        id: candidate.id,
        companyOrTopic: candidate.title,
        whatHappened: compact(candidate.summary || sources[0]?.textExcerpt || candidate.title),
        whyItMatters: compact(
          candidate.genreIds.includes("asset-building")
            ? "市場や企業の成長が一時的か、構造的かを考える材料になります。"
            : "今の生活や仕事にどう影響するかを考える材料になります。"
        ),
        unknowns: ["この動きがどこまで続くか", "企業ごとの強みがどこにあるか"],
        discussionQuestion: candidate.genreIds.includes("asset-building")
          ? "株価ではなく事業を見るなら、次に何を確認したいですか？"
          : "このニュースで一番気になった部分はどこですか？",
        sourceResearchItemIds: sources.map((item) => item.id),
      };
    }),
    marketStructure: /AI|半導体/i.test(input.topic || "")
      ? ["GPU", "HBM・メモリ", "製造装置", "データセンター", "電力・冷却・通信"]
      : undefined,
    sourceResearchItemIds: selected.flatMap((candidate) => candidate.researchItemIds),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 48 * 60 * 60 * 1000).toISOString(),
  };
}
