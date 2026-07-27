"use client";

import {
  TimeBlock,
  TimeWindow,
  formatDuration,
  toMinutes,
  windowCapacity,
} from "@/app/lib/planning/types";

/**
 * 1日の時間枠を縦の帯で描き、その中にタスクブロックを重ねて表示する。
 * 高さを実時間に比例させることで「24時間しかない」ことが目で分かるようにする。
 */
export function DayTimeline({
  windows,
  blocks,
  nowHHMM,
  doneTaskIds,
}: {
  windows: TimeWindow[];
  blocks: TimeBlock[];
  nowHHMM: string;
  doneTaskIds: Set<string>;
}) {
  if (windows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-600">
        時間枠が未設定です。
        <br />
        「枠を編集」から1日の仕事／自分の時間を決めてください。
      </p>
    );
  }

  // 表示範囲は枠とブロックが全て収まる幅にする
  const starts = [...windows.map((w) => toMinutes(w.start)), ...blocks.map((b) => toMinutes(b.start))];
  const ends = [...windows.map((w) => toMinutes(w.end)), ...blocks.map((b) => toMinutes(b.end))];
  const rangeStart = Math.max(0, Math.min(...starts) - 30);
  const rangeEnd = Math.min(24 * 60, Math.max(...ends) + 30);
  const rangeMinutes = Math.max(60, rangeEnd - rangeStart);

  const HEIGHT = 620;
  const pxPerMinute = HEIGHT / rangeMinutes;
  const y = (minutes: number) => (minutes - rangeStart) * pxPerMinute;

  const capacity = windowCapacity(windows);
  const used = { work: 0, life: 0 };
  for (const block of blocks) {
    const minutes = toMinutes(block.end) - toMinutes(block.start);
    if (block.category === "life") used.life += minutes;
    else used.work += minutes;
  }

  const now = toMinutes(nowHHMM);
  const showNow = now >= rangeStart && now <= rangeEnd;

  // 1時間ごとの目盛り
  const hourMarks: number[] = [];
  for (let m = Math.ceil(rangeStart / 60) * 60; m <= rangeEnd; m += 60) hourMarks.push(m);

  return (
    <div>
      {/* 枠の使用状況 */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <CapacityBar
          icon="💼"
          label="仕事の時間"
          used={used.work}
          total={capacity.work}
          color="#60a5fa"
        />
        <CapacityBar
          icon="🏠"
          label="自分の時間"
          used={used.life}
          total={capacity.life}
          color="#4ade80"
        />
      </div>

      <div className="relative" style={{ height: HEIGHT }}>
        {/* 時刻の目盛り */}
        {hourMarks.map((m) => (
          <div key={m} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: y(m) }}>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-600">
              {String(Math.floor(m / 60)).padStart(2, "0")}:00
            </span>
            <span className="h-px flex-1 bg-slate-800/70" />
          </div>
        ))}

        {/* 時間枠の帯 */}
        <div className="absolute bottom-0 left-11 top-0 right-0">
          {windows.map((window) => {
            const top = y(toMinutes(window.start));
            const height = (toMinutes(window.end) - toMinutes(window.start)) * pxPerMinute;
            const isWork = window.category === "work";
            const color = isWork ? "#60a5fa" : "#4ade80";
            return (
              <div
                key={window.id}
                className="absolute left-0 right-0 rounded-lg border"
                style={{
                  top,
                  height,
                  backgroundColor: `${color}0f`,
                  borderColor: `${color}33`,
                }}
              >
                <span
                  className="absolute right-1.5 top-1 text-[9px] font-medium"
                  style={{ color: `${color}bb` }}
                >
                  {isWork ? "💼" : "🏠"} {window.label}
                </span>
              </div>
            );
          })}

          {/* タスクブロック */}
          {blocks.map((block) => {
            const top = y(toMinutes(block.start));
            const height = Math.max(
              18,
              (toMinutes(block.end) - toMinutes(block.start)) * pxPerMinute
            );
            const isWork = block.category !== "life";
            const color = isWork ? "#3b82f6" : "#22c55e";
            const done = doneTaskIds.has(block.taskId);
            const isNow = now >= toMinutes(block.start) && now < toMinutes(block.end);
            return (
              <div
                key={`${block.taskId}-${block.start}`}
                className={`absolute left-2 right-6 overflow-hidden rounded-md border px-2 py-0.5 ${
                  isNow ? "ring-1 ring-amber-400/70" : ""
                }`}
                style={{
                  top,
                  height,
                  backgroundColor: done ? "#1e293b" : `${color}33`,
                  borderColor: done ? "#334155" : `${color}88`,
                }}
                title={`${block.start}〜${block.end} ${block.title}`}
              >
                <p
                  className={`truncate text-[11px] font-medium leading-tight ${
                    done ? "text-slate-600 line-through" : "text-slate-100"
                  }`}
                >
                  {block.title}
                </p>
                {height > 30 && (
                  <p className="truncate text-[9px] text-slate-400">
                    {block.start}〜{block.end}
                  </p>
                )}
              </div>
            );
          })}

          {/* 現在時刻ライン */}
          {showNow && (
            <div className="absolute left-0 right-0 z-10" style={{ top: y(now) }}>
              <div className="flex items-center">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="h-px flex-1 bg-amber-400/70" />
                <span className="ml-1 rounded bg-amber-400 px-1 text-[9px] font-bold text-slate-900">
                  {nowHHMM}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapacityBar({
  icon,
  label,
  used,
  total,
  color,
}: {
  icon: string;
  label: string;
  used: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const over = used > total;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5">
      <p className="text-[10px] text-slate-500">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-200">
        {formatDuration(used)}
        <span className="font-normal text-slate-600"> / {formatDuration(total)}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : color }}
        />
      </div>
    </div>
  );
}
