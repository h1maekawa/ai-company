import { createHash } from "node:crypto";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { lineNotificationAdapter } from "@/app/lib/notifications/line";
import { deliverNotifications } from "@/app/lib/notifications/router";
import { slackNotificationAdapter } from "@/app/lib/notifications/slack";
import type { NotificationAdapter, NotificationDelivery, NotificationEvent } from "@/app/lib/notifications/types";
import type { IntelligenceToday } from "./types";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";

export function buildInvestmentEvents(today: IntelligenceToday, now = new Date()): NotificationEvent[] {
  return today.opportunities.filter((item) => item.gate === "GO_CANDIDATE").slice(0, 3).map((item) => {
    const fingerprint = `investment:${tokyoDateKey(now)}:${item.id}:opportunity`;
    return { id: `ntf_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`, fingerprint, kind: "INVESTMENT_OPPORTUNITY", sourceType: "investment", sourceId: item.id, departmentId: "fund", title: `${item.ticker} · ${item.theme}`, summary: `Score ${item.score ?? "—"} / Coverage ${Math.round(item.coverage * 100)}% / RVOL ${item.relativeVolume?.toFixed(2) ?? "—"}x`, priority: "INFO", actionRequired: true, deepLink: `/investing/opportunities/${encodeURIComponent(item.id)}`, createdAt: now.toISOString() } satisfies NotificationEvent;
  });
}
function adapters(value = process.env.INVESTING_NOTIFICATION_CHANNEL): NotificationAdapter[] { return value === "both" ? [slackNotificationAdapter, lineNotificationAdapter] : value === "line" ? [lineNotificationAdapter] : [slackNotificationAdapter]; }
export async function notifyInvestmentOpportunities(today: IntelligenceToday): Promise<NotificationDelivery[]> {
  if (process.env.INVESTING_NOTIFICATIONS_ENABLED !== "true") return [];
  return deliverNotifications(buildInvestmentEvents(today), getExecutionStore(), adapters());
}
