/**
 * 朝会の入力（自由記述）を、動詞ベースのタスク配列へAIで変換する。
 *
 * ルール:
 *  - タスク名は必ず動詞ベース（「家計簿」ではなく「家計簿アプリを修正する」）
 *  - 所要時間で 15分 / 30分 / 60分以上 の3バケットへ分類
 *  - 優先順位を1〜5で付与
 */

import { callAI } from "../ai/client";
import { PlanTask, Priority, TaskBucket, bucketDefaultMinutes } from "./types";

const SYSTEM_PROMPT = `あなたは「1日の行動設計」を担当するAI秘書です。
ユーザーが朝に書き出した「今日やること」を、実行可能なタスク配列へ変換します。

## 変換ルール

1. タスク名は必ず**動詞ベース**にする
   - ❌「家計簿」→ ✅「家計簿アプリを修正する」
   - ❌「営業」→ ✅「営業電話を50件行う」
   - 数量が書かれていれば残す（「50件」など）
2. 1行に複数の用件が混ざっていれば分割する
3. 所要時間を見積もり、bucketへ分類する
   - "quick" = 15分以内（例: Slack返信をする / メールを返信する / 日報を書く）
   - "focus" = 30分程度（例: 読書をする / 投資分析をする / MTG資料を作る）
   - "deep"  = 60分以上（例: 家計簿アプリを修正する / noteを書く / 動画編集をする）
4. minutes は実際の見積もり分数（quick:5〜15 / focus:20〜45 / deep:60〜240）
5. priority は 1〜5 の整数（5が最優先）
   - 締切がある・収益に直結する・他人を待たせている ものを高くする
   - 「〜したい」程度の希望は低めにする

## 出力

必ず次のJSONのみを返す。説明文やコードブロックは不要。

{"tasks":[{"title":"動詞ベースのタスク名","bucket":"quick|focus|deep","minutes":30,"priority":4,"note":"分類理由を10文字程度"}]}

入力:
{{input}}`;

type RawTask = {
  title?: unknown;
  bucket?: unknown;
  minutes?: unknown;
  priority?: unknown;
  note?: unknown;
};

function normalizeBucket(value: unknown, minutes: number): TaskBucket {
  if (value === "quick" || value === "focus" || value === "deep") return value;
  // bucketが壊れていたら分数から復元する
  if (minutes <= 15) return "quick";
  if (minutes <= 45) return "focus";
  return "deep";
}

function normalizePriority(value: unknown): Priority {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as Priority;
}

function makeId(index: number): string {
  return `t${Date.now().toString(36)}${index.toString(36)}`;
}

/**
 * 自由記述をタスク配列へ変換する。
 * AIが失敗した場合は行分割によるフォールバックを返す（朝会を止めないため）。
 */
export async function classifyTasks(input: string): Promise<PlanTask[]> {
  const text = input.trim();
  if (!text) return [];

  let raw: RawTask[] = [];
  try {
    const response = await callAI(text, SYSTEM_PROMPT.replace("{{input}}", text), {
      provider: "auto",
    });
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { tasks?: RawTask[] };
      if (Array.isArray(parsed.tasks)) raw = parsed.tasks;
    }
  } catch (error) {
    console.error("[planning/classify] AI分類に失敗。行分割にフォールバックします:", error);
  }

  if (raw.length === 0) {
    raw = text
      .split("\n")
      .map((line) => line.replace(/^[-*・\d.\s]+/, "").trim())
      .filter(Boolean)
      .map((title) => ({ title, bucket: "focus", minutes: 30, priority: 3 }));
  }

  return raw
    .map((item, index) => {
      const title = String(item.title ?? "").trim();
      if (!title) return null;
      const parsedMinutes = Math.round(Number(item.minutes));
      const bucket = normalizeBucket(item.bucket, parsedMinutes);
      const minutes =
        Number.isFinite(parsedMinutes) && parsedMinutes > 0
          ? Math.min(480, parsedMinutes)
          : bucketDefaultMinutes(bucket);
      const note = String(item.note ?? "").trim();
      const task: PlanTask = {
        id: makeId(index),
        title,
        bucket,
        minutes,
        priority: normalizePriority(item.priority),
        done: false,
        ...(note ? { note } : {}),
      };
      return task;
    })
    .filter((task): task is PlanTask => task !== null);
}
