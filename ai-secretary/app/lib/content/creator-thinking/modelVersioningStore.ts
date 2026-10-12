/**
 * Creator Thinking Model Versioning の Vault ストア（PR-XT2）。
 *
 * 保存対象:
 *  - versions: CreatorThinkingModelの全バージョン履歴（DRAFT/ACTIVE/DEPRECATED混在、常に1つだけACTIVE）
 *  - changeCandidates: ModelChangeCandidateのキュー（Human Review待ち・判断済み）
 *  - history: activateModelVersion/rollbackModelVersionが返すCreatorThinkingModelVersionRecordの履歴
 *
 * 第二Learning/Skill Storeではない。Creator Thinking Model自体のバージョン管理専用の新規Storeで、
 * XT1には存在しなかった（XT1はcontractの形とDRAFT初期値のみ）。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { CreatorThinkingModel } from "./types";
import type { CreatorThinkingModelVersionRecord, ModelChangeCandidate } from "./modelVersioning";

const VERSIONS_PATH = "memory/personal/note/creator-thinking-model-versions.md";
const CHANGE_CANDIDATES_PATH = "memory/personal/note/creator-thinking-model-change-candidates.md";

function extractJson<T>(markdown: string, key: string): T[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as Record<string, T[] | undefined>;
    return Array.isArray(parsed[key]) ? (parsed[key] as T[]) : [];
  } catch {
    return [];
  }
}

async function write(path: string, markdown: string): Promise<void> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(path, markdown, sha);
}

/* ─── Model Versions + History ─────────────────────────── */

export type ModelVersionsFile = {
  versions: CreatorThinkingModel[];
  history: CreatorThinkingModelVersionRecord[];
};

export async function loadModelVersions(): Promise<ModelVersionsFile> {
  try {
    const file = await getVaultFile(VERSIONS_PATH);
    const content = file.content || "";
    return {
      versions: extractJson<CreatorThinkingModel>(content, "versions"),
      history: extractJson<CreatorThinkingModelVersionRecord>(content, "history"),
    };
  } catch {
    return { versions: [], history: [] };
  }
}

export async function saveModelVersions(data: ModelVersionsFile): Promise<ModelVersionsFile> {
  const active = data.versions.find((model) => model.status === "ACTIVE");
  const human = data.versions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((model) => `- [${model.status}] v${model.version}（updated: ${model.updatedAt}）`)
    .join("\n");
  const markdown = `---
type: creator_thinking_model_versions
updated: ${new Date().toISOString()}
---

# Creator Thinking Model — Version History

現在のACTIVE: ${active ? `v${active.version}` : "（なし。全てDRAFT/DEPRECATED）"}
同時にACTIVEになれるのは常に1つだけです。

${human || "（まだありません）"}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
  await write(VERSIONS_PATH, markdown);
  return data;
}

/* ─── Model Change Candidate ───────────────────────────── */

export async function loadModelChangeCandidates(): Promise<ModelChangeCandidate[]> {
  try {
    const file = await getVaultFile(CHANGE_CANDIDATES_PATH);
    return extractJson<ModelChangeCandidate>(file.content || "", "changeCandidates");
  } catch {
    return [];
  }
}

export async function saveModelChangeCandidates(
  changeCandidates: ModelChangeCandidate[]
): Promise<ModelChangeCandidate[]> {
  const pending = changeCandidates.filter((c) => c.status === "PENDING_REVIEW");
  const human = changeCandidates
    .slice(-20)
    .map((c) => `- [${c.status}] v${c.baseVersion}→v${c.proposedVersion} ${c.targetRule}（${c.changeType}）: ${c.reason}`)
    .join("\n");
  const markdown = `---
type: creator_thinking_model_change_candidates
updated: ${new Date().toISOString()}
---

# Creator Thinking Model — Change Candidates

Human Review待ち: ${pending.length}件

${human || "（まだありません）"}

\`\`\`json
${JSON.stringify({ changeCandidates }, null, 2)}
\`\`\`
`;
  await write(CHANGE_CANDIDATES_PATH, markdown);
  return changeCandidates;
}
