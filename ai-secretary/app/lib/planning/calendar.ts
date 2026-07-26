/**
 * Googleカレンダー同期。
 *
 * 単一ユーザー運用のため、OAuthのrefresh tokenを環境変数に持たせて
 * サーバー側でaccess tokenへ交換する方式をとる（毎回のブラウザ同意が不要）。
 *
 * 必要な環境変数:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_ID（任意・既定 "primary"）
 *
 * 同期方式: その日にこのアプリが作ったイベントを全削除してから作り直す。
 * 差分更新より単純で、時間割を作り直しても必ず一致する。
 */

import { DailyPlan, TimeBlock } from "./types";

const TIME_ZONE = "Asia/Tokyo";
/** このアプリが作ったイベントを識別するための印 */
const APP_TAG = "ai-company-planning";

export type CalendarSyncResult = {
  created: number;
  deleted: number;
  calendarId: string;
};

export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Googleの認証に失敗しました（${response.status}）。GOOGLE_REFRESH_TOKEN を確認してください。${detail.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Googleからアクセストークンを取得できませんでした");
  return data.access_token;
}

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

function apiBase(): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`;
}

/** "2026-07-19" + "09:00" → "2026-07-19T09:00:00" */
function toLocalDateTime(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00`;
}

async function deleteExistingEvents(accessToken: string, date: string): Promise<number> {
  const url = new URL(apiBase());
  url.searchParams.set("privateExtendedProperty", `${APP_TAG}=${date}`);
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", "250");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`既存予定の取得に失敗しました（${response.status}）: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { items?: { id: string }[] };
  const items = data.items ?? [];

  let deleted = 0;
  for (const item of items) {
    const del = await fetch(`${apiBase()}/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 410 = 既に削除済み。成功扱いにする
    if (del.ok || del.status === 410) deleted += 1;
  }
  return deleted;
}

function describeBlock(block: TimeBlock): string {
  const stars = "★".repeat(block.priority);
  return `AI Company / 朝会で設計したブロック\n優先度: ${stars}\n所要: ${block.start}〜${block.end}`;
}

async function createEvent(accessToken: string, date: string, block: TimeBlock): Promise<boolean> {
  const response = await fetch(apiBase(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: block.title,
      description: describeBlock(block),
      start: { dateTime: toLocalDateTime(date, block.start), timeZone: TIME_ZONE },
      end: { dateTime: toLocalDateTime(date, block.end), timeZone: TIME_ZONE },
      extendedProperties: { private: { [APP_TAG]: date, taskId: block.taskId } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[planning/calendar] イベント作成に失敗:", response.status, detail.slice(0, 200));
    return false;
  }
  return true;
}

export async function syncPlanToCalendar(plan: DailyPlan): Promise<CalendarSyncResult> {
  if (!isCalendarConfigured()) {
    throw new Error(
      "Googleカレンダーが未設定です。GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN を設定してください。"
    );
  }

  const accessToken = await getAccessToken();
  const deleted = await deleteExistingEvents(accessToken, plan.date);

  let created = 0;
  for (const block of plan.blocks) {
    if (await createEvent(accessToken, plan.date, block)) created += 1;
  }

  return { created, deleted, calendarId: calendarId() };
}

// ─── ICSエクスポート（OAuth未設定でもすぐ使えるフォールバック） ───

function icsStamp(date: string, hhmm: string): string {
  // JST(+09:00)をUTCへ変換してZ形式で出力する
  const local = new Date(`${date}T${hhmm}:00+09:00`);
  return local.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

export function buildIcs(plan: DailyPlan): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Company//Morning Planning//JA",
    "CALSCALE:GREGORIAN",
  ];

  for (const block of plan.blocks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${APP_TAG}-${plan.date}-${block.taskId}@ai-company`,
      `DTSTAMP:${icsStamp(plan.date, block.start)}`,
      `DTSTART:${icsStamp(plan.date, block.start)}`,
      `DTEND:${icsStamp(plan.date, block.end)}`,
      `SUMMARY:${escapeIcs(block.title)}`,
      `DESCRIPTION:${escapeIcs(describeBlock(block))}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
