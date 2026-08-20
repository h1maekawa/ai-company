/**
 * Approved Write の承認トークン（Phase4 修正1, docs/14 ADR-F）。
 *
 * Human Managed 領域（正式Knowledge）への書き込みは、
 *   User Action → Weekly Review / Promotion UI → Server-side Handler → Internal Approved Write
 * という経路でのみ許可する。
 *
 * 重要: 承認は **boolean フラグではなくオブジェクト同一性** で検証する。
 * grant は module-private な WeakSet に登録されたオブジェクトだけが有効なので、
 * HTTP リクエストの JSON からは構造上ぜったいに偽造できない
 * （JSON.parse で作られたオブジェクトは WeakSet に入っていないため）。
 *
 * したがって `{"approved": true}` を送りつけても Human Managed 領域は書き換えられない。
 */

export type ApprovalReason = "promotion" | "merge" | "human_edit";

export interface ApprovalGrant {
  readonly reason: ApprovalReason;
  readonly issuedAt: string;
  /** 監査用の短い説明（誰の・どの操作による承認か） */
  readonly note?: string;
}

/** 有効な grant のレジストリ。module-private。外部からは参照も追加もできない。 */
const VALID_GRANTS = new WeakSet<object>();

/**
 * サーバー内部の「人間承認済み処理」だけが呼ぶ。
 * 呼び出してよいのは、ユーザーの明示操作を受けた Promotion / Merge ハンドラのみ。
 * ※ リクエストボディの値をそのまま条件にして発行してはならない。
 */
export function issueApprovalGrant(reason: ApprovalReason, note?: string): ApprovalGrant {
  const grant: ApprovalGrant = Object.freeze({
    reason,
    issuedAt: new Date().toISOString(),
    note,
  });
  VALID_GRANTS.add(grant);
  return grant;
}

/** grant が本物（サーバー内部で発行されたもの）か検証する。 */
export function isValidApprovalGrant(value: unknown): value is ApprovalGrant {
  if (!value || typeof value !== "object") return false;
  return VALID_GRANTS.has(value as object);
}
