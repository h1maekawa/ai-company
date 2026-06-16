import { callGroq } from "../ai/groq";

/**
 * CSO prioritizes tasks based on strategic importance and urgency.
 */
export async function prioritizeTasks(tasks: string[]): Promise<string[]> {
  if (tasks.length === 0) return [];
  
  const prompt = `あなたは「AI Company OS」のCSO（最高戦略責任者）です。
以下のタスク群を読み、ビジネス上の重要性と緊急性に基づいて優先度順に並べ替えてください。

タスク一覧：
${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

必ずJSON配列形式（例: ["タスクA", "タスクB"]）のみを返し、その他の説明やマークダウン、二重引用符以外の記述は一切含めないでください。`;

  try {
    const res = await callGroq("", prompt);
    const jsonMatch = res.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as string[];
    }
  } catch (e) {
    console.error("[DEBUG] CSO prioritizeTasks failed:", e);
  }
  return tasks;
}

/**
 * CSO analyzes bottlenecks in the current situation.
 */
export async function analyzeBottleneck(context: string): Promise<string> {
  const prompt = `あなたは「AI Company OS」のCSO（最高戦略責任者）です。
現在の対話文脈やプロジェクト状況から、最も深刻なボトルネック（事業成長の障壁）を1点分析してください。
要点を絞り、2〜3文の簡潔な日本語で指摘してください。`;

  try {
    return await callGroq(context, prompt);
  } catch (e) {
    console.error("[DEBUG] CSO analyzeBottleneck failed:", e);
    return "ボトルネック分析中にエラーが発生しました。";
  }
}

/**
 * CSO recommends a single high-priority action point to focus on.
 */
export async function recommendFocus(context: string): Promise<string> {
  const prompt = `あなたは「AI Company OS」のCSO（最高戦略責任者）です。
現在の状況を打破するために、今ユーザー（CEO）が「最もフォーカスすべき重要な1点」をアドバイスしてください。
簡潔に2〜3文の日本語で出力してください。`;

  try {
    return await callGroq(context, prompt);
  } catch (e) {
    console.error("[DEBUG] CSO recommendFocus failed:", e);
    return "フォーカス推奨中にエラーが発生しました。";
  }
}
