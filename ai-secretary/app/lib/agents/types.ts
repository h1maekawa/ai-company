/**
 * 専門エージェントの役割とタスク — 要件1 / 要件3
 *
 * 要件3が求める役割分割を、note・A8.net側にも適用できる形で型にする。
 * 既存の Executive Router は「どの秘書が答えるか」を決めるだけで、
 * 「誰が何をやるか」というタスクは持っていなかった。ここがその不足分。
 *
 * 工程（ReviewPhase）との対応を型で固定しているのは、
 * 要件10のフェーズ別承認と要件7のステップ表示が同じ語彙を使うため。
 */

import type { ReviewPhase } from "@/app/lib/review/types";

export type AgentRole =
  | "market"
  | "research"
  | "fact_check"
  | "writer"
  | "seo"
  | "publisher";

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  market: "市場・案件調査",
  research: "リサーチ",
  fact_check: "ファクトチェック",
  writer: "執筆",
  seo: "SEO最適化",
  publisher: "投稿",
};

export const AGENT_ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  market: "市況・A8案件・収益機会を調べる",
  research: "トレンドと参考情報を集め、候補を作る",
  fact_check: "投資情報の数値と出典を裏取りする",
  writer: "本人の文体で原稿を書く",
  seo: "タイトル・見出し・タグを最適化する",
  publisher: "人間承認を経てから投稿する",
};

/** 役割 → 工程。承認設定とステップ表示はこの対応を正とする */
export function phaseOfRole(role: AgentRole): ReviewPhase {
  switch (role) {
    case "market":
    case "research":
    case "fact_check":
      return "research";
    case "writer":
      return "writing";
    case "seo":
      return "seo";
    case "publisher":
      return "publish";
  }
}

/**
 * publisher だけは人間承認の後にしか動かない（要件3）。
 * 自動承認（要件10）で工程がスキップされた場合も、
 * 「承認された」という事実は必ず経由する。
 */
export function requiresApprovalBeforeRun(role: AgentRole): boolean {
  return role === "publisher";
}

export type AgentTaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type AgentTask = {
  id: string;
  role: AgentRole;
  phase: ReviewPhase;
  /** 何をするか（チャットの指示をそのまま残す） */
  instruction: string;
  /** Routerが解釈した意図 */
  intent: string;
  status: AgentTaskStatus;
  /** どのチャットから生まれたか。タスクログとして辿れるようにする */
  sourceChat?: { secretaryId: string; message: string; at: string };
  /** 実行結果の要約。まだ実行していなければ null */
  result?: string | null;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export function createAgentTask(input: {
  role: AgentRole;
  instruction: string;
  intent: string;
  sourceChat?: AgentTask["sourceChat"];
  now?: Date;
}): AgentTask {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: `at${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    role: input.role,
    phase: phaseOfRole(input.role),
    instruction: input.instruction,
    intent: input.intent,
    status: "queued",
    sourceChat: input.sourceChat,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}
