/**
 * 朝会で「実際にやったこと」から記事ネタを拾う。
 *
 * 対象は完了済みタスクだけ。やっていないことを記事ネタにすると、
 * 体験していない内容を書くことになるため、未完了は渡さない。
 */

import { callAI } from "../ai/client";
import { loadPlan, findPreviousPlanDate } from "../planning/store";
import { todayJst } from "../planning/types";
import { Brand, Genre, Idea } from "./types";

const HARVEST_PROMPT = `あなたは副業メディアの編集者です。
筆者が「実際にやったこと」の一覧から、記事にできそうなものを選んでください。

## 誰に向けた記事か
{{target}}

## 教えている内容
{{teaches}}

## ジャンル（この中から必ず選ぶ）
{{genres}}

## 厳守事項
- 渡されたタスク以外のことを題材にしない（やっていないことを記事にさせない）
- 読者の役に立たない作業（移動・雑務など）は選ばない。選ばなくてよい
- 収益額や成果を勝手に想像して書かない
- takeaway は「読者がその記事から持ち帰れること」を1文で

## 出力（JSONのみ。該当なしなら {"ideas":[]}）
{"ideas":[{"sourceTask":"元のタスク名をそのまま","title":"記事タイトル案（30文字以内）","genreId":"上のidから","takeaway":"読者が得られること（40文字以内）"}]}`;

type RawIdea = {
  sourceTask?: unknown;
  title?: unknown;
  genreId?: unknown;
  takeaway?: unknown;
};

function makeId(index: number): string {
  return `idea${Date.now().toString(36)}${index.toString(36)}`;
}

export type HarvestResult = {
  ideas: Idea[];
  /** 対象にした日付 */
  sourceDate: string | null;
  /** 完了タスクが何件あったか */
  doneCount: number;
};

/**
 * 指定日（既定は直近でプランのある日）の完了タスクからネタを拾う。
 * 既に同じタスクから拾ったネタがあれば重複させない。
 */
export async function harvestIdeas(
  genres: Genre[],
  brand: Brand,
  existing: Idea[],
  date?: string
): Promise<HarvestResult> {
  // 指定が無ければ、今日→無ければ直近のプランを見る
  let target = date ?? todayJst();
  let plan = await loadPlan(target);

  if (plan.tasks.filter((t) => t.done).length === 0 && !date) {
    const previous = await findPreviousPlanDate(target);
    if (previous) {
      target = previous;
      plan = await loadPlan(previous);
    }
  }

  const done = plan.tasks.filter((t) => t.done);
  if (done.length === 0) {
    return { ideas: [], sourceDate: target, doneCount: 0 };
  }

  // 既に拾ったタスクは除外する
  const harvested = new Set(
    existing.filter((i) => i.sourceDate === target).map((i) => i.sourceTask)
  );
  const candidates = done.filter((t) => !harvested.has(t.title));
  if (candidates.length === 0) {
    return { ideas: [], sourceDate: target, doneCount: done.length };
  }

  const message = `【筆者が${target}に実際に完了したこと】
${candidates.map((t) => `- ${t.title}（${t.category === "life" ? "生活" : "仕事"}・${t.minutes}分）`).join("\n")}`;

  const prompt = HARVEST_PROMPT.replace("{{target}}", brand.targetReader)
    .replace("{{teaches}}", brand.teaches.map((t) => `- ${t}`).join("\n") || "（未記入）")
    .replace("{{genres}}", genres.map((g) => `- ${g.id}: ${g.label}（${g.description}）`).join("\n"));

  try {
    const response = await callAI(message, prompt, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return { ideas: [], sourceDate: target, doneCount: done.length };

    const parsed = JSON.parse(match[0]) as { ideas?: RawIdea[] };
    const validTaskTitles = new Set(candidates.map((t) => t.title));

    const ideas = (parsed.ideas ?? [])
      .map((raw, index): Idea | null => {
        const title = String(raw.title ?? "").trim();
        const sourceTask = String(raw.sourceTask ?? "").trim();
        if (!title) return null;

        // 実在しないタスクを題材にしていたら捨てる（創作の防止）
        if (!validTaskTitles.has(sourceTask)) {
          console.warn(`[note/harvest] 実在しないタスクを参照したため破棄: "${sourceTask}"`);
          return null;
        }

        const genreId = genres.some((g) => g.id === raw.genreId)
          ? String(raw.genreId)
          : genres[0].id;

        return {
          id: makeId(index),
          title,
          genreId,
          status: "inbox",
          source: "morning",
          sourceDate: target,
          sourceTask,
          takeaway: String(raw.takeaway ?? "").trim() || undefined,
          createdAt: new Date().toISOString(),
        };
      })
      .filter((idea): idea is Idea => idea !== null);

    return { ideas, sourceDate: target, doneCount: done.length };
  } catch (error) {
    console.error("[note/harvest] ネタの抽出に失敗:", error);
    return { ideas: [], sourceDate: target, doneCount: done.length };
  }
}
