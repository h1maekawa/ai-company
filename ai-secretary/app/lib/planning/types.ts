/**
 * Morning Planning v2 — 1日の行動設計（Time Blocking OS）のデータモデル。
 *
 * 「タスク管理」ではなく「今日の行動をAIが時間で設計する」ためのもの。
 * タスクは必ず動詞ベース（例: 「営業電話を50件行う」）で扱う。
 */

/** 所要時間の3分類。UIのカラム／KPIカードと1:1で対応する */
export type TaskBucket = "quick" | "focus" | "deep";

export const BUCKETS: { id: TaskBucket; label: string; hint: string; color: string }[] = [
  { id: "quick", label: "15分", hint: "15分以内で終わること", color: "#38bdf8" },
  { id: "focus", label: "30分", hint: "30分程度かかること", color: "#a78bfa" },
  { id: "deep", label: "60分以上", hint: "まとまった集中が要ること", color: "#fb923c" },
];

/**
 * タスクの領域。所要時間(bucket)とは独立した軸で、
 * 「仕事として動いているか／生活として動いているか」を分ける。
 */
export type TaskCategory = "work" | "life";

export const TASK_CATEGORIES: { id: TaskCategory; label: string; icon: string; color: string }[] = [
  { id: "work", label: "仕事", icon: "💼", color: "#60a5fa" },
  { id: "life", label: "生活", icon: "🏠", color: "#4ade80" },
];

export function categoryOf(id: TaskCategory | undefined) {
  return TASK_CATEGORIES.find((c) => c.id === id);
}

/**
 * 1日の時間枠。「この時間は仕事」「ここからは自分の時間」を宣言するためのもの。
 * 24時間は増やせないので、タスクは必ずこの枠の中へ配置する。
 */
export type TimeWindow = {
  id: string;
  label: string;
  /** "HH:MM" */
  start: string;
  end: string;
  /** その枠で何をする時間か */
  category: TaskCategory;
};

/**
 * その行動に向いている時間帯。枠が同じカテゴリで複数あるとき、
 * どれを優先するかの判断に使う（「夕食を作る」が昼枠に入らないように）。
 */
export type TimeHint = "morning" | "daytime" | "evening" | "any";

/** 各ヒントが指す時間帯（分）。判定は重なりで行う */
export const TIME_HINT_RANGES: Record<Exclude<TimeHint, "any">, [number, number]> = {
  morning: [4 * 60, 11 * 60],
  daytime: [9 * 60, 18 * 60],
  evening: [17 * 60, 24 * 60],
};

/** 曜日ごとの枠。index 0=日曜 〜 6=土曜 */
export type WeeklyTemplate = {
  days: TimeWindow[][];
  updatedAt: string;
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 初期テンプレート。あくまで出発点で、実際の生活に合わせて画面から編集する。
 * 平日は日中を仕事、朝晩を自分の時間に。土日は終日プライベート。
 */
export function defaultWeeklyTemplate(): WeeklyTemplate {
  const weekday: TimeWindow[] = [
    { id: "w-morning", label: "朝の準備", start: "07:00", end: "09:00", category: "life" },
    { id: "w-am", label: "午前の仕事", start: "09:00", end: "12:00", category: "work" },
    { id: "w-lunch", label: "昼休み", start: "12:00", end: "13:00", category: "life" },
    { id: "w-pm", label: "午後の仕事", start: "13:00", end: "18:00", category: "work" },
    { id: "w-evening", label: "自分の時間", start: "18:00", end: "22:00", category: "life" },
  ];
  const holiday: TimeWindow[] = [
    { id: "h-morning", label: "午前", start: "08:00", end: "12:00", category: "life" },
    { id: "h-afternoon", label: "午後", start: "13:00", end: "22:00", category: "life" },
  ];
  const clone = (windows: TimeWindow[], prefix: string) =>
    windows.map((w) => ({ ...w, id: `${prefix}-${w.id}` }));

  return {
    days: [
      clone(holiday, "sun"),
      clone(weekday, "mon"),
      clone(weekday, "tue"),
      clone(weekday, "wed"),
      clone(weekday, "thu"),
      clone(weekday, "fri"),
      clone(holiday, "sat"),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** その日付（YYYY-MM-DD）に適用される枠を取り出す */
export function windowsForDate(template: WeeklyTemplate, date: string): TimeWindow[] {
  const weekday = new Date(`${date}T00:00:00+09:00`).getDay();
  return template.days[weekday] ?? [];
}

/** 枠の合計時間（分）をカテゴリ別に集計する */
export function windowCapacity(windows: TimeWindow[]): { work: number; life: number } {
  const capacity = { work: 0, life: 0 };
  for (const w of windows) {
    const minutes = Math.max(0, toMinutes(w.end) - toMinutes(w.start));
    capacity[w.category] += minutes;
  }
  return capacity;
}

/** 5=★★★★★（最優先） 〜 1=★☆☆☆☆ */
export type Priority = 1 | 2 | 3 | 4 | 5;

export type PlanTask = {
  id: string;
  /** 動詞ベースのタスク名 */
  title: string;
  bucket: TaskBucket;
  /** 実際にスケジュールへ確保する分数（bucketの目安から手動変更可） */
  minutes: number;
  priority: Priority;
  done: boolean;
  /**
   * 仕事 / 生活。カテゴリ導入前に作られたタスクには存在しないため任意。
   * 未設定のものは推測で埋めず、UIで「未分類」として明示する。
   */
  category?: TaskCategory;
  /** 向いている時間帯。未指定は "any" 扱い */
  timeHint?: TimeHint;
  /** AIが分類した理由（UIの補助表示用・任意） */
  note?: string;
};

/** AIが生成した時間割の1コマ */
export type TimeBlock = {
  taskId: string;
  title: string;
  /** "HH:MM" (JST) */
  start: string;
  end: string;
  bucket: TaskBucket;
  priority: Priority;
  category?: TaskCategory;
};

export type DailyPlan = {
  /** YYYY-MM-DD (JST) */
  date: string;
  tasks: PlanTask[];
  blocks: TimeBlock[];
  /** 稼働開始・終了（"HH:MM"） */
  workStart: string;
  workEnd: string;
  /** 休憩（昼）。ここはブロックを置かない（windows導入前との互換用） */
  breakStart: string;
  breakEnd: string;
  /**
   * その日に適用された時間枠のスナップショット。
   * テンプレートを後から変えても過去の記録が書き換わらないよう、日ごとに保存する。
   */
  windows?: TimeWindow[];
  /** Googleカレンダーへ同期済みならISO日時 */
  syncedAt?: string;
  updatedAt: string;
};

export const DEFAULT_WORK_HOURS = {
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
} as const;

export function bucketDefaultMinutes(bucket: TaskBucket): number {
  if (bucket === "quick") return 15;
  if (bucket === "focus") return 30;
  return 60;
}

export function emptyPlan(date: string): DailyPlan {
  return {
    date,
    tasks: [],
    blocks: [],
    ...DEFAULT_WORK_HOURS,
    updatedAt: new Date().toISOString(),
  };
}

// ─── 集計（Today's Dashboard用） ──────────────────────────────

export type PlanSummary = {
  total: number;
  done: number;
  remaining: number;
  /** 0-100 */
  completionRate: number;
  /** バケット別の件数 */
  byBucket: Record<TaskBucket, number>;
  /** カテゴリ別の件数。uncategorized は未設定のまま残っているもの */
  byCategory: { work: number; life: number; uncategorized: number };
  /** 今日の予定時間（分） */
  plannedMinutes: number;
  /** 現在時刻に該当するブロック（なければ null） */
  currentBlock: TimeBlock | null;
  /** 次に来るブロック（なければ null） */
  nextBlock: TimeBlock | null;
};

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function summarizePlan(plan: DailyPlan, nowHHMM: string): PlanSummary {
  const total = plan.tasks.length;
  const done = plan.tasks.filter((t) => t.done).length;
  const byBucket: Record<TaskBucket, number> = { quick: 0, focus: 0, deep: 0 };
  const byCategory = { work: 0, life: 0, uncategorized: 0 };
  for (const task of plan.tasks) {
    byBucket[task.bucket] += 1;
    if (task.category === "work") byCategory.work += 1;
    else if (task.category === "life") byCategory.life += 1;
    else byCategory.uncategorized += 1;
  }

  const plannedMinutes = plan.tasks
    .filter((t) => !t.done)
    .reduce((sum, t) => sum + t.minutes, 0);

  const now = toMinutes(nowHHMM);
  let currentBlock: TimeBlock | null = null;
  let nextBlock: TimeBlock | null = null;
  for (const block of plan.blocks) {
    const start = toMinutes(block.start);
    const end = toMinutes(block.end);
    if (now >= start && now < end) currentBlock = block;
    if (start > now && !nextBlock) nextBlock = block;
  }

  return {
    total,
    done,
    remaining: total - done,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    byBucket,
    byCategory,
    plannedMinutes,
    currentBlock,
    nextBlock,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0分";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** JSTの今日 (YYYY-MM-DD) */
export function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** JSTの現在時刻 (HH:MM) */
export function nowJst(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
