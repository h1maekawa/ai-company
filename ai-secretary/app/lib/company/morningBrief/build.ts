import type { NotificationEvent } from "../../notifications/types";
import type { RevenueOpportunity } from "../opportunity/types";
import type { MorningBrief, MorningBriefArea, MorningBriefInsight, MorningBriefItem } from "./types";

type HomeAttention = { id: string; title: string; href: string; source: string; priority: "high" | "normal" };
const day = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function area(event: NotificationEvent): MorningBriefArea {
  if (event.departmentId === "engineering" || event.kind.startsWith("ENGINEERING_")) return "ENGINEERING";
  if (event.sourceType === "investment") return "INVESTMENT";
  if (event.sourceType === "content") return "CONTENT";
  return "AI COMPANY";
}
export function buildMorningBrief(input: { notifications: NotificationEvent[]; homeAttention: HomeAttention[]; opportunities: RevenueOpportunity[]; insights?: MorningBriefInsight[]; notifiedFingerprints?: string[]; unavailable?: string[]; now?: Date }): MorningBrief {
  const now = input.now ?? new Date();
  const items: MorningBriefItem[] = input.notifications.filter((event) => event.actionRequired && event.priority !== "INFO").map((event) => ({
    id: event.id, fingerprint: event.fingerprint, area: area(event), title: event.title, summary: event.summary,
    deepLink: event.deepLink, priority: event.priority === "URGENT" ? "CRITICAL" : "ACTION_REQUIRED", sourceAlreadyNotified: input.notifiedFingerprints?.includes(event.fingerprint) ?? false,
  }));
  for (const attention of input.homeAttention) {
    const mappedArea: MorningBriefArea = attention.source === "投資" ? "INVESTMENT" : attention.source === "コンテンツ" ? "CONTENT" : attention.source === "資産" ? "FINANCE" : "AI COMPANY";
    items.push({ id: `home:${attention.id}`, fingerprint: `home:${attention.id}`, area: mappedArea, title: attention.title,
      summary: "Homeの未処理事項", deepLink: attention.href, priority: attention.priority === "high" ? "ACTION_REQUIRED" : "ACTION_REQUIRED", sourceAlreadyNotified: false });
  }
  for (const opportunity of input.opportunities.filter((item) => {
    const age = now.getTime() - Date.parse(item.updatedAt);
    return item.status === "RECOMMENDED" && Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000;
  }).sort((a, b) => (b.rankingScore ?? b.score) - (a.rankingScore ?? a.score)).slice(0, 3)) {
    items.push({ id: `opportunity:${opportunity.id}`, fingerprint: `opportunity:${opportunity.fingerprint}`, area: "BUSINESS", title: opportunity.title,
      summary: `${opportunity.summary}\nScore ${opportunity.score} / Evidence coverage ${opportunity.coveragePct}% / Revenue ${opportunity.expectedRevenue.known ? "confirmed estimate available" : "UNKNOWN"}`,
      deepLink: `/company?opportunityId=${encodeURIComponent(opportunity.id)}`, priority: "ACTION_REQUIRED", sourceAlreadyNotified: false });
  }
  const deduped = items.filter((item, index, all) => all.findIndex((other) => other.fingerprint === item.fingerprint) === index)
    .sort((a, b) => Number(b.priority === "CRITICAL") - Number(a.priority === "CRITICAL")).slice(0, 15);
  return { day: day(now), generatedAt: now.toISOString(), items: deduped, insights: (input.insights ?? []).slice(0, 5), unavailable: [...new Set(input.unavailable ?? [])] };
}
