/**
 * 工程の進行状況の読み込み — 要件7
 *
 * Vault(fs) に触るのはここだけ。**Server専用**。
 *
 * 型と集計は pipelineTypes.ts にあり、そちらはI/Oを持たないので
 * クライアントコンポーネントからも import できる。
 *
 * ここから pipelineTypes.ts の中身を再exportしない。再exportすると
 * エディタの自動importがこちらを選び、クライアントが fs 依存を巻き込んで
 * ビルドが落ちる。実際に一度落ちてから分離した経緯があるため、
 * 境界は tests/architecture/pipeline-boundary.test.mjs で固定している。
 */

import { loadAgentTasks } from "@/app/lib/agents/store";
import { loadReviewFeed } from "./feed";
import { buildPipeline, type Pipeline } from "./pipelineTypes";

export async function loadPipeline(): Promise<Pipeline> {
  const [feed, tasks] = await Promise.all([loadReviewFeed(), loadAgentTasks()]);
  return buildPipeline(feed.items, tasks);
}
