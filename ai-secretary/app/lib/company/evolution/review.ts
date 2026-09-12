/**
 * 組織レビューの実行 — v3.1 Phase 3
 *
 * 観測 → 解析 → 提案 → 保存 までを1本にする。
 * ここでも組織は変更しない。提案を作って保存するだけ（§25）。
 *
 * Phase 4 の Daily/Weekly/Monthly Review は、この関数を呼ぶ形になる。
 */

import { loadCompanyEvents } from "../eventStore";
import { buildOrganizationSnapshot } from "../organization";
import { analyzeBottlenecks, type BottleneckReport } from "./bottleneckAnalyzer";
import { analyzePatterns, type PatternAnalysis } from "./patternAnalyzer";
import { buildProposals } from "./proposalEngine";
import { loadProposals, savePatternAnalysis, saveProposals } from "./store";
import { defaultThresholds } from "./thresholds";
import type { OrganizationProposal } from "./proposalTypes";

export type OrganizationReviewResult = {
  analysis: PatternAnalysis;
  bottlenecks: BottleneckReport;
  /** 今回の解析で作られた・更新された提案 */
  proposals: OrganizationProposal[];
  /** CEOへ表示してよいもの */
  visible: OrganizationProposal[];
  /** より軽い手段があるため抑制したもの */
  suppressed: { fingerprint: string; reason: string }[];
  /** 保存したか。データ不足時は保存しない */
  persisted: boolean;
};

export async function runOrganizationReview(
  options: { persist?: boolean; now?: Date } = {}
): Promise<OrganizationReviewResult> {
  const now = options.now ?? new Date();
  const thresholds = defaultThresholds();
  const organization = buildOrganizationSnapshot(now);

  const events = await loadCompanyEvents();
  const analysis = analyzePatterns(events, { thresholds, organization, now });
  const bottlenecks = analyzeBottlenecks(events, { thresholds, organization, now });

  // データ不足のときは提案を作らない（§1 Shadow Mode）
  if (analysis.status === "INSUFFICIENT_DATA") {
    return {
      analysis,
      bottlenecks,
      proposals: [],
      visible: [],
      suppressed: [],
      persisted: false,
    };
  }

  const existing = await loadProposals();
  const { proposals, visible, suppressed } = buildProposals(analysis.patterns, {
    thresholds,
    existing,
    now,
  });

  let persisted = false;
  if (options.persist !== false) {
    await savePatternAnalysis(analysis, now);
    await saveProposals(proposals);
    persisted = true;
  }

  return { analysis, bottlenecks, proposals, visible, suppressed, persisted };
}
