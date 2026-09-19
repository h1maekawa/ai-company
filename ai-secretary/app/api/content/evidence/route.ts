import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, loadPublishedContent } from "@/app/lib/note/research/store";
import { loadLedger } from "@/app/lib/content/monetization/store";
import { latestSnapshotByContent } from "@/app/lib/content/monetization/metrics";
import {
  buildRelationFunnel,
  createDemandEvidence,
} from "@/app/lib/content/evidence/engine";
import {
  appendContentContribution,
  appendContentRelation,
  loadContentEvidence,
} from "@/app/lib/content/evidence/store";
import type {
  ContentContribution,
  ContentRelation,
} from "@/app/lib/content/evidence/types";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [published, performance, ledger, evidence] = await Promise.all([
      loadPublishedContent(),
      loadPerformance(),
      loadLedger(),
      loadContentEvidence(),
    ]);
    const xPublished = published.filter(
      (content) => content.channel === "x" && content.status === "published"
    );
    const latest = latestSnapshotByContent(performance.snapshots ?? []);
    const baseline = xPublished
      .map((content) => latest.get(content.id))
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
    const demandEvidence = xPublished.flatMap((content) => {
      const snapshot = latest.get(content.id);
      return snapshot
        ? [createDemandEvidence({ published: content, snapshot, baselineSnapshots: baseline })]
        : [];
    });
    const funnels = evidence.relations.map((relation) => ({
      relationId: relation.id,
      steps: buildRelationFunnel({
        relation,
        snapshots: performance.snapshots ?? [],
        revenueEvents: ledger.revenueEvents,
      }),
    }));
    return NextResponse.json({ ...evidence, demandEvidence, funnels });
  } catch (error) {
    console.error("[api/content/evidence] GET失敗:", error);
    return NextResponse.json({ error: "Content Evidenceの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = await req.json();
    if (body.kind !== "relation" && body.kind !== "contribution") {
      return NextResponse.json({ error: "kindはrelationまたはcontributionです" }, { status: 400 });
    }
    const kind: "relation" | "contribution" = body.kind;
    const [published, revenueEntries] = await Promise.all([
      loadPublishedContent(),
      loadRevenueEntries(),
    ]);
    const source = published.find((item) => item.id === body.sourcePublishedContentId);
    const target = published.find((item) => item.id === body.targetPublishedContentId);
    if (!source || !target || source.status !== "published" || target.status !== "published") {
      return NextResponse.json(
        { error: "source/targetは正式PublishedContentである必要があります" },
        { status: 400 }
      );
    }
    if (source.id === target.id) {
      return NextResponse.json({ error: "sourceとtargetは別Contentにしてください" }, { status: 400 });
    }

    const validRelationTypes = ["drives_to", "derived_from", "promotes", "tests_demand_for"];
    const relationEvidenceTypes = ["explicit_link", "campaign", "manual", "system"];
    const contributionEvidenceTypes = ["explicit_link", "campaign", "manual"];
    const revenue = revenueEntries.find((entry) => entry.id === body.companyRevenueId);
    const amount = body.attributedAmountYen;
    if (
      kind === "relation" &&
      (!validRelationTypes.includes(body.relationType) ||
        !relationEvidenceTypes.includes(body.evidenceType))
    ) {
      return NextResponse.json({ error: "Relation種別が不正です" }, { status: 400 });
    }
    if (kind === "contribution") {
      if (source.channel !== "x" || target.channel !== "note") {
        return NextResponse.json(
          { error: "Assisted ContributionはPublished XからPublished Noteへの関係に限定します" },
          { status: 400 }
        );
      }
      if (!revenue || revenue.sourceType === "investment") {
        return NextResponse.json({ error: "有効なCreator Revenue IDが必要です" }, { status: 400 });
      }
      if (!contributionEvidenceTypes.includes(body.evidenceType)) {
        return NextResponse.json({ error: "Contribution evidence種別が不正です" }, { status: 400 });
      }
      if (
        amount !== undefined &&
        (body.confirmedByHuman !== true ||
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          amount > revenue.amountYen)
      ) {
        return NextResponse.json(
          { error: "金額配賦には人間確認済みの正の金額が必要です" },
          { status: 400 }
        );
      }
    }

    const idempotencyKey =
      req.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const store = getExecutionStore();
    const namespace = `content-evidence-${kind}`;
    const prior = await store.getIdempotencyResult<Record<string, unknown>>(
      namespace,
      idempotencyKey
    );
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency(namespace, idempotencyKey))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }

    const now = new Date().toISOString();
    let response: Record<string, unknown>;
    if (kind === "relation") {
      const relation: ContentRelation = {
        id: `relation_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        sourcePublishedContentId: source.id,
        targetPublishedContentId: target.id,
        relationType: body.relationType,
        evidenceType: body.evidenceType,
        createdAt: now,
      };
      await appendContentRelation(relation);
      response = { ok: true, relation };
    } else {
      const contribution: ContentContribution = {
        id: `contribution_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        companyRevenueId: revenue!.id,
        sourcePublishedContentId: source.id,
        targetPublishedContentId: target.id,
        contributionType: "assisted",
        evidenceType: body.evidenceType,
        attributedAmountYen: amount,
        confirmedByHuman: body.confirmedByHuman === true,
        createdAt: now,
      };
      await appendContentContribution(contribution);
      response = { ok: true, contribution };
    }
    await store.completeIdempotency(namespace, idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/content/evidence] POST失敗:", error);
    return NextResponse.json({ error: "Content Evidenceの記録に失敗しました" }, { status: 500 });
  }
}
