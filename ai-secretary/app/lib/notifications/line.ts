import type { NotificationAdapter, NotificationEvent } from "./types";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function lineNotificationText(event: NotificationEvent): string {
  const base = process.env.APP_BASE_URL;
  const link = base ? new URL(event.deepLink, base).toString() : event.deepLink;
  const investment = event.sourceType === "investment";
  return [
    investment ? "📊 Investment Intelligence" : "📈 今日のX候補",
    "",
    event.title,
    event.summary,
    "",
    investment ? "👇 AI CompanyでOpportunityを確認" : "👇 AI Companyでこの候補を開く",
    link,
    "",
    investment ? "Evidenceと不足データを確認してから、本人がGO / WAIT / PASSを判断してください。" : "リンク先で元記事を確認し、音声またはテキストで自分の意見を入れるとX投稿案を作れます。",
  ].join("\n");
}

export const lineNotificationAdapter: NotificationAdapter = {
  channel: "line",
  async deliver(event) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const userId = process.env.LINE_USER_ID;
    if (!token || !userId) return { status: "SKIPPED", error: "LINE_MESSAGING_API_NOT_CONFIGURED" };
    try {
      const response = await fetch(LINE_PUSH_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: userId, messages: [{ type: "text", text: lineNotificationText(event) }] }),
        cache: "no-store",
      });
      if (!response.ok) return { status: "FAILED", error: `LINE_PUSH_FAILED_${response.status}` };
      return { status: "SENT", deliveredAt: new Date().toISOString() };
    } catch {
      return { status: "FAILED", error: "LINE_PUSH_FAILED" };
    }
  },
};
