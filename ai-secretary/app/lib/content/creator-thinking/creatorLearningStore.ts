/**
 * Creator Learning の Vault ストア（PR-XT2）。
 *
 * 第二Learning Storeではない — CreatorLearningArtifactは既存Learning型（Performance Learning）
 * には無い新規概念であり、ここが唯一の永続化先。content/learning/store.ts（Performance Learning）
 * とは別ファイル・別配列として明確に分離する（section3）。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { CreatorLearningArtifact } from "./creatorLearning";

const PATH = "memory/personal/note/creator-learning.md";

function extractJson(markdown: string): CreatorLearningArtifact[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { artifacts?: CreatorLearningArtifact[] };
    return Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
  } catch {
    return [];
  }
}

function buildMarkdown(artifacts: CreatorLearningArtifact[]): string {
  const human = artifacts
    .slice(-30)
    .map((a) => `- [${a.sourceType}][${a.category}] ${a.observation} → ${a.inferredPreference}（creatorFit: ${a.creatorFit}, confidence: ${a.confidence}, sample: ${a.sampleCount}）`)
    .join("\n");
  return `---
type: creator_learning
entries: ${artifacts.length}
updated: ${new Date().toISOString()}
---

# Creator Learning

前川本人ならどう考える・どう書くかの学習記録です（Performance Learningとは別軸）。
Human FeedbackとCreator Fit、繰り返し観測された挙動から構成されます。
Performance（伸びた/伸びなかった）だけでは「前川らしさ」を判定しません（section2/9）。

${human || "（まだありません）"}

\`\`\`json
${JSON.stringify({ artifacts }, null, 2)}
\`\`\`
`;
}

export async function loadCreatorLearningArtifacts(): Promise<CreatorLearningArtifact[]> {
  try {
    const file = await getVaultFile(PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

const MAX_ENTRIES = 1000;

export async function saveCreatorLearningArtifacts(
  artifacts: CreatorLearningArtifact[]
): Promise<CreatorLearningArtifact[]> {
  const bounded = artifacts.length > MAX_ENTRIES ? artifacts.slice(-MAX_ENTRIES) : artifacts;
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(PATH)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(PATH, buildMarkdown(bounded), sha);
  return bounded;
}

/** 既存id・既存sourceId重複は追加しない（append-onlyだが同一Evidenceからの二重生成を防ぐ） */
export function appendCreatorLearningArtifact(
  existing: CreatorLearningArtifact[],
  artifact: CreatorLearningArtifact
): CreatorLearningArtifact[] {
  const duplicate = existing.some(
    (item) =>
      item.sourceType === artifact.sourceType &&
      item.sourceIds.length === artifact.sourceIds.length &&
      item.sourceIds.every((id, index) => artifact.sourceIds[index] === id)
  );
  if (duplicate) return existing;
  return [...existing, artifact];
}
