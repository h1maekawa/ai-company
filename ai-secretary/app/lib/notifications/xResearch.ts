import { createHash } from "node:crypto";
import type { ResearchItem, TrendCluster } from "@/app/lib/note/research/types";
import type { NotificationAdapter, NotificationEvent } from "./types";
import { lineNotificationAdapter } from "./line";
import { slackNotificationAdapter } from "./slack";

export type XNotificationChannel = "slack" | "line" | "both";

export function xNotificationChannel(value = process.env.X_NOTIFICATION_CHANNEL): XNotificationChannel {
  return value === "line" || value === "both" ? value : "slack";
}

export function xResearchAdapters(value = process.env.X_NOTIFICATION_CHANNEL): NotificationAdapter[] {
  const channel = xNotificationChannel(value);
  return channel === "both" ? [slackNotificationAdapter, lineNotificationAdapter] : channel === "line" ? [lineNotificationAdapter] : [slackNotificationAdapter];
}

function tokyoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildXResearchEvents(clusters: TrendCluster[], items: ResearchItem[], now = new Date()): NotificationEvent[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return clusters.filter((cluster) => !cluster.blocked).slice(0, 3).flatMap((cluster) => {
    const source = cluster.researchItemIds.map((id) => itemById.get(id)).find(Boolean);
    if (!source) return [];
    const fingerprint = `x-research:${tokyoDate(now)}:${cluster.id}`;
    const query = new URLSearchParams({ view: "create", quickX: "1", clusterId: cluster.id, sourceItemId: source.id });
    const score = cluster.hotScore ?? cluster.totalScore;
    return [{
      id: `ntf_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`,
      fingerprint,
      kind: "X_RESEARCH_CANDIDATE",
      sourceType: "content",
      sourceId: cluster.id,
      departmentId: "creator",
      title: cluster.title,
      summary: [`Hot Score: ${score}`, cluster.summary, "", `元記事: ${source.title ?? source.sourceUrl}`].filter(Boolean).join("\n"),
      priority: "INFO",
      actionRequired: true,
      deepLink: `/note?${query.toString()}`,
      createdAt: now.toISOString(),
    } satisfies NotificationEvent];
  });
}
