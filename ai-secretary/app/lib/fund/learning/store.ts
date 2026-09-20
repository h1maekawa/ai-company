import { getVaultFile, saveVaultFile } from "../../vault";
import type {
  InvestmentDecisionOutcome,
  InvestmentLearning,
  InvestmentLearningDecision,
} from "./types";
export { effectiveInvestmentLearnings } from "./engine";

const PATHS = {
  outcomes: "memory/personal/fund/decision-outcomes.md",
  learnings: "memory/personal/fund/investment-learnings.md",
  learningDecisions: "memory/personal/fund/investment-learning-decisions.md",
} as const;

function extractJsonBlock<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try { return JSON.parse(match[1]) as T; } catch { return null; }
}

async function readList<T>(path: string): Promise<{ list: T[]; sha?: string }> {
  try {
    const file = await getVaultFile(path);
    const data = extractJsonBlock<T[]>(file.content || "");
    return { list: Array.isArray(data) ? data : [], sha: file.sha };
  } catch { return { list: [] }; }
}

async function appendRecord<T>(
  path: string,
  title: string,
  description: string,
  record: T
): Promise<T> {
  const { list, sha } = await readList<T>(path);
  const next = [record, ...list];
  const markdown = `---\ntype: fund_store\nupdated: ${new Date().toISOString().slice(0, 10)}\n---\n\n# ${title}\n\n${description}\n\n\`\`\`json\n${JSON.stringify(next, null, 2)}\n\`\`\`\n`;
  await saveVaultFile(path, markdown, sha);
  return record;
}

export async function loadDecisionOutcomes(): Promise<InvestmentDecisionOutcome[]> {
  return (await readList<InvestmentDecisionOutcome>(PATHS.outcomes)).list;
}

export async function appendDecisionOutcome(
  outcome: InvestmentDecisionOutcome
): Promise<InvestmentDecisionOutcome> {
  return appendRecord(
    PATHS.outcomes,
    "Fund OS — Decision Outcome Observations",
    "判断後の価格・仮説Observation。実現損益や取引台帳ではない。追記専用。",
    outcome
  );
}

export async function loadLearningCandidates(): Promise<InvestmentLearning[]> {
  return (await readList<InvestmentLearning>(PATHS.learnings)).list;
}

export async function appendLearningCandidate(
  learning: InvestmentLearning
): Promise<InvestmentLearning> {
  if (learning.status !== "candidate") throw new Error("LEARNING_MUST_START_AS_CANDIDATE");
  return appendRecord(
    PATHS.learnings,
    "Fund OS — Investment Learning Candidates",
    "AI解釈の候補。人間承認なしにRecommendationやFund Policyへ反映しない。追記専用。",
    learning
  );
}

export async function loadLearningDecisions(): Promise<InvestmentLearningDecision[]> {
  return (await readList<InvestmentLearningDecision>(PATHS.learningDecisions)).list;
}

export async function appendLearningDecision(
  decision: InvestmentLearningDecision
): Promise<InvestmentLearningDecision> {
  return appendRecord(
    PATHS.learningDecisions,
    "Fund OS — Investment Learning Human Decisions",
    "Learning Candidateに対する本人承認・却下の監査ログ。Policyは自動変更しない。",
    decision
  );
}
