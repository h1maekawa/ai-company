"use client";

import { useEffect, useState } from "react";
import {
  TaskCategory,
  TimeWindow,
  WEEKDAY_LABELS,
  formatDuration,
  windowCapacity,
} from "@/app/lib/planning/types";

type DayInfo = {
  weekday: number;
  label: string;
  windows: TimeWindow[];
  capacity: { work: number; life: number };
};

/** 曜日ごとの「仕事の時間 / 自分の時間」を編集するモーダル */
export function TemplateEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState<TimeWindow[][] | null>(null);
  const [weekday, setWeekday] = useState<number>(() =>
    new Date(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()) +
        "T00:00:00+09:00"
    ).getDay()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/planning/template")
      .then((r) => r.json())
      .then((data: { days?: DayInfo[] }) => {
        if (data.days) setDays(data.days.map((d) => d.windows));
      })
      .catch(() => setError("枠の読み込みに失敗しました"));
  }, []);

  function updateWindow(index: number, patch: Partial<TimeWindow>) {
    if (!days) return;
    const next = days.map((list, i) =>
      i === weekday ? list.map((w, j) => (j === index ? { ...w, ...patch } : w)) : list
    );
    setDays(next);
  }

  function addWindow() {
    if (!days) return;
    const list = days[weekday];
    const last = list[list.length - 1];
    const start = last ? last.end : "09:00";
    const startHour = Number(start.slice(0, 2));
    const end = `${String(Math.min(23, startHour + 2)).padStart(2, "0")}:00`;
    const created: TimeWindow = {
      id: `win${Date.now().toString(36)}`,
      label: "新しい枠",
      start,
      end,
      category: "work",
    };
    setDays(days.map((l, i) => (i === weekday ? [...l, created] : l)));
  }

  function removeWindow(index: number) {
    if (!days) return;
    setDays(days.map((l, i) => (i === weekday ? l.filter((_, j) => j !== index) : l)));
  }

  /** 平日(月〜金)へ今の曜日の設定をコピーする */
  function copyToWeekdays() {
    if (!days) return;
    const source = days[weekday];
    setDays(
      days.map((list, i) =>
        i >= 1 && i <= 5
          ? source.map((w, j) => ({ ...w, id: `d${i}-${j}-${w.id}` }))
          : list
      )
    );
  }

  async function save() {
    if (!days) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/planning/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存に失敗しました");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const current = days?.[weekday] ?? [];
  const capacity = windowCapacity(current);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-white">1日の時間枠</h2>
            <p className="text-[11px] text-slate-500">
              仕事の時間と自分の時間を決めると、その中にタスクが配置されます
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label="閉じる">
            ✕
          </button>
        </div>

        {/* 曜日タブ */}
        <div className="flex gap-1 border-b border-slate-800 px-3 py-2">
          {WEEKDAY_LABELS.map((label, index) => (
            <button
              key={label}
              onClick={() => setWeekday(index)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                weekday === index
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!days ? (
            <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-400">
                合計 💼{formatDuration(capacity.work)} ・ 🏠{formatDuration(capacity.life)}
              </p>

              <div className="space-y-2">
                {current.map((window, index) => (
                  <div
                    key={window.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={window.label}
                        onChange={(e) => updateWindow(index, { label: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => removeWindow(index)}
                        className="shrink-0 text-xs text-slate-600 hover:text-rose-400"
                        aria-label="この枠を削除"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={window.start}
                        onChange={(e) => updateWindow(index, { start: e.target.value })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs tabular-nums text-slate-200 outline-none focus:border-amber-500"
                      />
                      <span className="text-xs text-slate-600">〜</span>
                      <input
                        type="time"
                        value={window.end}
                        onChange={(e) => updateWindow(index, { end: e.target.value })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs tabular-nums text-slate-200 outline-none focus:border-amber-500"
                      />

                      <div className="ml-auto flex gap-1 rounded-lg bg-slate-800 p-0.5">
                        {(
                          [
                            { id: "work" as TaskCategory, label: "💼仕事" },
                            { id: "life" as TaskCategory, label: "🏠自分" },
                          ]
                        ).map((option) => (
                          <button
                            key={option.id}
                            onClick={() => updateWindow(index, { category: option.id })}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                              window.category === option.id
                                ? "bg-slate-700 text-white"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={addWindow}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  ＋ 枠を追加
                </button>
                <button
                  onClick={copyToWeekdays}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  平日（月〜金）に同じ設定をコピー
                </button>
              </div>

              {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-800 px-5 py-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving || !days}
            className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
