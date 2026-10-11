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
import { loadDailyXPlans, loadGrowthReviews, loadPerformance, loadSocialDrafts, upsertDailyXPlan } from "@/app/lib/note/research/store";
import { buildXGrowthInsight } from "@/app/lib/company/morningBrief/xGrowth";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";
import { parseXPostUrl } from "@/app/lib/note/x/urls";
import { isMorningBriefEvidence, saveMorningBriefEvidence, type MorningBriefEvidence } from "@/app/lib/company/morningBrief/evidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req); if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const store = getExecutionStore();
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const key = `morning-brief:${day}`;
  const completed = await store.getIdempotencyResult("scheduled-notification", key);
  if (completed) {
    if (isMorningBriefEvidence(completed)) await saveMorningBriefEvidence(store, completed);
    return NextResponse.json({ ok: true, deduped: true, day });
  }
  const lease = await store.acquireLease(key, randomUUID(), 120000); if (!lease) return NextResponse.json({ ok: true, deduped: true, day });
  try {
    // A concurrent invocation may have delivered while we waited to acquire the lease.
    const completedAfterLease = await store.getIdempotencyResult("scheduled-notification", key);
    if (completedAfterLease) {
      if (isMorningBriefEvidence(completedAfterLease)) await saveMorningBriefEvidence(store, completedAfterLease);
      return NextResponse.json({ ok: true, deduped: true, day });
    }
    const growthPromise = loadGrowthReviews().then((reviews) => ({ reviews, failed: false })).catch(() => ({ reviews: [], failed: true }));
    const postsPromise = Promise.all([loadSocialDrafts(), loadPerformance(), loadDailyXPlans()]).then(([drafts, performance, plans]) => ({ drafts, records: performance.records, plans })).catch(() => null);
    const [state, home, opportunities, engineeringResponse, growth, posts] = await Promise.all([loadExecutionState(), loadHomeAttention(), loadOpportunities(), getEngineering(), growthPromise, postsPromise]);
    const engineering = engineeringResponse.ok ? await engineeringResponse.json().catch(() => null) : null;
    const notifications = buildNotificationEvents(state, engineering);
    const notifiedFingerprints = (await Promise.all(notifications.map(async (event) => {
      const delivery = await store.getIdempotencyResult<{ status: string }>("notification-delivery", `slack:${event.fingerprint}`);
      return delivery?.status === "SENT" ? event.fingerprint : null;
    }))).filter((value): value is string => value !== null);
    const latestGrowthReview = [...growth.reviews].sort((a, b) => b.measuredThrough.localeCompare(a.measuredThrough))[0];
    const growthInsight = buildXGrowthInsight(latestGrowthReview);
    const unavailable = [...home.unavailable, ...(growth.failed ? ["X Growth"] : latestGrowthReview && !growthInsight ? ["X Growth (stale)"] : [])];
    const yesterday = tokyoDateKey(new Date(Date.now() - 86_400_000));
    const measuredIds = new Set(posts?.records.filter((record) => record.platform === "x").map((record) => record.contentId) ?? []);
    const yesterdayDrafts = (posts?.drafts ?? []).filter((draft) =>
      draft.scheduledAt && tokyoDateKey(new Date(draft.scheduledAt)) === yesterday
    );
    const confirmedPublishedDrafts = yesterdayDrafts.filter((draft) =>
      draft.status === "published" && draft.xPostId && parseXPostUrl(draft.bufferExternalLink ?? "")?.postId === draft.xPostId
    );
    const publishedDrafts = confirmedPublishedDrafts.filter((draft) => measuredIds.has(draft.id));
    const publishedSlots = new Set(publishedDrafts.map((draft) => draft.planSlotId ?? draft.id));
    const yesterdaySlots = (posts?.plans ?? []).filter((plan) => plan.date === yesterday).flatMap((plan) => plan.slots);
    const brief = buildMorningBrief({ notifications, notifiedFingerprints, homeAttention: home.attention, opportunities, insights: growthInsight ? [growthInsight] : [], unavailable: [...unavailable, ...(posts ? [] : ["X投稿数"])], ...(posts ? { xPublishedYesterday: publishedSlots.size } : {}) });
    const baseEvidence: MorningBriefEvidence = {
      briefId: key,
      briefDate: brief.day,
      referencedPostIds: confirmedPublishedDrafts.flatMap((draft) => draft.xPostId ? [draft.xPostId] : []),
      publishedCount: yesterdayDrafts.filter((draft) => draft.status === "published").length,
      successfulPostCount: confirmedPublishedDrafts.length,
      failedPostCount: yesterdaySlots.filter((slot) => ["failed", "ambiguous"].includes(slot.status)).length,
      skippedPostCount: yesterdaySlots.filter((slot) => ["skipped", "missed", "blocked"].includes(slot.status)).length,
      performanceAvailableCount: confirmedPublishedDrafts.filter((draft) => measuredIds.has(draft.id)).length,
      generatedAt: brief.generatedAt,
      status: "GENERATED",
    };
    await saveMorningBriefEvidence(store, baseEvidence);
    const delivery = await sendMorningBrief(brief);
    if (!delivery.ok) {
      await saveMorningBriefEvidence(store, { ...baseEvidence, status: "FAILED" });
      return NextResponse.json({ error: "SLACK_DELIVERY_FAILED" }, { status: 503 });
    }
    const deliveredAt = new Date().toISOString();
    const finalEvidence: MorningBriefEvidence = {
      ...baseEvidence,
      deliveredAt,
      status: brief.unavailable.length > 0 ? "PARTIAL" : "DELIVERED",
    };
    // Delivery idempotency is committed first so an evidence-write failure can never resend Slack.
    // Its result contains the canonical evidence, allowing a later deduped invocation to repair the evidence projection.
    await store.completeIdempotency("scheduled-notification", key, finalEvidence);
    await saveMorningBriefEvidence(store, finalEvidence);
    let canaryRecorded = false;
    const canaryPlan = posts?.plans.find((plan) => plan.origin === "one-time-transport-canary" && plan.date === yesterday && plan.slots.length === 1 && plan.slots[0].status === "scheduled");
    const canarySlot = canaryPlan?.slots[0];
    const lineage = posts?.drafts.filter((draft) => draft.planId === canaryPlan?.id && draft.planSlotId === canarySlot?.id) ?? [];
    if (canaryPlan && canarySlot && lineage.length === 1 && lineage[0].bufferPostId === canarySlot.bufferPostId &&
        lineage[0].xPostId && parseXPostUrl(lineage[0].bufferExternalLink ?? "")?.postId === lineage[0].xPostId &&
        lineage[0].status === "published" && measuredIds.has(lineage[0].id) && publishedSlots.size === 1) {
      try { await upsertDailyXPlan({ ...canaryPlan, canaryResult: "1/3 successful" }); canaryRecorded = true; }
      catch (error) { console.error("[morning-brief] Canary結果の保存に失敗:", error); }
    }
    return NextResponse.json({ ok: true, day, actionRequired: brief.items.length, xPublishedYesterday: brief.xPublishedYesterday ?? null, canaryRecorded });
  } finally { await store.releaseLease(lease); }
}
