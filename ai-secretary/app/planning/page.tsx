"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DayTimeline } from "@/components/planning/DayTimeline";
import { TemplateEditor } from "@/components/planning/TemplateEditor";
import {
  BUCKETS,
  DailyPlan,
  PlanSummary,
  PlanTask,
  Priority,
  TaskBucket,
  TaskCategory,
  TASK_CATEGORIES,
  categoryOf,
  bucketDefaultMinutes,
  formatDuration,
  nowJst,
} from "@/app/lib/planning/types";

type PlanResponse = {
  plan: DailyPlan;
  summary: PlanSummary;
  calendarConfigured: boolean;
  suggestions?: string[];
  overflow?: PlanTask[];
  degraded?: boolean;
  error?: string;
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 11) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function PlanningPage() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [calendarConfigured, setCalendarConfigured] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(true);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"" | "classify" | "schedule" | "sync">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** AI分類が落ちて仮の値で作られたときの警告 */
  const [degraded, setDegraded] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  /** 表示するカテゴリ。null は「すべて」 */
  const [filter, setFilter] = useState<TaskCategory | "uncategorized" | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const apply = useCallback((data: PlanResponse) => {
    setPlan(data.plan);
    setSummary(data.summary);
    setCalendarConfigured(data.calendarConfigured);
    if (data.suggestions) setSuggestions(data.suggestions);
  }, []);

  useEffect(() => {
    fetch("/api/planning")
      .then((r) => r.json())
      .then((data: PlanResponse) => {
        if (!data.error) apply(data);
      })
      .catch(() => setError("プランの読み込みに失敗しました"));
  }, [apply]);

  async function post(url: string, body: unknown, kind: typeof busy) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as PlanResponse & {
        result?: { created: number; deleted: number };
        added?: number;
      };
      if (!response.ok) throw new Error(data.error || "失敗しました");
      apply(data);
      if (data.added) {
        setInput("");
        setNotice(`${data.added}件のタスクを追加しました`);
        setDegraded(Boolean(data.degraded));
      }
      if (data.result) {
        setNotice(`Googleカレンダーへ${data.result.created}件同期しました`);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
      return false;
    } finally {
      setBusy("");
    }
  }

  /** タスク編集は即保存する（優先度・分数・完了・バケット移動） */
  async function persistTasks(tasks: PlanTask[]) {
    if (!plan) return;
    setPlan({ ...plan, tasks });
    setError("");
    try {
      const response = await fetch("/api/planning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: plan.date, tasks }),
      });
      const data = (await response.json()) as PlanResponse;
      if (!response.ok) throw new Error(data.error || "保存に失敗しました");
      apply(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  function updateTask(id: string, patch: Partial<PlanTask>) {
    if (!plan) return;
    persistTasks(plan.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTask(id: string) {
    if (!plan) return;
    persistTasks(plan.tasks.filter((t) => t.id !== id));
  }

  /** 未分類 → 仕事 → 生活 → 未分類 と切り替える */
  function cycleCategory(id: string) {
    if (!plan) return;
    const task = plan.tasks.find((t) => t.id === id);
    if (!task) return;
    const next: TaskCategory | undefined =
      task.category === "work" ? "life" : task.category === "life" ? undefined : "work";
    persistTasks(
      plan.tasks.map((t) => {
        if (t.id !== id) return t;
        const { category: _drop, ...rest } = t;
        return next ? { ...rest, category: next } : rest;
      })
    );
  }

  /** タイムラインへドロップして時刻を固定する */
  function pinTask(id: string, startHHMM: string) {
    if (!plan) return;
    const next = plan.tasks.map((t) => (t.id === id ? { ...t, pinnedStart: startHHMM } : t));
    persistTasks(next).then(() => post("/api/planning/schedule", { date: plan.date }, "schedule"));
  }

  /** 固定を解除して自動配置へ戻す */
  function unpinTask(id: string) {
    if (!plan) return;
    const next = plan.tasks.map((t) => {
      if (t.id !== id) return t;
      const { pinnedStart: _drop, ...rest } = t;
      return rest;
    });
    persistTasks(next).then(() => post("/api/planning/schedule", { date: plan.date }, "schedule"));
  }

  function moveToBucket(id: string, bucket: TaskBucket) {
    if (!plan) return;
    const task = plan.tasks.find((t) => t.id === id);
    if (!task || task.bucket === bucket) return;
    updateTask(id, { bucket, minutes: bucketDefaultMinutes(bucket) });
  }

  const hasTasks = (plan?.tasks.length ?? 0) > 0;
  const hasBlocks = (plan?.blocks.length ?? 0) > 0;
  // 時間割に入らなかったタスク。リロード後も出るようplanから導出する
  const scheduledIds = new Set((plan?.blocks ?? []).map((b) => b.taskId));
  const overflow = hasBlocks
    ? (plan?.tasks ?? []).filter((t) => !t.done && !scheduledIds.has(t.id))
    : [];

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-7 pb-28">
        {/* ─── Header ─────────────────────────────── */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-amber-400">MORNING PLANNING</p>
            <h1 className="mt-1 text-2xl font-bold">
              {greeting()}
              <span className="ml-2 text-base font-normal text-slate-400">{plan?.date ?? ""}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              今日やることを動詞ベースで書き出すと、AIが時間割へ設計します。
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← AI Company
          </Link>
        </header>

        {/* ─── 現在地（今なにをすべきか） ───────────── */}
        {summary?.currentBlock ? (
          <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-xs font-semibold text-amber-300">NOW — 今これをやる</p>
            <p className="mt-1 text-lg font-bold">{summary.currentBlock.title}</p>
            <p className="text-sm text-amber-200/80">
              {summary.currentBlock.start}〜{summary.currentBlock.end}
            </p>
          </div>
        ) : summary?.nextBlock ? (
          <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-semibold text-slate-400">NEXT — 次のブロック</p>
            <p className="mt-1 text-lg font-bold">{summary.nextBlock.title}</p>
            <p className="text-sm text-slate-400">
              {summary.nextBlock.start}〜{summary.nextBlock.end}
            </p>
          </div>
        ) : null}

        {/* ─── KPIカード ───────────────────────────── */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="今日やること"
            value={`${summary?.total ?? 0}件`}
            accent="#e2e8f0"
            sub={`💼${summary?.byCategory.work ?? 0} ・ 🏠${summary?.byCategory.life ?? 0}`}
          />
          {BUCKETS.map((bucket) => (
            <Kpi
              key={bucket.id}
              label={bucket.label}
              value={`${summary?.byBucket[bucket.id] ?? 0}件`}
              accent={bucket.color}
            />
          ))}
          <Kpi
            label="今日の予定時間"
            value={formatDuration(summary?.plannedMinutes ?? 0)}
            accent="#34d399"
          />
          <Kpi
            label="完了率"
            value={`${summary?.completionRate ?? 0}%`}
            accent="#f472b6"
            sub={`残 ${summary?.remaining ?? 0}件`}
          />
        </section>

        {/* ─── 朝会入力 ───────────────────────────── */}
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-bold">🌅 朝会 — 今日やることを書き出す</h2>
          <p className="mt-1 text-xs text-slate-500">
            動詞ベースで1行ずつ。例：「営業電話を50件行う」「家計簿アプリを修正する」「noteを書く」
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder={"営業電話を50件行う\n家計簿アプリを修正する\nnoteを書く\nSlackの返信をする"}
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => post("/api/planning/classify", { text: input, date: plan?.date }, "classify")}
              disabled={busy !== "" || !input.trim()}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold hover:bg-amber-500 disabled:opacity-40"
            >
              {busy === "classify" ? "AIが分類中…" : "✨ AIで時間分けする"}
            </button>
            <button
              onClick={() => post("/api/planning/schedule", { date: plan?.date }, "schedule")}
              disabled={busy !== "" || !hasTasks}
              className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
            >
              {busy === "schedule" ? "生成中…" : "🧠 時間割を生成"}
            </button>
            <button
              onClick={() => post("/api/planning/schedule", { date: plan?.date, fromNow: true }, "schedule")}
              disabled={busy !== "" || !hasTasks}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40"
            >
              今から詰め直す
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}
          {degraded && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-300">
                AIの分類が使えなかったため、仮の値で登録しました
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                所要時間30分・優先度★3・カテゴリ未分類は推定ではなく既定値です。
                各タスクのチップをクリックして調整するか、しばらく待って入力し直してください。
              </p>
            </div>
          )}
        </section>

        {/* ─── メイン: 左=タスク / 右=タイムライン ───── */}
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          {/* 左: バケット別タスク */}
          <section className="space-y-4">
            {/* カテゴリフィルタ */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              {[
                { id: null as TaskCategory | "uncategorized" | null, label: "すべて", icon: "" },
                ...TASK_CATEGORIES.map((c) => ({ id: c.id as TaskCategory | "uncategorized" | null, label: c.label, icon: c.icon })),
                ...((summary?.byCategory.uncategorized ?? 0) > 0
                  ? [{ id: "uncategorized" as TaskCategory | "uncategorized" | null, label: "未分類", icon: "❓" }]
                  : []),
              ].map((tab) => {
                const count =
                  tab.id === null
                    ? summary?.total ?? 0
                    : tab.id === "uncategorized"
                      ? summary?.byCategory.uncategorized ?? 0
                      : summary?.byCategory[tab.id] ?? 0;
                const active = filter === tab.id;
                return (
                  <button
                    key={String(tab.id)}
                    onClick={() => setFilter(tab.id)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active ? "bg-amber-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {tab.icon && <span className="mr-1">{tab.icon}</span>}
                    {tab.label}
                    <span className={`ml-1.5 ${active ? "text-white/70" : "text-slate-600"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {BUCKETS.map((bucket) => {
              const tasks = (plan?.tasks ?? [])
                .filter((t) => t.bucket === bucket.id)
                .filter((t) =>
                  filter === null
                    ? true
                    : filter === "uncategorized"
                      ? !t.category
                      : t.category === filter
                )
                .sort((a, b) => b.priority - a.priority);
              return (
                <div
                  key={bucket.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragTaskId) moveToBucket(dragTaskId, bucket.id);
                    setDragTaskId(null);
                  }}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  style={{ borderTopColor: bucket.color, borderTopWidth: 3 }}
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-bold" style={{ color: bucket.color }}>
                      {bucket.label}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {tasks.length}件・{bucket.hint}
                    </span>
                  </div>

                  {tasks.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-600">
                      ここにドラッグして移動できます
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          color={bucket.color}
                          onDragStart={() => setDragTaskId(task.id)}
                          onDragEnd={() => setDragTaskId(null)}
                          onToggle={() => updateTask(task.id, { done: !task.done })}
                          onPriority={(p) => updateTask(task.id, { priority: p })}
                          onCategory={() => cycleCategory(task.id)}
                          onMinutes={(m) => updateTask(task.id, { minutes: m })}
                          onRemove={() => removeTask(task.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          {/* 右: 1日の時間枠とタイムライン */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:sticky lg:top-5 lg:self-start">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">今日の使い方</h3>
              <button
                onClick={() => setTemplateOpen(true)}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                ⚙ 枠を編集
              </button>
            </div>

            {(plan?.windows?.length ?? 0) === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-600">
                  1日の枠がまだ決まっていません
                </p>
                <button
                  onClick={() => setTemplateOpen(true)}
                  className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  仕事／自分の時間を決める
                </button>
              </div>
            ) : (
              <DayTimeline
                windows={plan?.windows ?? []}
                blocks={plan?.blocks ?? []}
                nowHHMM={nowJst()}
                doneTaskIds={new Set((plan?.tasks ?? []).filter((t) => t.done).map((t) => t.id))}
                onDropTask={pinTask}
                onUnpin={unpinTask}
                isDragging={dragTaskId !== null}
              />
            )}

            {overflow.length > 0 && (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="text-xs font-semibold text-rose-300">
                  稼働時間に入りきりません（{overflow.length}件）
                </p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-rose-200/80">
                  {overflow.map((t) => (
                    <li key={t.id}>・{t.title}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Google Calendar */}
            <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
              <button
                onClick={() => post("/api/planning/calendar", { date: plan?.date }, "sync")}
                disabled={busy !== "" || !hasBlocks}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold hover:bg-blue-500 disabled:opacity-40"
              >
                {busy === "sync" ? "同期中…" : "📅 Googleカレンダーへ同期"}
              </button>
              <a
                href={`/api/planning/calendar?date=${plan?.date ?? ""}`}
                className={`block rounded-xl border border-slate-700 py-2 text-center text-xs text-slate-400 hover:bg-slate-800 ${
                  hasBlocks ? "" : "pointer-events-none opacity-40"
                }`}
              >
                ICSファイルでダウンロード
              </a>
              {!calendarConfigured && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  ※ Google連携が未設定です。ICSダウンロードならすぐ使えます。
                </p>
              )}
              {plan?.syncedAt && (
                <p className="text-[11px] text-emerald-400">
                  同期済み: {new Date(plan.syncedAt).toLocaleString("ja-JP")}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {templateOpen && (
        <TemplateEditor
          onClose={() => setTemplateOpen(false)}
          onSaved={() => {
            // 枠を変えたら今日の時間割を組み直す
            post("/api/planning/schedule", { date: plan?.date }, "schedule");
          }}
        />
      )}

      {/* ─── AI Suggest（右下） ─────────────────── */}
      {suggestions.length > 0 && (
        <div className="fixed bottom-4 right-4 z-20 w-[min(22rem,calc(100vw-2rem))]">
          {suggestOpen ? (
            <div className="rounded-2xl border border-lime-500/30 bg-slate-900/95 p-4 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-lime-400">💡 AI Suggest</p>
                <button
                  onClick={() => setSuggestOpen(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                >
                  閉じる
                </button>
              </div>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-xs leading-relaxed text-slate-300">
                    ・{s}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              onClick={() => setSuggestOpen(true)}
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-full border border-lime-500/40 bg-slate-900/95 text-lg shadow-xl"
            >
              💡
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── パーツ ────────────────────────────────────────

function Kpi({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

function TaskRow({
  task,
  color,
  onDragStart,
  onDragEnd,
  onToggle,
  onPriority,
  onCategory,
  onMinutes,
  onRemove,
}: {
  task: PlanTask;
  color: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onPriority: (p: Priority) => void;
  onCategory: () => void;
  onMinutes: (m: number) => void;
  onRemove: () => void;
}) {
  const cat = categoryOf(task.category);
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group cursor-grab rounded-xl border border-slate-800 bg-slate-950/50 p-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={onToggle}
          aria-label={task.done ? "未完了に戻す" : "完了にする"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition-colors ${
            task.done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-600 hover:border-slate-400"
          }`}
        >
          {task.done ? "✓" : ""}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium leading-snug ${
              task.done ? "text-slate-600 line-through" : "text-slate-100"
            }`}
          >
            {task.title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* カテゴリ（クリックで 仕事→生活→未分類 と切替） */}
            <button
              onClick={onCategory}
              title="クリックで 仕事 / 生活 / 未分類 を切り替え"
              className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors"
              style={
                cat
                  ? { color: cat.color, backgroundColor: `${cat.color}1a`, borderColor: `${cat.color}44` }
                  : { color: "#64748b", backgroundColor: "transparent", borderColor: "#334155" }
              }
            >
              {cat ? `${cat.icon} ${cat.label}` : "❓ 未分類"}
            </button>

            {/* 優先度（クリックで変更） */}
            <div className="flex" role="group" aria-label="優先順位">
              {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onPriority(p)}
                  aria-label={`優先度${p}`}
                  className={`text-xs leading-none transition-colors ${
                    p <= task.priority ? "text-amber-400" : "text-slate-700 hover:text-slate-500"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* 所要時間 */}
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={task.minutes}
                onChange={(e) => onMinutes(Math.max(5, Number(e.target.value) || 5))}
                className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-right text-slate-300 outline-none focus:border-slate-500"
              />
              分
            </label>

            {task.note && (
              <span className="text-[10px]" style={{ color }}>
                {task.note}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onRemove}
          aria-label="削除"
          className="shrink-0 text-xs text-slate-700 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
