/**
 * 既存パイプラインと役割の対応 — 要件3「役割分割の明文化」
 *
 * 方針: 実装は分解しない。
 *   runDailyXAutomation は既にリサーチ→生成→ゲート→予約を一気通貫で実行しており、
 *   役割ごとに独立した実行処理を別に作ると同じ処理が二重に存在することになる。
 *   ここでは既存の各ステップに役割のラベルを与え、
 *   タスクログ（要件1）と進行状況（要件7）から「誰が何をやったか」を追えるようにする。
 *
 * この表が役割分担の正。コードを変えたらここも直すこと。
 */

import type { AgentRole } from "./types";

export type PipelineStepDefinition = {
  /** 安定したID。タスクログの突き合わせに使うため変更しない */
  id: string;
  role: AgentRole;
  label: string;
  /** 実際にこの工程を行っているコード。読み手が実装へ辿れるようにする */
  implementation: string;
  /** 人間承認を経ないと次へ進めないか */
  requiresApproval: boolean;
};

export const PIPELINE_STEPS: PipelineStepDefinition[] = [
  {
    id: "market.intake",
    role: "market",
    label: "市況・案件の取り込み",
    implementation: "app/lib/agents/market.ts runMarketIntake",
    requiresApproval: false,
  },
  {
    id: "research.collect",
    role: "research",
    label: "トレンド収集とクラスタ化",
    implementation: "app/lib/note/research/run.ts runResearch",
    requiresApproval: false,
  },
  {
    id: "research.select",
    role: "research",
    label: "本日の候補クラスタ選定",
    implementation: "app/lib/note/automation/dailyX.ts（候補スコアリング）",
    requiresApproval: false,
  },
  {
    id: "writer.generate",
    role: "writer",
    label: "投稿案の生成",
    implementation: "app/lib/note/research/generate.ts generateXPosts",
    requiresApproval: false,
  },
  {
    id: "fact_check.gate",
    role: "fact_check",
    label: "Safety/Factゲート",
    implementation: "app/lib/note/safetyRepair.ts prepareXDraftForPublishing",
    requiresApproval: false,
  },
  {
    id: "publisher.schedule",
    role: "publisher",
    label: "Bufferへの予約",
    implementation: "app/lib/note/publishing/buffer.ts createPost",
    // 承認フィードを通ったものだけが予約される（要件2・要件10）
    requiresApproval: true,
  },
];

export function findPipelineStep(id: string): PipelineStepDefinition | undefined {
  return PIPELINE_STEPS.find((step) => step.id === id);
}

/**
 * 現時点で自動パイプラインに対応するステップを持たない役割。
 *
 * seo は、タイトル・見出しの最適化が generateXPosts の中に含まれており
 * 独立した工程になっていない。note記事側で独立させるときにここから外す。
 * 「実装されているつもり」で放置しないよう、明示的に残しておく。
 */
export const ROLES_WITHOUT_PIPELINE_STEP: AgentRole[] = ["seo"];
