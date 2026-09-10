/**
 * 自動テスト（QAゲート）の共通型 — 要件9
 *
 * 位置づけ:
 *   人間承認の「前段」に置く決定論的な検査。AIには判定させない。
 *   ここが出す QaReport を、承認フィード（要件2）が表示し、
 *   自動承認（要件10）が「全て通過したか」の判定に使う。
 *
 * 重要な区別:
 *   blocking … 落ちたら人間承認へ必ず回す（自動承認をさせない）
 *   warning  … 表示はするが承認は止めない
 * この2値だけで要件10のフォールバック条件が決まるため、
 * 新しい検査を足すときは必ずどちらかを明示すること。
 */

export type QaSeverity = "blocking" | "warning";

export type QaStatus = "pass" | "fail" | "skipped";

export type QaCheck = {
  /** 安定したID。承認フィードで前回結果と突き合わせるため変更しない */
  id: string;
  label: string;
  status: QaStatus;
  severity: QaSeverity;
  /** 落ちた理由・警告内容。通過時は null */
  detail: string | null;
};

export type QaTargetKind = "x_draft" | "note_article" | "publish_flow";

export type QaReport = {
  targetId: string;
  targetKind: QaTargetKind;
  checks: QaCheck[];
  /**
   * blocking がひとつも fail していない。
   * 要件10の自動承認は、これが true のフェーズだけスキップできる。
   */
  passed: boolean;
  /** 落ちた blocking の数 */
  blockingFailures: number;
  /** 落ちた warning の数 */
  warnings: number;
  /** データ不足などで実行できなかった検査の数 */
  skipped: number;
  ranAt: string;
};

export function check(
  id: string,
  label: string,
  severity: QaSeverity,
  failDetail: string | null
): QaCheck {
  return {
    id,
    label,
    severity,
    status: failDetail === null ? "pass" : "fail",
    detail: failDetail,
  };
}

/** データが無くて判定できない場合。pass とは区別する（黙って通さない） */
export function skippedCheck(
  id: string,
  label: string,
  severity: QaSeverity,
  reason: string
): QaCheck {
  return { id, label, severity, status: "skipped", detail: reason };
}

export function buildReport(
  targetId: string,
  targetKind: QaTargetKind,
  checks: QaCheck[],
  now: Date = new Date()
): QaReport {
  const blockingFailures = checks.filter(
    (c) => c.severity === "blocking" && c.status === "fail"
  ).length;
  const warnings = checks.filter(
    (c) => c.severity === "warning" && c.status === "fail"
  ).length;
  const skipped = checks.filter((c) => c.status === "skipped").length;

  return {
    targetId,
    targetKind,
    checks,
    passed: blockingFailures === 0,
    blockingFailures,
    warnings,
    skipped,
    ranAt: now.toISOString(),
  };
}

/** 複数レポートを1つに畳む（記事＋投稿フローなど） */
export function mergeReports(
  targetId: string,
  targetKind: QaTargetKind,
  reports: QaReport[],
  now: Date = new Date()
): QaReport {
  return buildReport(
    targetId,
    targetKind,
    reports.flatMap((r) => r.checks),
    now
  );
}
