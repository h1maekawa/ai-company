import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { getExecutionStore, loadExecutionState } from "@/app/lib/company/execution/store";
import { buildNotificationEvents } from "@/app/lib/notifications/events";
import { loadHomeAttention } from "@/app/lib/company/homeAttention";
import { loadOpportunities } from "@/app/lib/company/opportunity/store";
import { buildMorningBrief } from "@/app/lib/company/morningBrief/build";
import { sendMorningBrief } from "@/app/lib/company/morningBrief/slack";
import { GET as getEngineering } from "@/app/api/engineering/requests/route";
import { loadGrowthReviews } from "@/app/lib/note/research/store";
import { buildXGrowthInsight } from "@/app/lib/company/morningBrief/xGrowth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req); if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const store = getExecutionStore();
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const key = `morning-brief:${day}`;
  if (await store.getIdempotencyResult("scheduled-notification", key)) return NextResponse.json({ ok: true, deduped: true, day });
  const lease = await store.acquireLease(key, randomUUID(), 120000); if (!lease) return NextResponse.json({ ok: true, deduped: true, day });
  try {
    // A concurrent invocation may have delivered while we waited to acquire the lease.
    if (await store.getIdempotencyResult("scheduled-notification", key)) return NextResponse.json({ ok: true, deduped: true, day });
    const growthPromise = loadGrowthReviews().then((reviews) => ({ reviews, failed: false })).catch(() => ({ reviews: [], failed: true }));
    const [state, home, opportunities, engineeringResponse, growth] = await Promise.all([loadExecutionState(), loadHomeAttention(), loadOpportunities(), getEngineering(), growthPromise]);
    const engineering = engineeringResponse.ok ? await engineeringResponse.json().catch(() => null) : null;
    const notifications = buildNotificationEvents(state, engineering);
    const notifiedFingerprints = (await Promise.all(notifications.map(async (event) => {
      const delivery = await store.getIdempotencyResult<{ status: string }>("notification-delivery", `slack:${event.fingerprint}`);
      return delivery?.status === "SENT" ? event.fingerprint : null;
    }))).filter((value): value is string => value !== null);
    const latestGrowthReview = [...growth.reviews].sort((a, b) => b.measuredThrough.localeCompare(a.measuredThrough))[0];
    const growthInsight = buildXGrowthInsight(latestGrowthReview);
    const unavailable = [...home.unavailable, ...(growth.failed ? ["X Growth"] : latestGrowthReview && !growthInsight ? ["X Growth (stale)"] : [])];
    const brief = buildMorningBrief({ notifications, notifiedFingerprints, homeAttention: home.attention, opportunities, insights: growthInsight ? [growthInsight] : [], unavailable });
    const delivery = await sendMorningBrief(brief);
    if (!delivery.ok) return NextResponse.json({ error: "SLACK_DELIVERY_FAILED" }, { status: 503 });
    await store.completeIdempotency("scheduled-notification", key, { sentAt: new Date().toISOString(), count: brief.items.length });
    return NextResponse.json({ ok: true, day, actionRequired: brief.items.length });
  } finally { await store.releaseLease(lease); }
}
