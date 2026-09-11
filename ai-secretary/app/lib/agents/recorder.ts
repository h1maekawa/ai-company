/**
 * 自動パイプラインの実行記録 — 要件3
 *
 * 既存の各ステップが動いたことを、役割付きのタスクとして残す。
 * 実装は分解していないので、ここは「誰が何をやったか」の記録係に徹する。
 *
 * 重要: 記録が落ちても本処理は止めない。
 *   ログのためにその日の投稿が止まる、という事態を避ける。
 */

import { appendAgentTask, loadAgentTasks, saveAgentTasks } from "./store";
import { findPipelineStep } from "./pipelineRoles";
import { createAgentTask, type AgentTaskStatus } from "./types";

export type RecordStepInput = {
  /** PIPELINE_STEPS のID */
  stepId: string;
  status: Extract<AgentTaskStatus, "done" | "failed">;
  /** 何をしたかの短い要約。一覧にそのまま出る */
  result?: string;
  failureReason?: string;
  now?: Date;
};

/**
 * 自動ステップ1件を記録する。
 * 未知のstepIdは黙って捨てる（対応表に無いものを記録すると追跡できなくなる）。
 */
export async function recordPipelineStep(input: RecordStepInput): Promise<void> {
  const step = findPipelineStep(input.stepId);
  if (!step) {
    console.error("[agents/recorder] 未知のstepId:", input.stepId);
    return;
  }

  try {
    await appendAgentTask(
      createAgentTask({
        role: step.role,
        instruction: step.label,
        intent: `自動パイプライン: ${step.implementation}`,
        origin: "automation",
        stepId: step.id,
        status: input.status,
        result: input.result ?? null,
        failureReason: input.failureReason,
        now: input.now,
      })
    );
  } catch (error) {
    console.error("[agents/recorder] 記録に失敗:", error);
  }
}

/**
 * 同じ実行内の複数ステップをまとめて記録する。
 * 1件ずつ append するとVaultへの書き込みが増えるため、まとめて1回で保存する。
 */
export async function recordPipelineSteps(inputs: RecordStepInput[]): Promise<void> {
  const valid = inputs
    .map((input) => ({ input, step: findPipelineStep(input.stepId) }))
    .filter((entry): entry is { input: RecordStepInput; step: NonNullable<ReturnType<typeof findPipelineStep>> } =>
      Boolean(entry.step)
    );
  if (valid.length === 0) return;

  try {
    const tasks = await loadAgentTasks();
    for (const { input, step } of valid) {
      tasks.push(
        createAgentTask({
          role: step.role,
          instruction: step.label,
          intent: `自動パイプライン: ${step.implementation}`,
          origin: "automation",
          stepId: step.id,
          status: input.status,
          result: input.result ?? null,
          failureReason: input.failureReason,
          now: input.now,
        })
      );
    }
    await saveAgentTasks(tasks);
  } catch (error) {
    console.error("[agents/recorder] まとめ記録に失敗:", error);
  }
}
