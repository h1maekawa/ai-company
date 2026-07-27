/**
 * 朝会の入力（自由記述）を、動詞ベースのタスク配列へAIで変換する。
 *
 * ルール:
 *  - タスク名は必ず動詞ベース（「家計簿」ではなく「家計簿アプリを修正する」）
 *  - 所要時間で 15分 / 30分 / 60分以上 の3バケットへ分類
 *  - 優先順位を1〜5で付与
 */

import { callAI } from "../ai/client";
import { PlanTask, Priority, TaskBucket, TaskCategory, bucketDefaultMinutes } from "./types";

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
6. category で「仕事」か「日常生活」かを分ける
   - "work" = 収益・事業・顧客・社内業務に関わること
     （例: 営業電話をする / 資料を作る / Slackを返す / 日報を書く / noteを書く）
   - "life" = 私生活・家庭・健康・自己管理のこと
     （例: 買い物に行く / 病院を予約する / 部屋を片づける / 運動する / 読書をする）
   - 判断に迷うものは、その行動が収入につながるかで決める

## 出力

必ず次のJSONのみを返す。説明文やコードブロックは不要。

{"tasks":[{"title":"動詞ベースのタスク名","bucket":"quick|focus|deep","minutes":30,"priority":4,"category":"work|life","note":"分類理由を10文字程度"}]}

入力:
{{input}}`;

type RawTask = {
  title?: unknown;
  bucket?: unknown;
  minutes?: unknown;
  priority?: unknown;
  category?: unknown;
  note?: unknown;
};

/** 不正値は推測で埋めず undefined（＝未分類）にする */
function normalizeCategory(value: unknown): TaskCategory | undefined {
  return value === "work" || value === "life" ? value : undefined;
}

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

export type ClassifyResult = {
  tasks: PlanTask[];
  /**
   * AI分類に失敗し、行分割のフォールバックで作った場合に true。
   * 所要時間・優先度・カテゴリは仮の値なので、UIでその旨を伝えること。
   */
  degraded: boolean;
};

/**
 * 自由記述をタスク配列へ変換する。
 * AIが失敗した場合は行分割によるフォールバックを返す（朝会を止めないため）。
 */
export async function classifyTasks(input: string): Promise<ClassifyResult> {
  const text = input.trim();
  if (!text) return { tasks: [], degraded: false };

  let raw: RawTask[] = [];
  let degraded = false;
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
    degraded = true;
    raw = text
      .split("\n")
      .map((line) => line.replace(/^[-*・\d.\s]+/, "").trim())
      .filter(Boolean)
      .map((title) => ({ title, bucket: "focus", minutes: 30, priority: 3 }));
  }

  const tasks = raw
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
      const category = normalizeCategory(item.category);
      const task: PlanTask = {
        id: makeId(index),
        title,
        bucket,
        minutes,
        priority: normalizePriority(item.priority),
        done: false,
        ...(category ? { category } : {}),
        ...(note ? { note } : {}),
      };
      return task;
    })
    .filter((task): task is PlanTask => task !== null);

  return { tasks, degraded };
}
