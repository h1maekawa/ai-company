/**
 * Department Control Center の決定論的な表示・判定ロジック。
 *
 * - Backendの Availability（UNKNOWN 等）は変更しない。CEO UI上の表示だけを変換する。
 * - 0 と UNKNOWN を混同しない。値が無いものは「未取得」。
 * - ここにあるものは I/O を持たず、QAテストから直接検査できる。
 */

export const UNKNOWN_LABEL = "未取得";

/** Backend enum の UNKNOWN / null を CEO UI 向けの「未取得」に変換する（表示のみ）。 */
export function displayStatus(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "" || value === "UNKNOWN") return UNKNOWN_LABEL;
  return value;
}

/** 円は小数を出さない。内部値は丸めず、表示だけ整形する。 */
export function formatYen(value: number | null | undefined, options: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN_LABEL;
  const rounded = Math.round(value);
  const sign = options.sign && rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}¥${Math.abs(rounded).toLocaleString("ja-JP")}`;
}

type MetricLike = { value: number | null; unit?: string; displayValue?: string };

/** DepartmentMetric を CEO UI 向けに表示する。円は ¥ 表記、null は「未取得」。 */
export function formatMetricValue(metric: MetricLike | null | undefined, options: { sign?: boolean } = {}): string {
  if (!metric) return UNKNOWN_LABEL;
  if (metric.displayValue) return metric.displayValue;
  if (metric.value === null || !Number.isFinite(metric.value)) return UNKNOWN_LABEL;
  if (metric.unit === "円") return formatYen(metric.value, options);
  const rounded = Math.abs(metric.value) >= 100 ? Math.round(metric.value) : Math.round(metric.value * 100) / 100;
  return `${rounded.toLocaleString("ja-JP")}${metric.unit ?? ""}`;
}

/** ISO時刻を「n時間前」等へ。無ければ未取得。 */
export function formatRelativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return UNKNOWN_LABEL;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return UNKNOWN_LABEL;
  const minutes = Math.max(0, Math.round((now.getTime() - at) / 60_000));
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

/* ─── AI社員の現在稼働率 ─────────────────────────── */

export const ACTIVE_AGENT_STATUSES = ["THINKING", "RESEARCHING", "EXECUTING", "REVIEWING"] as const;

export type EmployeeUtilization = {
  total: number;
  active: number;
  waitingApproval: number;
  error: number;
  idle: number;
  complete: number;
  unknown: number;
  /** active / total。total=0 のとき null（UNKNOWN） */
  utilization: number | null;
  /** 勤務時間やCPU時間ではなく、現在のMission状態から算出した瞬間値である */
  basis: "CURRENT_MISSION_STATE";
};

/** WAITING_APPROVAL は稼働中に含めない。 */
export function computeEmployeeUtilization(statuses: string[]): EmployeeUtilization {
  const count = (predicate: (status: string) => boolean) => statuses.filter(predicate).length;
  const active = count((status) => (ACTIVE_AGENT_STATUSES as readonly string[]).includes(status));
  const known = new Set<string>([...ACTIVE_AGENT_STATUSES, "WAITING_APPROVAL", "ERROR", "IDLE", "COMPLETE"]);
  return {
    total: statuses.length,
    active,
    waitingApproval: count((status) => status === "WAITING_APPROVAL"),
    error: count((status) => status === "ERROR"),
    idle: count((status) => status === "IDLE"),
    complete: count((status) => status === "COMPLETE"),
    unknown: count((status) => !known.has(status)),
    utilization: statuses.length === 0 ? null : active / statuses.length,
    basis: "CURRENT_MISSION_STATE",
  };
}

/* ─── CEO確認カード ─────────────────────────────── */

export type AttentionCardType = "ACTION_REQUIRED" | "PROPOSAL" | "DATA_MISSING" | "WARNING";
export type AttentionCard = { id: string; type: AttentionCardType; title: string; detail?: string; href?: string };

/**
 * Creator Revenue を CEO確認へ昇格させる条件。
 * Revenueがまだ記録されていないだけ（UNKNOWN）は blocker ではなく、KPI欄で「未取得」と表示する。
 */
export function creatorRevenueAttention(input: {
  economicsAvailable: boolean;
  workflows?: Array<{ id: string; title: string; steps: Array<{ status: string; inputRefs: string[]; outputRefs: string[] }> }>;
}): AttentionCard[] {
  const cards: AttentionCard[] = [];
  if (!input.economicsAvailable) {
    cards.push({ id: "creator-revenue-ledger-error", type: "ACTION_REQUIRED", title: "Revenue Ledgerの取得に失敗しました", detail: "Revenue計測の読み込みエラーです。接続状態を確認してください。", href: "/connections" });
  }
  for (const workflow of input.workflows ?? []) {
    const blockedOnRevenue = workflow.steps.some((step) => ["BLOCKED", "FAILED"].includes(step.status) && [...step.inputRefs, ...step.outputRefs].some((ref) => /revenue/i.test(ref)));
    if (blockedOnRevenue) cards.push({ id: `creator-revenue-workflow-${workflow.id}`, type: "ACTION_REQUIRED", title: `「${workflow.title}」がRevenueデータ待ちで停止しています`, href: "/content/revenue" });
  }
  return cards;
}

/* ─── Skill Proposal の部門判定 ─────────────────── */

type SkillLike = { id: string; allowedSecretaries: string[] };

/** Skill.allowedSecretaries と部門所属AI社員の intersection で判定する。キーワード判定はしない。 */
export function departmentSkillIds(skills: SkillLike[], employeeIds: string[]): string[] {
  const employees = new Set(employeeIds);
  return skills.filter((skill) => skill.allowedSecretaries.some((agentId) => employees.has(agentId))).map((skill) => skill.id);
}

/* ─── CEO補足（append-only） ─────────────────────── */

export const HUMAN_NOTE_MAX_LENGTH = 1000;
export type HumanDecisionTargetType = "skill-improvement" | "skill-candidate" | "constitution-proposal";

/**
 * AI提案本文とは別に保存する、人間の判断と補足。
 * 元のProposalを書き換えず、これ単体ではSkill実装・Policy変更を開始しない。
 */
export type HumanDecisionFeedback = {
  id: string;
  targetType: HumanDecisionTargetType;
  targetId: string;
  departmentId?: string;
  decision: "APPROVED" | "HOLD" | "REJECTED";
  /** CEO補足。AI提案とは区別して表示する */
  note: string | null;
  actor: "ceo";
  confirmedByHuman: true;
  createdAt: string;
  codeChanged: false;
  registryChanged: false;
  policyChanged: false;
  engineeringStarted: false;
};

/** 制御文字を落とし、長さを制限する。HTMLはReactのテキスト描画でエスケープされる。 */
export function sanitizeHumanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, HUMAN_NOTE_MAX_LENGTH);
}

export function createHumanDecisionFeedback(input: { id: string; targetType: HumanDecisionTargetType; targetId: string; departmentId?: string; decision: HumanDecisionFeedback["decision"]; note?: unknown; now?: Date }): HumanDecisionFeedback {
  return {
    id: input.id,
    targetType: input.targetType,
    targetId: input.targetId,
    departmentId: input.departmentId,
    decision: input.decision,
    note: sanitizeHumanNote(input.note),
    actor: "ceo",
    confirmedByHuman: true,
    createdAt: (input.now ?? new Date()).toISOString(),
    codeChanged: false,
    registryChanged: false,
    policyChanged: false,
    engineeringStarted: false,
  };
}

/** append-only。既存recordは変更しない。 */
export function appendHumanDecisionFeedback(existing: HumanDecisionFeedback[] | undefined, record: HumanDecisionFeedback, limit = 500): HumanDecisionFeedback[] {
  return [...(existing ?? []), record].slice(-limit);
}

/** runtime が未初期化の state に判断記録を追加するときの空の RunnerState。 */
export function emptyRunnerState(): { runs: Record<string, never>; executions: never[]; artifacts: never[]; learning: never[]; humanDecisionFeedback?: HumanDecisionFeedback[]; departmentKpiGoals?: DepartmentKpiGoal[] } {
  return { runs: {}, executions: [], artifacts: [], learning: [] };
}

/** 同じ対象の最新の人間判断。Constitution Proposalの状態表示に使う。 */
export function latestDecisionFor(records: HumanDecisionFeedback[] | undefined, targetType: HumanDecisionTargetType, targetId: string): HumanDecisionFeedback | null {
  return (records ?? []).filter((record) => record.targetType === targetType && record.targetId === targetId).at(-1) ?? null;
}

/* ─── Department KPI Goal ───────────────────────── */

export const KPI_GOAL_DEPARTMENTS = ["creator", "fund"] as const;
export const KPI_GOAL_PERIODS = ["daily", "weekly", "monthly"] as const;
export type DepartmentKpiGoal = {
  departmentId: (typeof KPI_GOAL_DEPARTMENTS)[number];
  metric: string;
  target: number;
  period: (typeof KPI_GOAL_PERIODS)[number];
  note?: string;
  confirmedByHuman: true;
  updatedAt: string;
};

/** Creator KPI 定義。metric は Department Read Model の metric key。未接続のものは null。 */
export const CREATOR_KPI_DEFINITIONS: Array<{ metric: string; label: string; sourceMetric: string | null }> = [
  { metric: "x_impressions", label: "Reach / Impressions", sourceMetric: "x_impressions" },
  { metric: "new_followers", label: "New Followers", sourceMetric: null },
  { metric: "follow_conversion", label: "Follow Conversion", sourceMetric: null },
  { metric: "profile_visits", label: "Profile Visits", sourceMetric: null },
  { metric: "link_clicks", label: "Link Clicks", sourceMetric: "link_clicks" },
  { metric: "note_views", label: "note Views", sourceMetric: "note_views" },
  { metric: "conversions", label: "Conversions", sourceMetric: "conversions" },
  { metric: "revenue", label: "Revenue", sourceMetric: "revenue" },
];

/** 人間の入力だけを受け付ける。confirmedByHuman !== true は拒否する（AIによる確定を防ぐ）。 */
export function validateKpiGoalInput(input: Record<string, unknown>, departmentId: string, now = new Date()): DepartmentKpiGoal {
  if (!(KPI_GOAL_DEPARTMENTS as readonly string[]).includes(departmentId)) throw new Error("KPI_GOAL_DEPARTMENT_NOT_SUPPORTED");
  if (input.confirmedByHuman !== true) throw new Error("HUMAN_CONFIRMATION_REQUIRED");
  const metric = typeof input.metric === "string" ? input.metric.trim() : "";
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(metric)) throw new Error("INVALID_METRIC");
  const target = typeof input.target === "number" ? input.target : Number(input.target);
  if (!Number.isFinite(target) || target < 0) throw new Error("INVALID_TARGET");
  const period = String(input.period ?? "");
  if (!(KPI_GOAL_PERIODS as readonly string[]).includes(period)) throw new Error("INVALID_PERIOD");
  const note = sanitizeHumanNote(input.note);
  return { departmentId: departmentId as DepartmentKpiGoal["departmentId"], metric, target, period: period as DepartmentKpiGoal["period"], ...(note ? { note: note.slice(0, 300) } : {}), confirmedByHuman: true, updatedAt: now.toISOString() };
}

/** 同じ department + metric の目標は置き換える（履歴ではなく現在の目標）。 */
export function upsertKpiGoal(goals: DepartmentKpiGoal[] | undefined, goal: DepartmentKpiGoal): DepartmentKpiGoal[] {
  return [...(goals ?? []).filter((item) => !(item.departmentId === goal.departmentId && item.metric === goal.metric)), goal];
}

/* ─── Fund ───────────────────────────────────────── */

/**
 * Thesis Alert は Thesis の実データ（WEAKENED / INVALIDATED）だけを数える。
 * 株価下落だけでは Alert にしない。同じ decision の最新 observation を採用する。
 */
export function thesisAlertCount(outcomes: Array<{ decisionId: string; observedAt: string; thesisStatus: string | null; ticker?: string }> | null | undefined): number | null {
  if (!outcomes) return null;
  const latest = new Map<string, { observedAt: string; thesisStatus: string | null }>();
  for (const outcome of outcomes) {
    const prior = latest.get(outcome.decisionId);
    if (!prior || prior.observedAt < outcome.observedAt) latest.set(outcome.decisionId, outcome);
  }
  return [...latest.values()].filter((item) => item.thesisStatus === "WEAKENED" || item.thesisStatus === "INVALIDATED").length;
}

/** 実データの nextReviewAt のうち、現在以降で最も近いもの。無ければ null（捏造しない）。 */
export function nextReviewAt(recommendations: Array<{ nextReviewAt?: string | null; ticker?: string }> | null | undefined, now = new Date()): { at: string; ticker?: string } | null {
  const upcoming = (recommendations ?? [])
    .filter((item) => item.nextReviewAt && Number.isFinite(Date.parse(item.nextReviewAt)) && Date.parse(item.nextReviewAt) >= now.getTime())
    .sort((a, b) => String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)));
  return upcoming[0] ? { at: upcoming[0].nextReviewAt!, ticker: upcoming[0].ticker } : null;
}
