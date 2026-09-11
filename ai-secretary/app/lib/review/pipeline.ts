/**
 * 工程の進行状況の読み込み — 要件7
 *
 * Vault(fs) に触るのはここだけ。型と集計は pipelineTypes.ts（クライアント可）にある。
 */

import { loadAgentTasks } from "@/app/lib/agents/store";
import { loadReviewFeed } from "./feed";
import { buildPipeline, type Pipeline } from "./pipelineTypes";

export type { Pipeline, PipelineStep } from "./pipelineTypes";
export { STALE_HOURS, isStale, buildPipeline } from "./pipelineTypes";

export async function loadPipeline(): Promise<Pipeline> {
  const [feed, tasks] = await Promise.all([loadReviewFeed(), loadAgentTasks()]);
  return buildPipeline(feed.items, tasks);
}
