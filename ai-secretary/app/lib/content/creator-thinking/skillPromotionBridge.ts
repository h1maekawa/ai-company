/**
 * Creator Learning → SkillCandidate のブリッジ（X Creator Thinking Model / PR-XT2）。
 *
 * 第二Skill Storeは作らない。既存の company/evolution/skillCandidates.ts の
 * SkillCandidate型・ExecutionState.skillCandidates配列へ、departmentId:"creator"として
 * 書き込む（deriveXSkillCandidatesFromCeoFeedback と同じStoreを共有する）。
 *
 * ここで作るCandidateは他のSkillCandidate同様、常に
 * executable/engineeringRequestAllowed/registryMutationAllowed = false。
 */

import { createHash } from "node:crypto";
import type { SkillCandidate, SkillImpactLabel } from "../../company/evolution/skillCandidates";
import type { CreatorLearningArtifact, CreatorLearningCategory } from "./creatorLearning";

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);

/** HUMAN_FEEDBACK/CREATOR_FIT/REPEATED_BEHAVIORのみを昇格候補の材料にする。PERFORMANCE単体は対象外（section9） */
const ELIGIBLE_SOURCE_TYPES: CreatorLearningArtifact["sourceType"][] = [
  "HUMAN_FEEDBACK",
  "CREATOR_FIT",
  "REPEATED_BEHAVIOR",
];

/** グループ内のcreatorFitを保守的に合成する。混在（HIGHとLOWの両方）はUNKNOWNにする（推測で寄せない） */
function aggregateCreatorFit(group: CreatorLearningArtifact[]): SkillImpactLabel {
  const labels = new Set(group.map((item) => item.creatorFit));
  if (labels.size === 1) return [...labels][0];
  return "UNKNOWN";
}

function groupKey(category: CreatorLearningCategory): string {
  return `creator|${category}`;
}

/**
 * CreatorLearningArtifactをcategory単位でグルーピングし、既存SkillCandidateへ投影・更新する。
 * 新規候補はPROPOSEDとして追加し、既存候補は証跡（evidenceCount/sampleCount/creatorFit）のみ更新する
 * （statusがPROPOSED以外＝既にHuman Reviewを経たものは上書きしない）。
 */
export function deriveCreatorSkillCandidatesFromLearning(
  artifacts: CreatorLearningArtifact[],
  existing: SkillCandidate[],
  now = new Date()
): SkillCandidate[] {
  const eligible = artifacts.filter((item) => ELIGIBLE_SOURCE_TYPES.includes(item.sourceType));
  const grouped = new Map<string, CreatorLearningArtifact[]>();
  for (const artifact of eligible) {
    const key = groupKey(artifact.category);
    grouped.set(key, [...(grouped.get(key) ?? []), artifact]);
  }

  const candidates = [...existing];
  const observedAt = now.toISOString();

  for (const [signature, group] of grouped) {
    const id = `skill_candidate_${hash(signature)}`;
    const sampleCount = group.reduce((sum, item) => sum + item.sampleCount, 0);
    const evidenceRefs = [...new Set(group.flatMap((item) => item.evidenceRefs))];
    const creatorFit = aggregateCreatorFit(group);
    const category = group[0].category;

    const current = candidates.find((item) => item.id === id);
    if (current) {
      // Human Reviewを経たもの（PROPOSED以外）は証跡を書き換えない。再提案はしない
      if (current.status !== "PROPOSED") continue;
      Object.assign(current, {
        sourceKnowledgeIds: evidenceRefs,
        usageCount: sampleCount,
        sampleCount,
        evidenceCount: evidenceRefs.length,
        creatorFit,
        updatedAt: observedAt,
        lastObservedAt: observedAt,
      });
      continue;
    }

    const first = group[0];
    const candidate: SkillCandidate = {
      id,
      patternSignature: signature,
      name: `creator-${category.toLowerCase()}-${hash(signature).slice(0, 8)}`,
      purpose: first.inferredPreference,
      departmentId: "creator",
      sourceMissionIds: [],
      sourceKnowledgeIds: evidenceRefs,
      repeatedSteps: [`creator-${category.toLowerCase()}-preference`],
      usageCount: sampleCount,
      suggestedAgents: ["creator-content"],
      suggestedCategory: "generation",
      inputDescription: "Creator Learning Artifact（Human Feedback / Creator Fit由来）の集約",
      outputDescription: "Creator Thinking Modelへ反映可能なSoft Skill提案（非実行）",
      reason: `${category}で${group.length}件のCreator Learning Evidenceが集まった`,
      existingSimilarSkillIds: [],
      status: "PROPOSED",
      createdAt: observedAt,
      updatedAt: observedAt,
      lastObservedAt: observedAt,
      executable: false,
      engineeringRequestAllowed: false,
      registryMutationAllowed: false,
      creatorFit,
      sampleCount,
      evidenceCount: evidenceRefs.length,
    };
    candidates.push(candidate);
  }

  return candidates;
}
