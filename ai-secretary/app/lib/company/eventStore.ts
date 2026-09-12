/**
 * 活動イベントの保存 — §25
 *
 * 保存先は Vault。日次レビュー（§10）が読み、Pattern Analyzer（§4）が数える。
 *
 * 保持方針:
 *   反復検出は「過去N日で何回」を見るため、一定期間の全件が要る。
 *   件数と日数の両方で上限をかけ、古いものから落とす。
 *   落ちた分の集計は日次レビューの結果（memory/company-review/daily/）に残る想定。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import type { CompanyEvent } from "./events";

const EVENTS_PATH = "memory/company-review/events.md";

/** 保持する最大件数 */
const MAX_EVENTS = 4000;
/** 保持する最大日数。反復検出の窓（14日）より十分長く取る */
const RETENTION_DAYS = 60;

function extractJson(markdown: string): CompanyEvent[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { events?: CompanyEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function buildMarkdown(events: CompanyEvent[]): string {
  const failures = events.filter((e) => e.outcome === "failure").length;
  const interventions = events.filter((e) => e.humanIntervention).length;
  const first = events[0];
  const last = events[events.length - 1];

  return `---
type: company_events
events: ${events.length}
updated: ${new Date().toISOString()}
---

# 会社の活動イベント

Organization Observer が読む横断ログです。
既存の各種履歴を置き換えるものではなく、数えるための薄い層として併存します。

- 記録期間: ${first?.at?.slice(0, 10) ?? "—"} 〜 ${last?.at?.slice(0, 10) ?? "—"}
- 総件数: ${events.length}
- 失敗: ${failures}件
- 人の手が入った件数: ${interventions}件

\`\`\`json
${JSON.stringify({ events }, null, 2)}
\`\`\`
`;
}

/** 保持期間・件数で古いものを落とす */
export function pruneEvents(events: CompanyEvent[], now: Date = new Date()): CompanyEvent[] {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const kept = events
    .filter((event) => event.at >= cutoff)
    .sort((a, b) => a.at.localeCompare(b.at));
  return kept.length > MAX_EVENTS ? kept.slice(-MAX_EVENTS) : kept;
}

export async function loadCompanyEvents(): Promise<CompanyEvent[]> {
  try {
    const file = await getVaultFile(EVENTS_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

/**
 * イベントを追記する。
 * 記録の失敗で本処理を止めないため、例外は投げずログに残すだけにする。
 */
export async function appendCompanyEvents(events: CompanyEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    let existing: CompanyEvent[] = [];
    let sha: string | undefined;
    try {
      const file = await getVaultFile(EVENTS_PATH);
      existing = extractJson(file.content || "");
      sha = file.sha;
    } catch {
      // 初回作成
    }

    const next = pruneEvents([...existing, ...events]);
    await saveVaultFile(EVENTS_PATH, buildMarkdown(next), sha);
  } catch (error) {
    console.error("[company/eventStore] イベントの記録に失敗:", error);
  }
}
