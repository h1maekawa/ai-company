/**
 * Timebox Content Provider — Time Blocking OS（app/lib/planning）を発信材料の1つの source として橋渡しする。
 *
 * 重要: Note/X StudioはTimeboxへhard dependencyしない。
 *  - Timebox Taskが無くても記事は作れる（Manual/Obsidian/Research/Upload/Urlで完結）
 *  - Timebox APIが落ちてもNote Studioは動く（isAvailable=false → 空配列を返すだけ）
 *  - Timebox schemaをNoteのSource of Truthにしない（PlanTaskをそのまま保存せず、Materialへ変換して複製する）
 *
 * note/harvest.ts・note/research/experience.ts は、このモジュールの狭いインターフェースだけに依存する
 * （planning/store を直接importしない）ことで、Planning内部の実装変更からNoteを切り離す。
 */

import { findPreviousPlanDate, loadPlan, planExists } from "../../../planning/store";
import { todayJst, type PlanTask } from "../../../planning/types";
import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export type CompletedTimeboxTask = {
  title: string;
  category?: "work" | "life";
  minutes: number;
  date: string;
};

/**
 * Note/Xが依存してよい唯一のTimebox接点。完了タスクのみを返す
 * （未完了タスクを記事ネタにすると、体験していない内容を書くことになるため）。
 * Timeboxが使えない・データが無い場合は空配列を返し、例外は投げない。
 */
export async function getCompletedTasksForDate(date?: string): Promise<{
  date: string | null;
  tasks: CompletedTimeboxTask[];
}> {
  try {
    let target = date ?? todayJst();
    let plan = await loadPlan(target);

    if (plan.tasks.filter((t) => t.done).length === 0 && !date) {
      const previous = await findPreviousPlanDate(target);
      if (previous) {
        target = previous;
        plan = await loadPlan(previous);
      }
    }

    const tasks: CompletedTimeboxTask[] = plan.tasks
      .filter((t: PlanTask) => t.done)
      .map((t) => ({ title: t.title, category: t.category, minutes: t.minutes, date: target }));

    return { date: tasks.length > 0 ? target : null, tasks };
  } catch (error) {
    console.warn("[content/timebox] Timeboxからの取得に失敗（optional機能のため空を返す）:", error);
    return { date: null, tasks: [] };
  }
}

export async function isTimeboxAvailable(): Promise<boolean> {
  try {
    return await planExists(todayJst());
  } catch {
    return false;
  }
}

function materialIdFor(date: string, title: string): string {
  return `timebox:${date}:${title}`;
}

export const TimeboxContentProvider: ContentSourceProvider = {
  id: "timebox",
  label: "Timebox",
  async isAvailable() {
    try {
      const { tasks } = await getCompletedTasksForDate();
      return tasks.length > 0 || (await isTimeboxAvailable());
    } catch {
      return false;
    }
  },
  async listMaterials() {
    const { tasks } = await getCompletedTasksForDate();
    return tasks.map(
      (t): Material => ({
        id: materialIdFor(t.date, t.title),
        type: "task",
        title: t.title,
        rawContent: `${t.title}（${t.category === "life" ? "生活" : "仕事"}・${t.minutes}分・${t.date}に完了）`,
        sourceType: "timebox",
        sourceId: `${t.date}:${t.title}`,
        createdAt: t.date,
        updatedAt: t.date,
        status: "inbox",
      })
    );
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  async importMaterial(id: string): Promise<Material> {
    const { materials: saved } = await loadContentCore();
    const already = saved.find((m) => m.sourceType === "timebox" && m.sourceId && id.includes(m.sourceId));
    if (already) return already;

    const candidate = (await this.listMaterials()).find((m) => m.id === id);
    if (!candidate) throw new Error(`Timebox material not found: ${id}`);

    // Timeboxのschemaをそのまま保存せず、Materialとして複製する（PlanTaskへの参照は持たない）
    const material = createMaterial({
      type: "task",
      title: candidate.title,
      rawContent: candidate.rawContent,
      sourceType: "timebox",
      sourceId: candidate.sourceId,
    });
    return upsertMaterial(material);
  },
};
