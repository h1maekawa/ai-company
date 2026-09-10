/**
 * 運用の現況スナップショット（TASK-N1 / N4）
 *
 * 「今どのモードか」「今日は何が予約されているか」「承認が必要なものはあるか」を
 * 1本のAPIで返す。監視ダッシュボードとモード切替UIの両方がこれを見る。
 * ここでは判定・集計だけを行い、投稿や書き込みは一切しない。
 */

import {
  SocialOperationMode,
  deriveSocialOperationMode,
  type SocialDraft,
} from "@/app/lib/note/research/types";
import {
  loadExperiences,
  loadPerformance,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
} from "@/app/lib/note/research/store";
import { loadBrand } from "@/app/lib/note/store";
import { isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { countToday } from "@/app/lib/note/publishing/queue";
import { runXDraftQa, summarizeReport } from "@/app/lib/qa/runner";
import type { QaReport } from "@/app/lib/qa/types";
import type { DataFreshness } from "@/app/lib/freshness";

/**
 * 承認フィードの1件（要件2の表示単位）。
 * qa は自動テスト（要件9）の結果で、qa.passed が false のものは
 * 自動承認（要件10）の対象外になる。
 */
export type ApprovalQueueEntry = {
  draftId: string;
  reason: string;
  updatedAt: string;
  text: string;
  /** 自動テストの結果。実行できなかった場合は null */
  qa: QaReport | null;
  /** 承認画面に出す1行サマリー（「自動テスト通過」など） */
  qaSummary: string | null;
};

export type AutomationBlocker = {
  /** 設定で直せるものか、環境変数で直すものか */
  kind: "env" | "flag" | "integration";
  label: string;
  /** 直し方（そのまま画面に出す） */
  howToFix: string;
};

export type AutomationStatus = {
  mode: SocialOperationMode;
  /** モードが autopilot でも、これが false なら実際には予約されない */
  effective: boolean;
  blockers: AutomationBlocker[];
  today: {
    /** 本日Bufferへ予約済みの件数 */
    scheduled: number;
    /** 本日すでに投稿した件数（上限判定に使う値） */
    published: number;
    limit: number;
    /** 予約済み下書きの時刻一覧 */
    slots: { draftId: string; scheduledAt: string; status: string; text: string }[];
  };
  /** 人の承認・確認を待っているもの */
  approvalQueue: ApprovalQueueEntry[];
  /** 直近の実績（performance-syncが入れた値） */
  recent: {
    records: number;
    lastSyncedAt: string | null;
    /** 実績レコードの最終計測時刻。接続状態表示の「Performance Sync 最終実行」に使う */
    lastMeasuredAt: string | null;
  };
  freshness: DataFreshness;
};

function tokyoDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function todayTokyo(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 予約されない理由を全部並べる（1つ直せば動く、という誤解を避ける） */
export function collectBlockers(options: {
  mode: SocialOperationMode;
  automationEnabled: boolean;
  bufferConfigured: boolean;
}): AutomationBlocker[] {
  const blockers: AutomationBlocker[] = [];

  if (!options.automationEnabled) {
    blockers.push({
      kind: "env",
      label: "日次自動化が停止しています",
      howToFix: "環境変数 X_DAILY_AUTOMATION_ENABLED を true にしてください",
    });
  }
  if (options.mode !== "autopilot") {
    blockers.push({
      kind: "flag",
      label: "運用モードが全自動ではありません",
      howToFix: "この画面で運用モードを「全自動」に切り替えてください",
    });
  }
  if (!options.bufferConfigured) {
    blockers.push({
      kind: "integration",
      label: "Bufferが未設定です",
      howToFix:
        "BUFFER_ENABLED / BUFFER_API_KEY / BUFFER_ORGANIZATION_ID / BUFFER_X_CHANNEL_ID を設定してください",
    });
  }
  return blockers;
}

/** 承認・確認待ちの理由。安全弁に引っかかったものは必ずここへ出す */
function approvalReason(draft: SocialDraft, mode: SocialOperationMode): string | null {
  if (draft.failureReason) return `安全チェック: ${draft.failureReason}`;
  if (draft.status === "approved") return "承認済み・未予約";
  if (draft.status === "failed") return "予約に失敗しました";
  if (draft.status === "draft" && mode !== "autopilot") return "承認待ち";
  return null;
}

export async function getAutomationStatus(): Promise<AutomationStatus> {
  const [settings, drafts, performance, publishedToday, brandFile, experiences, researchItems] =
    await Promise.all([
      loadResearchSettings(),
      loadSocialDrafts(),
      loadPerformance(),
      countToday("x"),
      loadBrand(),
      loadExperiences(),
      loadResearchInbox(),
    ]);

  const mode =
    settings.flags.socialOperationMode ?? deriveSocialOperationMode(settings.flags);
  const automationEnabled = process.env.X_DAILY_AUTOMATION_ENABLED === "true";
  const bufferConfigured = isBufferConfigured();
  const blockers = collectBlockers({ mode, automationEnabled, bufferConfigured });

  const today = todayTokyo();
  const slots = drafts
    .filter((draft) => draft.scheduledAt && tokyoDate(draft.scheduledAt) === today)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .map((draft) => ({
      draftId: draft.id,
      scheduledAt: draft.scheduledAt as string,
      status: draft.status,
      text: draft.text.slice(0, 120),
    }));

  const pending = drafts
    .filter((draft) => !["published", "discarded"].includes(draft.status))
    .map((draft) => ({ draft, reason: approvalReason(draft, mode) }))
    .filter((entry): entry is { draft: SocialDraft; reason: string } => entry.reason !== null);

  // 自動テスト（要件9）を承認フィードに載せる。
  // ここは表示用のGETなので、外部通信を伴うドライランは実行しない（includeDryRun: false）。
  const approvalQueue: ApprovalQueueEntry[] = await Promise.all(
    pending.map(async ({ draft, reason }) => {
      let qa: QaReport | null = null;
      try {
        qa = await runXDraftQa({
          draft,
          brand: brandFile.brand,
          experiences,
          researchItems,
        });
      } catch (error) {
        // QAが落ちても承認フィード自体は出す（「未検証」として人間に見せる）
        console.error("[automation/status] QAゲートの実行に失敗:", error);
      }
      return {
        draftId: draft.id,
        reason,
        updatedAt: draft.updatedAt ?? draft.createdAt ?? "",
        text: draft.text.slice(0, 120),
        qa,
        qaSummary: qa ? summarizeReport(qa) : null,
      };
    })
  );
  approvalQueue.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const lastMeasuredAt =
    performance.records
      .map((record) => record.measuredAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;

  const lastSyncedAt =
    drafts
      .map((draft) => draft.metricsLastSyncedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;

  return {
    mode,
    effective: blockers.length === 0,
    blockers,
    today: {
      scheduled: slots.filter((slot) => slot.status === "queued" || slot.status === "scheduled")
        .length,
      published: publishedToday,
      limit: settings.flags.maxXPostsPerDay,
      slots,
    },
    approvalQueue,
    recent: {
      records: performance.records.length,
      lastSyncedAt,
      lastMeasuredAt,
    },
    freshness: {
      level: lastSyncedAt ? "daily" : "none",
      asOf: lastSyncedAt,
      source: "Buffer実績同期",
      note: lastSyncedAt ? null : "まだ実績を同期していません（x-performance-sync 未実行）",
    },
  };
}
