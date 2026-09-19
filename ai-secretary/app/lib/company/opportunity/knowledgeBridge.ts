/**
 * Knowledge → Creator Opportunity bridge.
 *
 * 正式Knowledgeをコンテンツ候補へ変換する純粋関数。本文や収益を複製せず、
 * OpportunityにはKnowledge正本への参照と根拠だけを保持する。
 * 公開・Mission開始・外部Actionは行わない。
 */

import type { KnowledgeHit } from "../../knowledge/search";
import type { OrganizationSnapshot } from "../organization";
import { DEPARTMENT_GOAL_MAP } from "../departmentGoals";
import { scoreOpportunity } from "./score";
import {
  opportunityFingerprint,
  type OpportunityEvidence,
  type RevenueOpportunity,
} from "./types";
import type { CreatorDemandEvidence } from "../../content/evidence/types";

export type GenerateKnowledgeOpportunitiesOptions = {
  knowledge: KnowledgeHit[];
  organization: OrganizationSnapshot;
  existing?: RevenueOpportunity[];
  now?: Date;
  demandEvidence?: CreatorDemandEvidence[];
};

const PRESERVED_STATUSES = new Set([
  "SELECTED",
  "RUNNING",
  "VALIDATED",
  "DISMISSED",
  "FAILED",
]);

/** promoted / merged の正式KnowledgeだけをNote候補へ変換する。 */
export function generateCreatorOpportunitiesFromKnowledge(
  options: GenerateKnowledgeOpportunitiesOptions
): RevenueOpportunity[] {
  const nowIso = (options.now ?? new Date()).toISOString();
  const existingByFingerprint = new Map(
    (options.existing ?? []).map((opportunity) => [opportunity.fingerprint, opportunity])
  );

  const mediaAgentIds =
    DEPARTMENT_GOAL_MAP.find((mapping) => mapping.goal === "media")?.agentIds ?? [];
  const mediaAgents = options.organization.agents.filter((agent) =>
    mediaAgentIds.includes(agent.id)
  );
  const requiredAgents = mediaAgents.map((agent) => agent.id);
  const requiredSkills = [...new Set(mediaAgents.flatMap((agent) => agent.skillIds))];

  return options.knowledge
    .filter((asset) => asset.status === "promoted" || asset.status === "merged")
    .map((asset) => {
      const fingerprint = opportunityFingerprint({
        category: "content",
        asset: `knowledge:${asset.id || asset.path}`,
        businessModel: "paid-note",
      });
      const previous = existingByFingerprint.get(fingerprint);
      const demandEvidence = (options.demandEvidence ?? []).filter(
        (item) => item.sourceKnowledgeId === (asset.id || asset.path)
      );
      const observedDemand = demandEvidence.filter(
        (item) => item.status === "OBSERVED" && typeof item.relativeScore === "number"
      );
      const evidence: OpportunityEvidence[] = [
        {
          label: "正式Knowledge",
          value: 1,
          unit: "件",
          source: asset.path,
        },
        {
          label: "Knowledge重要度",
          value: asset.importance,
          unit: "3段階",
          source: "Knowledge frontmatter",
        },
        {
          label: "Knowledgeタグ",
          value: asset.tags.length,
          unit: "件",
          source: "Knowledge frontmatter",
        },
      ];
      const demandScore = observedDemand.length > 0
        ? Math.round(
            observedDemand.reduce((sum, item) => sum + (item.relativeScore ?? 0), 0) /
              observedDemand.length
          )
        : undefined;
      const demandCoverage = demandEvidence.length > 0
        ? Math.round(
            demandEvidence.reduce((sum, item) => sum + item.coveragePct, 0) /
              demandEvidence.length
          )
        : 0;
      const expectedRevenue = {
        known: false as const,
        reason:
          demandEvidence.length > 0
            ? "X需要は観測済みですが販売実績ではないため、収益額へ変換しません"
            : "このKnowledge固有の販売実績・需要Evidenceがないため見積もれません",
      };
      const scored = scoreOpportunity({
        expectedRevenue,
        estimatedEffortMinutes: 90,
        existingAssetMatch: 1,
        automationPotential: 0.6,
        initialCostYen: 0,
        scalability: 0.6,
      });
      // Demandは補助信号。CoverageとEvidence件数で重みを抑え、既存scoreを上書きしない。
      const demandWeight =
        demandScore === undefined
          ? 0
          : (demandCoverage / 100) * Math.min(1, observedDemand.length / 3);
      const rankingScore = Math.round(
        (scored.score + (demandScore ?? 0) * demandWeight) / (1 + demandWeight)
      );
      const creatorDemand =
        options.demandEvidence === undefined && previous?.creatorDemand
          ? previous.creatorDemand
          : {
              status:
                demandScore !== undefined
                  ? ("OBSERVED" as const)
                  : demandEvidence.length > 0
                    ? ("INSUFFICIENT_DATA" as const)
                    : ("UNKNOWN" as const),
              score: demandScore,
              coveragePct: demandCoverage,
              evidenceCount: demandEvidence.length,
              sourcePublishedContentIds: [
                ...new Set(demandEvidence.map((item) => item.sourcePublishedContentId)),
              ],
            };

      return {
        id:
          previous?.id ??
          `opp_${fingerprint.replace(/[^A-Za-z0-9]/g, "_")}`,
        fingerprint,
        title: `「${asset.title}」の知識をNote記事にする`,
        summary: "正式Knowledgeの知見を、読者の課題と再現可能な手順が伝わる記事候補として構成する",
        category: "content" as const,
        sourceKnowledge: {
          id: asset.id || asset.path,
          path: asset.path,
          domain: asset.domain,
          tags: asset.tags,
        },
        evidence,
        expectedRevenue,
        estimatedEffortMinutes: 90,
        requiredAgents,
        requiredSkills,
        existingAssetMatch: 1,
        automationPotential: 0.6,
        score: scored.score,
        scoreBreakdown: scored.breakdown,
        coveragePct: scored.coveragePct,
        creatorDemand,
        rankingScore:
          options.demandEvidence === undefined && previous?.rankingScore !== undefined
            ? previous.rankingScore
            : rankingScore,
        status:
          previous && PRESERVED_STATUSES.has(previous.status)
            ? previous.status
            : "CANDIDATE",
        businessCandidate: false,
        validatedByMissionIds: previous?.validatedByMissionIds ?? [],
        realizedRevenueYen: previous?.realizedRevenueYen ?? 0,
        createdAt: previous?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
    });
}
