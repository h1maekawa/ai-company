import type { CanonicalResearchArtifact, ResearchArtifact } from "../types";
import { isCanonicalArtifact, isFresh } from "./engine";

/**
 * Creator Draft生成へ渡す R&I Artifact の参照（Phase 1: optional）。
 * - TTL内で Evidence のある（VERIFIED / PARTIAL）Creator・Shared Artifactだけを使う
 * - 出典付きFactだけを「使ってよい事実」として渡し、AI解釈は渡さない
 * - 既存のSafety Gate / Fact Gate / REVIEW は変更しない（この文脈は生成の材料にすぎない）
 */
export type CreatorResearchContext = { artifactIds: string[]; block: string };

export function selectCreatorArtifacts(artifacts: ResearchArtifact[] | undefined, now: Date, limit = 2): CanonicalResearchArtifact[] {
  return (artifacts ?? [])
    .filter(isCanonicalArtifact)
    .filter((artifact) => artifact.intelligence.primaryDepartment !== "investment" && artifact.intelligence.status !== "UNVERIFIED" && isFresh(artifact, now))
    .sort((a, b) => Number(b.intelligence.channel === "x") - Number(a.intelligence.channel === "x") || b.intelligence.asOf.localeCompare(a.intelligence.asOf))
    .slice(0, limit);
}

export function buildCreatorResearchContext(artifacts: ResearchArtifact[] | undefined, now = new Date()): CreatorResearchContext | null {
  const selected = selectCreatorArtifacts(artifacts, now);
  if (!selected.length) return null;
  const sections = selected.map((artifact) => {
    const intel = artifact.intelligence;
    const facts = intel.facts.filter((fact) => fact.source.url).slice(0, 6).map((fact) => `- ${fact.statement}（出典: ${fact.source.name ?? "web"} / ${fact.source.fetchedAt.slice(0, 10)}取得）`).join("\n");
    const patterns = [...(intel.snsExt?.formatPatterns ?? []), ...(intel.snsExt?.hooks ?? [])].slice(0, 5).map((line) => `- ${line}`).join("\n");
    return `### ${artifact.topic}（${intel.topicKey} / ${intel.status} / ${intel.asOf.slice(0, 10)}時点）
${facts || "- 出典付きの事実はありません"}${patterns ? `\n反応の良い型（構造の参考）:\n${patterns}` : ""}`;
  }).join("\n\n");
  return {
    artifactIds: selected.map((artifact) => artifact.id),
    block: `## Research & Intelligence（出典付きの事実だけ）
${sections}

**重要**: 上の事実は出典付きのものだけです。ここに無い数値・実績・断定を追加しないでください。型は構造の参考で、他者の文章を写さないでください。`,
  };
}
