/**
 * Morning Planning のVaultストア。
 * 1日1ファイル `memory/personal/planning/YYYY-MM-DD.md` に
 * 「人間可読Markdown＋末尾jsonブロック」形式で保存する（fund/store.ts と同じ流儀）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  DailyPlan,
  PlanTask,
  TimeBlock,
  emptyPlan,
  formatDuration,
  BUCKETS,
  categoryOf,
} from "./types";

const PLANNING_DIR = "memory/personal/planning";

function pathFor(date: string): string {
  return `${PLANNING_DIR}/${date}.md`;
}

function extractJsonBlock<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function stars(priority: number): string {
  return "★".repeat(priority) + "☆".repeat(5 - priority);
}

/** Vaultに残る内容そのものが「その日の行動記録」として読めるようにする */
function buildMarkdown(plan: DailyPlan): string {
  const doneCount = plan.tasks.filter((t) => t.done).length;
  const totalMinutes = plan.tasks.reduce((sum, t) => sum + t.minutes, 0);
  const workCount = plan.tasks.filter((t) => t.category === "work").length;
  const lifeCount = plan.tasks.filter((t) => t.category === "life").length;

  const taskLines = BUCKETS.flatMap((bucket) => {
    const tasks = plan.tasks.filter((t) => t.bucket === bucket.id);
    if (tasks.length === 0) return [];
    return [
      ``,
      `### ${bucket.label}`,
      ...tasks.map((t) => {
        const cat = categoryOf(t.category);
        const label = cat ? `${cat.icon}${cat.label}・` : "";
        return `- [${t.done ? "x" : " "}] ${t.title}（${label}${t.minutes}分・${stars(t.priority)}）`;
      }),
    ];
  });

  const blockLines =
    plan.blocks.length === 0
      ? ["", "（まだ生成されていません）"]
      : plan.blocks.map((b) => {
          const cat = categoryOf(b.category);
          return `- ${b.start}〜${b.end} ${cat ? `${cat.icon} ` : ""}${b.title}`;
        });

  return `---
type: daily_plan
date: ${plan.date}
tasks: ${plan.tasks.length}
done: ${doneCount}
planned: ${formatDuration(totalMinutes)}
updated: ${plan.updatedAt}
---

# ${plan.date} の行動設計

稼働 ${plan.workStart}〜${plan.workEnd}（休憩 ${plan.breakStart}〜${plan.breakEnd}）
${plan.tasks.length}件 / 完了 ${doneCount}件 / 予定 ${formatDuration(totalMinutes)}
💼仕事 ${workCount}件 ・ 🏠生活 ${lifeCount}件
${plan.syncedAt ? `Googleカレンダー同期済み: ${plan.syncedAt}` : ""}

## やること
${taskLines.join("\n")}

## タイムブロッキング
${blockLines.join("\n")}

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`;
}

export async function loadPlan(date: string): Promise<DailyPlan> {
  try {
    const file = await getVaultFile(pathFor(date));
    const parsed = extractJsonBlock<DailyPlan>(file.content || "");
    if (parsed && Array.isArray(parsed.tasks)) {
      // 後方互換: 欠けたフィールドは既定値で補う
      return { ...emptyPlan(date), ...parsed, date };
    }
  } catch {
    // 未作成の日は空のプランを返す
  }
  return emptyPlan(date);
}

export async function savePlan(plan: DailyPlan): Promise<DailyPlan> {
  const next: DailyPlan = { ...plan, updatedAt: new Date().toISOString() };
  let sha: string | undefined;
  try {
    const existing = await getVaultFile(pathFor(next.date));
    sha = existing.sha;
  } catch {
    // 新規作成
  }
  await saveVaultFile(pathFor(next.date), buildMarkdown(next), sha);
  return next;
}

export async function updateTasks(date: string, tasks: PlanTask[]): Promise<DailyPlan> {
  const plan = await loadPlan(date);
  return savePlan({ ...plan, tasks });
}

export async function updateBlocks(date: string, blocks: TimeBlock[]): Promise<DailyPlan> {
  const plan = await loadPlan(date);
  return savePlan({ ...plan, blocks });
}
