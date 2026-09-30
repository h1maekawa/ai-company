import { NextRequest, NextResponse } from "next/server";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { flowEventFingerprint, parseFlowCardEvent, verifyFlowSignature } from "@/app/lib/finance/flowEvents";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function notifyCard(event: NonNullable<ReturnType<typeof parseFlowCardEvent>>) {
  const channel = process.env.FLOW_EVENT_NOTIFY_CHANNEL ?? "slack";
  if (channel === "off") return { status: "skipped" as const };
  const base = process.env.APP_BASE_URL;
  const link = base ? new URL("/assets?tab=cards", base).toString() : "/assets?tab=cards";
  const amount = `¥${event.amount.toLocaleString("ja-JP")}`;
  const text = `💳 新しいカード利用${event.count && event.count > 1 ? ` ${event.count}件` : ""}\n${event.card}\n${event.merchant}\n${amount}\nAI Companyで確認: ${link}`;
  const outcomes: string[] = [];
  if (channel === "slack" || channel === "both") {
    const sent = await postToSlack(text);
    outcomes.push(sent.ok ? "slack_sent" : "slack_unknown");
  }
  if (channel === "line" || channel === "both") {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const userId = process.env.LINE_USER_ID;
    if (!token || !userId) outcomes.push("line_unavailable");
    else {
      try {
        const sent = await fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }), cache: "no-store", signal: AbortSignal.timeout(5_000) });
        outcomes.push(sent.ok ? "line_sent" : "line_unknown");
      } catch { outcomes.push("line_unknown"); }
    }
  }
  return { status: outcomes.some((item) => item.endsWith("unknown") || item.endsWith("unavailable")) ? "needs_review" as const : "sent" as const, channels: outcomes, deepLink: "/assets?tab=cards" };
}

export async function POST(request: NextRequest) {
  if (!process.env.FLOW_EVENT_SECRET) return NextResponse.json({ error: "FLOW_EVENT_NOT_CONFIGURED" }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "EVENT_TOO_LARGE" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 4096) return NextResponse.json({ error: "EVENT_TOO_LARGE" }, { status: 413 });
  if (!verifyFlowSignature(raw, request.headers.get("x-flow-timestamp"), request.headers.get("x-flow-signature"), process.env.FLOW_EVENT_SECRET)) return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  const event = parseFlowCardEvent(raw);
  if (!event) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  try {
    const store = getExecutionStore();
    const fingerprint = flowEventFingerprint(event);
    const prior = await store.getIdempotencyResult("flow-card-notification", fingerprint);
    if (prior) return NextResponse.json({ duplicate: true, result: prior }, { status: 202 });
    if (!(await store.claimIdempotency("flow-card-notification", fingerprint))) return NextResponse.json({ duplicate: true, status: "in_progress_or_unknown" }, { status: 202 });
    let result: Awaited<ReturnType<typeof notifyCard>>;
    try { result = await notifyCard(event); }
    catch { result = { status: "needs_review", channels: ["delivery_unknown"], deepLink: "/assets?tab=cards" }; }
    await store.completeIdempotency("flow-card-notification", fingerprint, result);
    return NextResponse.json({ accepted: true, result }, { status: 202 });
  } catch { return NextResponse.json({ error: "DURABLE_EVENT_STORE_UNAVAILABLE" }, { status: 503 }); }
}
