import { postToSlack, safeSlackUrl, type SlackBlock } from "../../integrations/slack/blocks";
import type { MorningBrief, MorningBriefArea } from "./types";

const icon: Record<MorningBriefArea, string> = { BUSINESS: "💰", INVESTMENT: "📈", CONTENT: "📣", "AI COMPANY": "⚙️", ENGINEERING: "🛠️", FINANCE: "🏦" };
export function absoluteDeepLink(path: string, base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL): string | null {
  if (!base || !safeSlackUrl(base) || !path.startsWith("/") || path.startsWith("//") || /[\s\\\u0000-\u001f\u007f]/.test(path)) return null;
  try { const root = new URL(base); const url = new URL(path, root); return url.origin === root.origin && safeSlackUrl(url.toString()) ? url.toString() : null; }
  catch { return null; }
}
// External titles are data, never Slack mentions or mrkdwn directives.
const plain = (value: string, limit: number) => value.slice(0, limit).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[*_~`]/g, "");
export function morningBriefBlocks(brief: MorningBrief): SlackBlock[] {
  const blocks: SlackBlock[] = [{ type: "header", text: { type: "plain_text", text: `🌅 AI Company Morning Brief — ${brief.day}`, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*CEO判断が必要: ${brief.items.length}件*${brief.unavailable.length ? `\n取得できなかった領域: ${brief.unavailable.join("、")}` : ""}` } }];
  for (const area of Object.keys(icon) as MorningBriefArea[]) {
    const items = brief.items.filter((item) => item.area === area); if (!items.length) continue;
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: `*${icon[area]} ${area}*` } });
    for (const item of items) {
      const link = absoluteDeepLink(item.deepLink);
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${item.priority === "CRITICAL" ? "🚨 " : ""}${plain(item.title, 120)}*\n${plain(item.summary, 320)}${item.sourceAlreadyNotified ? "\n_個別通知済み・未処理_" : ""}` },
        ...(link ? { accessory: { type: "button", text: { type: "plain_text", text: "詳しく見る" }, url: link } } : {}) });
    }
  }
  if (!brief.items.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: "本日、CEO判断が必要な未処理事項はありません。" } });
  return blocks.slice(0, 50);
}
export async function sendMorningBrief(brief: MorningBrief) {
  if (!absoluteDeepLink("/") || brief.items.some((item) => !absoluteDeepLink(item.deepLink))) return { ok: false, error: "APP_BASE_URL_OR_DEEP_LINK_INVALID" };
  return postToSlack(`AI Company Morning Brief ${brief.day}: CEO判断 ${brief.items.length}件`, morningBriefBlocks(brief));
}
