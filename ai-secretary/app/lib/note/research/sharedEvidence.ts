import type { ResearchItem as SharedItem } from "../../company/research/types";
import type { ResearchItem } from "./types";
import { detectGenres } from "./genres";

/** Read projection of canonical Creator evidence; never manufactures engagement or publication dates. */
export function projectCreatorEvidence(items: SharedItem[], now = new Date()): ResearchItem[] {
  return items.flatMap((item): ResearchItem[] => {
    if (!item.departmentIds.includes("creator") || !["web", "rss", "api"].includes(item.sourceType) || !item.sourceUrl) return [];
    const age = now.getTime() - Date.parse(item.fetchedAt);
    if (!Number.isFinite(age) || age < 0 || age > 72 * 3_600_000) return [];
    try {
      const url = new URL(item.sourceUrl);
      if (! ["https:", "http:"].includes(url.protocol) || url.username || url.password) return [];
    } catch { return []; }
    return [{ id: item.id, platform: "web", sourceType: "keyword", sourceRole: "news",
      sourceUrl: item.sourceUrl, title: item.title, textExcerpt: item.summary.slice(0, 220),
      publishedAt: item.publishedAt, fetchedAt: item.fetchedAt,
      detectedGenreIds: detectGenres(`${item.title} ${item.summary}`) }];
  });
}
