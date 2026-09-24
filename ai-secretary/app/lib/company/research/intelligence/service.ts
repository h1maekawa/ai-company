import { callAI, type AIProvider } from "../../../ai/client";
import { captureKnowledgeCandidate } from "../../../knowledge/captureService";
import { executionTransaction } from "../../execution/transaction";
import { loadExecutionState, saveExecutionState } from "../../execution/store";
import { dedupeResearch, retainResearchArtifacts, withinRuntimeBudget } from "../platform";
import { createWebSearchProvider } from "../webProvider";
import type { CanonicalResearchArtifact, IntelligenceArtifact, ResearchRoutingResult } from "../types";
import { classifyResearch } from "./routing";
import { isCanonicalArtifact, runResearchIntelligence } from "./engine";

/**
 * H: classification / provider search / synthesis / save / knowledge capture を含む
 * request全体の期限。既存の withinRuntimeBudget（timeout wrapper）を再利用し、新Runtimeは作らない。
 * route maxDuration（120s）より短くし、Vercel 504を正常な制御手段にしない。
 */
export const REQUEST_DEADLINE_MS = 100_000;

/**
 * Interactive Research（User → Executive Router → R&I）の入口。
 * - 保存先は既存 Execution Store の runtime.researchArtifacts / researchItems（新しいDBは作らない）
 * - Research実行中は Execution Store をロックせず、保存時だけ transaction を取る
 * - Knowledge は既存 Capture Pipeline（Inbox → 人間のReview → Canonical）へ入れるだけ。正式Knowledgeにはしない
 * - Scheduled Research（department-research cron）はこの経路を通さない
 */
export type InteractiveResearchResult = { routing: ResearchRoutingResult; artifact: CanonicalResearchArtifact; reused: boolean; refreshed: boolean };

const KNOWLEDGE_DOMAIN: Record<IntelligenceArtifact["primaryDepartment"], string> = { investment: "investment", shared: "investment", creator: "content" };

export function canonicalArtifacts(artifacts: Array<{ intelligence?: unknown }> | undefined): CanonicalResearchArtifact[] {
  return (artifacts ?? []).filter(isCanonicalArtifact);
}

/** 再利用価値が高くEvidenceのあるもの（VERIFIED）だけをCandidate化する。全Researchは入れない */
function shouldCaptureKnowledge(artifact: CanonicalResearchArtifact, previous: CanonicalResearchArtifact | undefined): boolean {
  return artifact.intelligence.status === "VERIFIED" && artifact.intelligence.facts.length >= 3 && !previous?.intelligence.knowledgeCapture?.path;
}

function knowledgeContent(artifact: CanonicalResearchArtifact): string {
  const intel = artifact.intelligence;
  const facts = intel.facts.filter((fact) => fact.source.url).slice(0, 20).map((fact) => `- ${fact.statement}（${fact.source.name ?? "source"} ${fact.source.url} / ${fact.source.reliability} / fetched ${fact.source.fetchedAt.slice(0, 10)}）`).join("\n");
  return `domain: ${KNOWLEDGE_DOMAIN[intel.primaryDepartment]}
topic_key: ${intel.topicKey}
research_artifact: ${artifact.id}
as_of: ${intel.asOf}

# ${artifact.topic}

## Facts（出典付き）
${facts}

## Interpretation（AI解釈・未確定）
${intel.interpretation.map((line) => `- ${line}`).join("\n") || "- なし"}

## Unknowns
${intel.unknowns.slice(0, 10).map((line) => `- ${line}`).join("\n") || "- なし"}`;
}

export async function runInteractiveResearch(input: { question: string; provider?: AIProvider; now?: Date }): Promise<InteractiveResearchResult> {
  const question = input.question.trim().slice(0, 1000);
  if (!question) throw new Error("QUESTION_REQUIRED");
  const now = input.now ?? new Date();
  const deadlineAt = now.getTime() + REQUEST_DEADLINE_MS;
  const state = await loadExecutionState();
  const existing = canonicalArtifacts(state.runtime?.researchArtifacts);
  const recentKeys = [...new Set(existing.slice().sort((a, b) => b.intelligence.asOf.localeCompare(a.intelligence.asOf)).map((artifact) => artifact.intelligence.topicKey))].slice(0, 50);
  const rawLlm = (message: string, systemPrompt: string) => callAI(message, systemPrompt, { provider: input.provider, responseFormat: "json" });
  // 分類・合成のどちらのLLM呼び出しも、request全体deadlineの残り時間でtimeoutする
  const llm = (message: string, systemPrompt: string) => withinRuntimeBudget(rawLlm(message, systemPrompt), Math.max(1, deadlineAt - Date.now()));

  // LLM分類は1回だけ（timeoutしてもclassifyResearch内部でtheme-researchへ安全側fallbackする）。以降は決定的
  const routing = await classifyResearch(question, recentKeys, llm);
  const web = createWebSearchProvider();
  const result = await runResearchIntelligence({ routing, question, artifacts: existing, deps: { search: (query) => web.search(query), synthesize: llm, now, deadlineAt } });
  if (result.reused) return { routing, ...result };

  const previous = existing.find((artifact) => artifact.id === result.artifact.id);
  let artifact = result.artifact;
  // deadlineを過ぎていたらKnowledge Captureは行わない（非必須の処理でrequestを長引かせない）
  if (Date.now() < deadlineAt && shouldCaptureKnowledge(artifact, previous)) {
    const capture = await captureKnowledgeCandidate({ content: knowledgeContent(artifact), source: "research", title: `${artifact.topic}（${artifact.intelligence.playbookId}）`, organize: false });
    artifact = { ...artifact, intelligence: { ...artifact.intelligence, knowledgeCapture: capture.ok ? { status: capture.status ?? "captured", path: capture.path } : { status: "failed", reason: capture.error } } };
  } else if (previous?.intelligence.knowledgeCapture) {
    artifact = { ...artifact, intelligence: { ...artifact.intelligence, knowledgeCapture: previous.intelligence.knowledgeCapture } };
  }

  await executionTransaction(async () => {
    const latest = await loadExecutionState();
    const runtime = latest.runtime ?? { runs: {}, executions: [], artifacts: [], learning: [] };
    const artifacts = retainResearchArtifacts([...(runtime.researchArtifacts ?? []).filter((item) => item.id !== artifact.id), artifact]);
    const items = dedupeResearch(runtime.researchItems ?? [], result.items).items;
    await saveExecutionState({ ...latest, runtime: { ...runtime, researchArtifacts: artifacts, researchItems: items } });
  });
  return { routing, artifact, reused: false, refreshed: result.refreshed };
}

/** Chat返信用の短い要約（Fact / 解釈 / 未確認を分けて表示する） */
export function formatResearchReply(result: InteractiveResearchResult): string {
  const intel = result.artifact.intelligence;
  const header = result.reused
    ? `${intel.asOf.slice(0, 10)}時点の既存Researchを再利用しました（${intel.playbookId} / ${intel.status}）。`
    : `${intel.playbookId} を実行しました（${intel.status}${result.refreshed ? "・既存Researchを更新" : ""}）。`;
  const sections = intel.sections.slice(0, 6).map((section) => `- ${section.step}: ${section.summary}`).join("\n");
  const facts = intel.facts.filter((fact) => fact.source.url).slice(0, 5).map((fact) => `- ${fact.statement}（${fact.source.name ?? "source"}, ${fact.source.reliability}）`).join("\n");
  return `【Research & Intelligence】${result.artifact.topic}（${intel.topicKey}）
${header}
解釈: ${result.routing.assumption}

## 要約
${sections || "- Evidenceから整理できたstepはありません"}

## 出典付きFact
${facts || "- 出典付きのFactはありません（UNVERIFIED）"}

## AIの解釈（未確定）
${intel.interpretation.slice(0, 4).map((line) => `- ${line}`).join("\n") || "- なし"}

## 未確認
${intel.unknowns.slice(0, 5).map((line) => `- ${line}`).join("\n") || "- なし"}

※ これはResearchです。売買判断・外部公開は行いません。`;
}
