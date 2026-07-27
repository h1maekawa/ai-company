/**
 * 1日の時間割テンプレート（曜日別の仕事枠／プライベート枠）。
 *
 * 「24時間しかない」前提で、まず自分の枠を宣言しておき、
 * タスクはその枠の中にだけ配置する。テンプレートはVaultに1ファイルで保存し、
 * 変更しても過去の日次プランは書き換えない（各日は枠のスナップショットを持つ）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  TimeWindow,
  WeeklyTemplate,
  WEEKDAY_LABELS,
  defaultWeeklyTemplate,
  toMinutes,
  windowCapacity,
  formatDuration,
} from "./types";

const TEMPLATE_PATH = "memory/personal/planning/time-template.md";

function extractJson(markdown: string): WeeklyTemplate | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as WeeklyTemplate;
    if (Array.isArray(parsed.days) && parsed.days.length === 7) return parsed;
  } catch {
    // 壊れていれば既定へ
  }
  return null;
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** 入力を検証し、重なりや逆転を取り除いて整える */
export function sanitizeWindows(value: unknown): TimeWindow[] {
  if (!Array.isArray(value)) return [];

  const windows = value
    .map((item, index): TimeWindow | null => {
      const raw = item as Record<string, unknown>;
      const start = String(raw.start ?? "");
      const end = String(raw.end ?? "");
      if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return null;
      if (toMinutes(end) <= toMinutes(start)) return null; // 逆転・ゼロ幅は捨てる

      return {
        id: String(raw.id ?? "").trim() || `win${Date.now().toString(36)}${index}`,
        label: String(raw.label ?? "").trim().slice(0, 20) || "時間枠",
        start,
        end,
        category: raw.category === "life" ? "life" : "work",
      };
    })
    .filter((w): w is TimeWindow => w !== null)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  // 前の枠と重なる場合は開始を後ろへ寄せ、潰れたら捨てる
  const result: TimeWindow[] = [];
  let previousEnd = 0;
  for (const window of windows) {
    const start = Math.max(toMinutes(window.start), previousEnd);
    if (start >= toMinutes(window.end)) continue;
    const adjusted =
      start === toMinutes(window.start)
        ? window
        : { ...window, start: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}` };
    result.push(adjusted);
    previousEnd = toMinutes(adjusted.end);
  }
  return result;
}

function buildMarkdown(template: WeeklyTemplate): string {
  const dayLines = template.days.flatMap((windows, weekday) => {
    const capacity = windowCapacity(windows);
    return [
      "",
      `### ${WEEKDAY_LABELS[weekday]}曜日 — 💼${formatDuration(capacity.work)} / 🏠${formatDuration(capacity.life)}`,
      ...(windows.length === 0
        ? ["（枠が未設定）"]
        : windows.map(
            (w) =>
              `- ${w.start}〜${w.end} ${w.category === "work" ? "💼仕事" : "🏠プライベート"}：${w.label}`
          )),
    ];
  });

  return `---
type: time_template
updated: ${template.updatedAt}
---

# 1日の時間割テンプレート

曜日ごとに「仕事の時間」と「自分の時間」を宣言しておくファイルです。
朝会で作るタイムブロッキングは、ここで決めた枠の中にだけ配置されます。

${dayLines.join("\n")}

\`\`\`json
${JSON.stringify(template, null, 2)}
\`\`\`
`;
}

export async function loadTemplate(): Promise<WeeklyTemplate> {
  try {
    const file = await getVaultFile(TEMPLATE_PATH);
    const parsed = extractJson(file.content || "");
    if (parsed) {
      // 各曜日の枠を毎回整えてから返す（手編集で壊れても落ちないように）
      return { ...parsed, days: parsed.days.map((windows) => sanitizeWindows(windows)) };
    }
  } catch {
    // 未作成なら既定テンプレート
  }
  return defaultWeeklyTemplate();
}

export async function saveTemplate(days: TimeWindow[][]): Promise<WeeklyTemplate> {
  const normalized: WeeklyTemplate = {
    days: Array.from({ length: 7 }, (_, weekday) => sanitizeWindows(days[weekday] ?? [])),
    updatedAt: new Date().toISOString(),
  };

  let sha: string | undefined;
  try {
    sha = (await getVaultFile(TEMPLATE_PATH)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(TEMPLATE_PATH, buildMarkdown(normalized), sha);
  return normalized;
}
