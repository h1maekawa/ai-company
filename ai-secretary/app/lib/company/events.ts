/**
 * 会社の活動イベント — AI Company OS v3.1 §25 Observability
 *
 * 位置づけ:
 *   Organization Observer（§3）が読む唯一の入口。
 *   現状、記録は saveChatLog / AgentTask / ReviewFeedback / HistoryEntry /
 *   ContentPerformance と6箇所以上に分かれ、形式もバラバラで、
 *   処理時間・タスク単位のコストは記録されていない。
 *   Pattern Analyzer（§4）と Proposal Score（§8）は、ここが揃って初めて成立する。
 *
 * 設計方針:
 *   - 既存の記録は消さない。イベントは「横断で数えるための薄い層」として併存させる
 *   - 記録の失敗で本処理を止めない（ログのために仕事が止まるのは本末転倒）
 *   - signature を決定論的に作る。反復検出の精度がこれで決まる
 */

export type CompanyEventKind =
  | "chat.request"
  | "task.created"
  | "task.completed"
  | "task.failed"
  | "pipeline.step"
  | "review.decision"
  | "cron.run"
  | "error"
  /* ─── Phase 3 で分析対象にする種別（追加のみ・既存は変更しない） ─── */
  | "agent.called"
  | "skill.called"
  | "workflow.started"
  | "workflow.completed"
  | "tool.called"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "human.corrected"
  | "decision.created"
  | "security.blocked";

export type CompanyEventOutcome = "success" | "failure" | "skipped";

export type CompanyEvent = {
  id: string;
  /** ISO8601 */
  at: string;
  kind: CompanyEventKind;

  /** どこの仕事か。未分類は "unassigned" */
  department: string;
  /** 誰がやったか。秘書ID または エージェント役割 */
  actor: string;
  /** 使ったSkill（あれば） */
  skillId?: string;

  /** 何をしたかの1行。人が読む */
  action: string;
  outcome: CompanyEventOutcome;

  /**
   * 反復検出のキー（§4 Repeated Task Pattern）。
   * 同じ種類の仕事が必ず同じ値になるよう正規化する。
   * 揺れると「3回以上でSkill候補」の判定がすり抜ける。
   */
  signature: string;

  /**
   * 人の手が入ったか。CEO介入率（§13）の分子になる。
   * 承認そのものは介入に数えない（承認は設計上の関門であって手戻りではない）。
   * 差し戻し・編集して承認・手動修正だけを true にする。
   */
  humanIntervention: boolean;

  /** 処理時間。測れないものは undefined（0で埋めない） */
  latencyMs?: number;
  /** このイベントで発生した推定コスト（USD）。測れないものは undefined */
  costUsd?: number;

  /** 失敗理由・補足 */
  detail?: string;

  /**
   * 使ったツール（Phase 3 の Workflow Candidate 検出で使う）。
   * 記録できない経路では undefined のままにする（空配列で「使わなかった」と誤解させない）。
   */
  tools?: string[];
  /** 再試行回数。Retry率の算出に使う */
  retries?: number;
  /** 何回目の試行か（初回は1）。retries と対で記録する（Phase 4 §8） */
  attempt?: number;
  retryReason?: string;

  /** 処理の開始・終了（Phase 4 §9）。latencyMs と併せて記録する */
  startedAt?: string;
  completedAt?: string;

  /** コストの内訳（Phase 4 §7）。costUsd が確定できた場合のみ併記する */
  cost?: {
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  };
  /** コストを確定できなかった理由。costUsd が undefined のとき入る */
  costUnknownReason?: string;
  /**
   * 同じ一連の仕事をまとめるID。
   * Workflow（Skill/Agentの実行順序）を復元するのに使う。
   */
  traceId?: string;
  /** 入れ子の親トレース（Phase 4 §5） */
  parentTraceId?: string;
  /** 実行したSkill / Workflow（Phase 4 §5） */
  workflowId?: string;
};

/**
 * signature の正規化。
 *
 * 数値・日付・IDなど毎回変わる部分を落とし、「仕事の種類」だけを残す。
 * 例: 「note記事を書いて（2026-09-12）」と「note記事を書いて（2026-09-13）」を
 *     同じ signature にしないと、反復として数えられない。
 */
export function normalizeSignature(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}(?:t[\d:.]+z?)?/g, "") // 日付・時刻
    .replace(/[0-9]+/g, "") // 残った数値
    .replace(/[「」『』（）()［］\[\]【】"'`]/g, "") // 括弧・引用符
    .replace(/[・･,、。.\/\\|:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export type CreateEventInput = Omit<CompanyEvent, "id" | "at" | "signature" | "humanIntervention"> & {
  /** 省略時は action から作る */
  signature?: string;
  humanIntervention?: boolean;
  now?: Date;
};

export function createCompanyEvent(input: CreateEventInput): CompanyEvent {
  const now = (input.now ?? new Date()).toISOString();
  const { signature, humanIntervention, now: _ignored, ...rest } = input;

  return {
    ...rest,
    id: `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now,
    signature: normalizeSignature(signature ?? `${rest.actor}:${rest.action}`),
    humanIntervention: humanIntervention ?? false,
  };
}
