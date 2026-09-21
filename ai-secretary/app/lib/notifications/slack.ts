import { postToSlack, type SlackBlock } from "@/app/lib/integrations/slack/blocks";
import type { NotificationAdapter, NotificationEvent } from "./types";

export const COMPANY_APPROVAL_ACTION = "company_approval_approve";
export function notificationDeepLink(event: NotificationEvent) { const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL; return base ? new URL(event.deepLink, base).toString() : event.deepLink; }
export function slackNotificationBlocks(event: NotificationEvent): SlackBlock[] {
  const link = notificationDeepLink(event);
  const elements: Record<string, unknown>[] = [{ type: "button", text: { type: "plain_text", text: "AI Companyで確認" }, url: link }];
  if (event.sourceType === "approval" && ["R0", "R1", "R2"].includes(event.riskLevel ?? "")) elements.unshift({ type: "button", text: { type: "plain_text", text: "承認" }, style: "primary", action_id: COMPANY_APPROVAL_ACTION, value: event.sourceId });
  return [{ type: "header", text: { type: "plain_text", text: "AI Company — 確認が必要です", emoji: true } }, { type: "section", text: { type: "mrkdwn", text: `*${event.title}*\n${event.summary}\nPriority: ${event.priority}${event.riskLevel ? `\nRisk: ${event.riskLevel}` : ""}` } }, { type: "actions", elements }];
}
export const slackNotificationAdapter: NotificationAdapter = { channel: "slack", async deliver(event) { const result = await postToSlack(`${event.title}\n${event.summary}`, slackNotificationBlocks(event)); return result.ok ? { status: "SENT", deliveredAt: new Date().toISOString() } : { status: "FAILED", error: result.error }; } };
export function isAuthorizedSlackUser(userId: string | undefined) { const allowed = (process.env.SLACK_AUTHORIZED_USER_IDS ?? "").split(",").map((item) => item.trim()).filter(Boolean); return Boolean(userId) && allowed.includes(userId!); }
export function canApproveInSlack(riskLevel: string) { return ["R0", "R1", "R2"].includes(riskLevel); }
