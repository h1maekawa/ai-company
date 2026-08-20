/**
 * Capture Application Service（Phase4 修正4）。
 *
 * Chat / Research / Skill / Workflow など、学び候補が発生しうる全機能から
 * **この関数だけ** を経由して Inbox へ Capture する（重複ロジックを各機能へコピーしない）。
 *
 * 設計上の約束:
 * - 全会話・全出力を無条件保存しない。呼び出し側が「Knowledge Candidateとして保存する価値がある」と
 *   判断したときだけ呼ぶ（判断基準は呼び出し側のドメイン知識に依存するため、ここでは強制しない）。
 * - **絶対に throw しない**。Captureの失敗が既存機能（チャット応答・リサーチ実行等）を壊してはならない。
 * - 正式Knowledgeは作らない。必ず Inbox の captured/candidate 止まり（昇格は人間承認）。
 */

import { captureToInbox, prepareCandidate, type CaptureItem } from "./lifecycle";
import { organizeCaptureItem } from "./organize";
import type { CaptureSource } from "./types";

export interface CaptureRequest {
  content: string;
  source: CaptureSource;
  title?: string;
  /** false にすると AI整理せず captured のまま置く（バッチ整理したい場合） */
  organize?: boolean;
}

export interface CaptureOutcome {
  ok: boolean;
  status?: "captured" | "candidate";
  path?: string;
  error?: string;
}

/** Capture の最低文字数。短すぎる断片はノイズになるため保存しない。 */
const MIN_CAPTURE_LENGTH = 40;

export async function captureKnowledgeCandidate(
  req: CaptureRequest
): Promise<CaptureOutcome> {
  try {
    const content = (req.content || "").trim();
    if (content.length < MIN_CAPTURE_LENGTH) {
      return { ok: false, error: "内容が短すぎるためCaptureしません" };
    }

    const captured: CaptureItem = await captureToInbox({
      content,
      source: req.source,
      title: req.title,
    });

    if (req.organize === false) {
      return { ok: true, status: "captured", path: captured.path };
    }

    try {
      const organize = await organizeCaptureItem(content);
      const candidate = await prepareCandidate(captured.path, organize);
      return { ok: true, status: "candidate", path: candidate.path };
    } catch (organizeErr) {
      // 整理に失敗しても Capture 自体は成功として扱う（後でバッチ整理できる）
      console.error("[captureService] AI整理に失敗（Captureは保存済み）:", organizeErr);
      return { ok: true, status: "captured", path: captured.path };
    }
  } catch (e) {
    console.error("[captureService] Captureに失敗（非致命）:", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
