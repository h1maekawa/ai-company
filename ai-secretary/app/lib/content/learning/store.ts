/**
 * Learning / Next Content Engine の Vault ストア。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { ContentPlan, ContentRecommendation, Learning } from "./types";

const ROOT = "memory/personal/note";

export const LEARNING_PATHS = {
  learnings: `${ROOT}/learnings.md`,
  recommendations: `${ROOT}/content-recommendations.md`,
  plans: `${ROOT}/content-plans.md`,
} as const;

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await getVaultFile(path);
    return extractJson<T>(file.content || "");
  } catch {
    return null;
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

function buildDoc(title: string, note: string, humanBody: string, data: unknown): string {
  return `---
type: ${title}
updated: ${new Date().toISOString()}
---

# ${title}

${note}

${humanBody}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

/* ─── Learning ─────────────────────────────────────────── */

export type LearningFile = { learnings: Learning[] };

export async function loadLearnings(): Promise<Learning[]> {
  const data = await readJson<LearningFile>(LEARNING_PATHS.learnings);
  return Array.isArray(data?.learnings) ? data.learnings : [];
}

export async function saveLearnings(learnings: Learning[]): Promise<Learning[]> {
  const human = learnings
    .slice(0, 30)
    .map((l) => `- [${l.status}] ${l.period}: ${l.observation}\n  → ${l.interpretation}`)
    .join("\n") || "（まだありません）";
  await write(
    LEARNING_PATHS.learnings,
    buildDoc(
      "note_learnings",
      "Observation（観測事実）とInterpretation（解釈）を分離して記録します。AIの推論は本人承認までcandidateのままです。",
      human,
      { learnings }
    )
  );
  return learnings;
}

/* ─── Content Recommendation ─────────────────────────────── */

export type RecommendationFile = { recommendations: ContentRecommendation[] };

export async function loadRecommendations(): Promise<ContentRecommendation[]> {
  const data = await readJson<RecommendationFile>(LEARNING_PATHS.recommendations);
  return Array.isArray(data?.recommendations) ? data.recommendations : [];
}

export async function saveRecommendations(
  recommendations: ContentRecommendation[]
): Promise<ContentRecommendation[]> {
  const human = recommendations
    .slice(0, 30)
    .map((r) => `- [${r.status}][${r.channel}] ${r.topic} — ${r.reason}`)
    .join("\n") || "（まだありません）";
  await write(
    LEARNING_PATHS.recommendations,
    buildDoc(
      "note_content_recommendations",
      "Learningから導いた次の投稿候補です。採用（selected）した時点でArticleSession/X Draftを作成します。",
      human,
      { recommendations }
    )
  );
  return recommendations;
}

/* ─── Content Plan ─────────────────────────────────────────── */

export type PlanFile = { plans: ContentPlan[] };

export async function loadContentPlans(): Promise<ContentPlan[]> {
  const data = await readJson<PlanFile>(LEARNING_PATHS.plans);
  return Array.isArray(data?.plans) ? data.plans : [];
}

export async function saveContentPlans(plans: ContentPlan[]): Promise<ContentPlan[]> {
  const human = plans
    .slice(0, 30)
    .map((p) => `- [${p.status}][${p.channel}] ${p.topic}${p.plannedDate ? `（${p.plannedDate}）` : ""}`)
    .join("\n") || "（まだありません）";
  await write(
    LEARNING_PATHS.plans,
    buildDoc(
      "note_content_plans",
      "Content Calendarです。Timeboxへの制作予定追加はoptionalな操作で、ここでの計画自体はTimebox無しで完結します。",
      human,
      { plans }
    )
  );
  return plans;
}
