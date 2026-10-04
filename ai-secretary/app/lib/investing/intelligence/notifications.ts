import { createHash } from "node:crypto";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { lineNotificationAdapter } from "@/app/lib/notifications/line";
import { deliverNotifications } from "@/app/lib/notifications/router";
import { slackNotificationAdapter } from "@/app/lib/notifications/slack";
import type { NotificationAdapter, NotificationDelivery, NotificationEvent } from "@/app/lib/notifications/types";
import type { IntelligenceToday } from "./types";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";

export function buildInvestmentEvents(today: IntelligenceToday, now = new Date()): NotificationEvent[] {
  const opportunities = today.opportunities.filter((item) => item.gate === "GO_CANDIDATE").slice(0, 3).map((item) => {
    const fingerprint = `investment:${tokyoDateKey(now)}:${item.id}:opportunity`;
    return { id: `ntf_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`, fingerprint, kind: "INVESTMENT_OPPORTUNITY", sourceType: "investment", sourceId: item.id, departmentId: "fund", title: `${item.ticker} · ${item.theme}`, summary: `Score ${item.score ?? "—"} / Coverage ${Math.round(item.coverage * 100)}% / RVOL ${item.relativeVolume?.toFixed(2) ?? "—"}x`, priority: "INFO", actionRequired: true, deepLink: `/investing/opportunities/${encodeURIComponent(item.id)}`, createdAt: now.toISOString() } satisfies NotificationEvent;
  });
  const hotThemes = today.themeStrength.filter((item) => item.hot).slice(0, 3).map((item) => {
    // 日付を含めず、10点bucketとEvidence集合が変わった時だけ新fingerprintにする。
    const evidenceKey = [...item.evidenceRefs].sort().join(",");
    const fingerprint = `investment:theme:${item.name}:${Math.floor((item.score ?? 0) / 10)}:${createHash("sha256").update(evidenceKey).digest("hex").slice(0, 8)}`;
    const related = today.themeGraph?.edges.filter((edge) => edge.from === `theme:${item.name}` && edge.relation === "represented-by").map((edge) => edge.to.replace("ticker:", "")).slice(0, 5) ?? [];
    return { id: `ntf_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`, fingerprint, kind: "INVESTMENT_OPPORTUNITY", sourceType: "investment", sourceId: `theme:${item.name}`, departmentId: "fund", title: `Hot Theme · ${item.name}`, summary: `Score ${item.score} / Coverage ${Math.round(item.coverage * 100)}%${related.length ? ` / Related ${related.join(", ")}` : ""}`, priority: "INFO", actionRequired: false, deepLink: "/investing/market", createdAt: now.toISOString() } satisfies NotificationEvent;
  });
  return [...hotThemes, ...opportunities];
}
function adapters(value = process.env.INVESTING_NOTIFICATION_CHANNEL): NotificationAdapter[] { return value === "both" ? [slackNotificationAdapter, lineNotificationAdapter] : value === "line" ? [lineNotificationAdapter] : [slackNotificationAdapter]; }
export async function notifyInvestmentOpportunities(today: IntelligenceToday): Promise<NotificationDelivery[]> {
  if (process.env.INVESTING_NOTIFICATIONS_ENABLED !== "true") return [];
  return deliverNotifications(buildInvestmentEvents(today), getExecutionStore(), adapters());
}
