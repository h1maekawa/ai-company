/**
 * 体験ライブラリ。
 *
 * 記事の説得力の源。ここに無いことは体験談として書かせない。
 * verifiedByUser=false の間は「断定的な体験談」に使えない。
 */

import { loadPlan } from "../../planning/store";
import { hashId } from "./fetcher";
import { loadExperiences, saveExperiences } from "./store";
import { ExperienceEntry, ExperienceSourceType } from "./types";
import { detectGenres } from "./sources/note";

export type NewExperience = {
  title: string;
  summary?: string;
  whatHappened?: string;
  whatWasTried?: string;
  whatWorked?: string;
  whatDidNotWork?: string;
  lesson?: string;
  reusableFacts?: string[];
  genres?: string[];
  occurredAt?: string;
  sourceType?: ExperienceSourceType;
  sourcePath?: string;
  verifiedByUser?: boolean;
  sensitive?: boolean;
};

export function buildExperience(input: NewExperience): ExperienceEntry {
  const now = new Date().toISOString();
  const text = [input.title, input.summary, input.whatHappened, input.whatWasTried]
    .filter(Boolean)
    .join(" ");
  return {
    id: hashId("e", `${input.title}${now}`),
    title: input.title.trim(),
    occurredAt: input.occurredAt,
    genres: input.genres?.length ? input.genres : detectGenres(text),
    summary: input.summary?.trim() ?? "",
    whatHappened: input.whatHappened?.trim() ?? "",
    whatWasTried: input.whatWasTried?.trim() ?? "",
    whatWorked: input.whatWorked?.trim() || undefined,
    whatDidNotWork: input.whatDidNotWork?.trim() || undefined,
    lesson: input.lesson?.trim() || undefined,
    reusableFacts: (input.reusableFacts ?? []).map((f) => f.trim()).filter(Boolean),
    sourceType: input.sourceType ?? "manual",
    sourcePath: input.sourcePath,
    // 既定は未確認。人が確認したものだけ断定的に書ける
    verifiedByUser: input.verifiedByUser ?? false,
    sensitive: input.sensitive ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function addExperience(input: NewExperience): Promise<ExperienceEntry[]> {
  const existing = await loadExperiences();
  const entry = buildExperience(input);
  // 同じタイトルの重複登録は避ける
  if (existing.some((e) => e.title === entry.title)) return existing;
  return saveExperiences([entry, ...existing]);
}

export async function updateExperience(
  id: string,
  patch: Partial<ExperienceEntry>
): Promise<ExperienceEntry[]> {
  const existing = await loadExperiences();
  const next = existing.map((e) =>
    e.id === id ? { ...e, ...patch, id: e.id, updatedAt: new Date().toISOString() } : e
  );
  return saveExperiences(next);
}

/**
 * 朝会で「実際に完了した」タスクから体験の下書きを作る。
 * やっていないことは入らない（done: true のみ）。
 * 取り込んだ体験は未確認扱いで、本人が中身を埋めて確認するまで断定的には使わない。
 */
export async function harvestFromMorningPlan(date?: string): Promise<{
  added: ExperienceEntry[];
  sourceDate: string;
  doneCount: number;
}> {
  const sourceDate = date ?? new Date().toISOString().slice(0, 10);
  const plan = await loadPlan(sourceDate);
  const done = plan.tasks.filter((t) => t.done);

  const existing = await loadExperiences();
  const alreadyTaken = new Set(
    existing.filter((e) => e.sourceType === "morning-task").map((e) => e.title)
  );

  const added: ExperienceEntry[] = [];
  for (const task of done) {
    if (alreadyTaken.has(task.title)) continue;
    added.push(
      buildExperience({
        title: task.title,
        summary: `${sourceDate}の朝会で実際に完了したタスク`,
        whatHappened: task.title,
        whatWasTried: "",
        sourceType: "morning-task",
        sourcePath: `memory/personal/planning/${sourceDate}.md`,
        verifiedByUser: false,
      })
    );
  }

  if (added.length > 0) {
    await saveExperiences([...added, ...existing]);
  }
  return { added, sourceDate, doneCount: done.length };
}

/**
 * 生成に使ってよい体験だけを返す。
 * - sensitive は除外
 * - allowUnverified=false のときは本人確認済みのみ
 */
export function usableExperiences(
  all: ExperienceEntry[],
  ids: string[],
  allowUnverified = false
): ExperienceEntry[] {
  return all.filter(
    (e) => ids.includes(e.id) && !e.sensitive && (allowUnverified || e.verifiedByUser)
  );
}
