"use client";

import { useEffect, useRef } from "react";
import {
  TimeBlock,
  TimeWindow,
  formatDuration,
  toHHMM,
  toMinutes,
  windowCapacity,
} from "@/app/lib/planning/types";

/** 1時間あたりの高さ(px)。24時間ぶんを同じ縮尺で描く */
const HOUR_HEIGHT = 44;
const DAY_MINUTES = 24 * 60;
/** ドロップ位置を丸める単位(分) */
const SNAP_MINUTES = 15;

/**
 * 0:00〜24:00の時間割。宣言した枠を色帯で示し、その中にタスクを重ねる。
 * 左のタスクをここへドラッグすると、その時刻に固定配置できる。
 */
export function DayTimeline({
  windows,
  blocks,
  nowHHMM,
  doneTaskIds,
  onDropTask,
  onUnpin,
  isDragging,
}: {
  windows: TimeWindow[];
  blocks: TimeBlock[];
  nowHHMM: string;
  doneTaskIds: Set<string>;
  /** タスクをタイムラインへ落としたとき（"HH:MM"） */
  onDropTask?: (taskId: string, startHHMM: string) => void;
  /** 固定を解除するとき */
  onUnpin?: (taskId: string) => void;
  /** ドラッグ中かどうか（ドロップ可能であることを示す） */
  isDragging?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const now = toMinutes(nowHHMM);
  const y = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;

  // 初回は現在時刻あたりが見えるようスクロールする
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = Math.max(0, (now / 60) * HOUR_HEIGHT - container.clientHeight / 3);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capacity = windowCapacity(windows);
  const used = { work: 0, life: 0 };
  for (const block of blocks) {
    const minutes = toMinutes(block.end) - toMinutes(block.start);
    if (block.category === "life") used.life += minutes;
    else used.work += minutes;
  }

  /** ドロップ位置のY座標から開始時刻を求める */
  function startFromEvent(event: React.DragEvent): string {
    const grid = gridRef.current;
    if (!grid) return "09:00";
    const rect = grid.getBoundingClientRect();
    const minutes = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
    return toHHMM(Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, snapped)));
  }

  return (
    <div>
      {/* 枠の使用状況 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <CapacityBar icon="💼" label="仕事の時間" used={used.work} total={capacity.work} color="#60a5fa" />
        <CapacityBar icon="🏠" label="自分の時間" used={used.life} total={capacity.life} color="#4ade80" />
      </div>

      <p
        className={`mb-2 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
          isDragging
            ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "text-slate-600"
        }`}
      >
        {isDragging
          ? "置きたい時刻にドロップすると、そこへ固定されます（15分単位）"
          : "左のタスクをここへドラッグすると、好きな時刻に固定できます"}
      </p>

      <div
        ref={scrollRef}
        className="relative overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40"
        style={{ height: 560 }}
      >
        <div
          ref={gridRef}
          className="relative"
          style={{ height: (DAY_MINUTES / 60) * HOUR_HEIGHT }}
          onDragOver={(e) => {
            if (onDropTask) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!onDropTask) return;
            e.preventDefault();
            const taskId = e.dataTransfer.getData("text/plain");
            if (taskId) onDropTask(taskId, startFromEvent(e));
          }}
        >
          {/* 1時間ごとの目盛り */}
          {Array.from({ length: 25 }, (_, hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start gap-2"
              style={{ top: y(hour * 60) }}
            >
              <span className="w-10 shrink-0 -translate-y-1.5 text-right text-[10px] tabular-nums text-slate-600">
                {String(hour).padStart(2, "0")}:00
              </span>
              <span className="h-px flex-1 bg-slate-800/70" />
            </div>
          ))}

          <div className="absolute bottom-0 left-12 right-2 top-0">
            {/* 時間枠の帯 */}
            {windows.map((window) => {
              const top = y(toMinutes(window.start));
              const height = y(toMinutes(window.end)) - top;
              const isWork = window.category === "work";
              const color = isWork ? "#60a5fa" : "#4ade80";
              return (
                <div
                  key={window.id}
                  className="absolute left-0 right-0 rounded-lg border"
                  style={{ top, height, backgroundColor: `${color}0f`, borderColor: `${color}33` }}
                >
                  <span
                    className="absolute right-1.5 top-0.5 text-[9px] font-medium"
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
              const height = Math.max(20, y(toMinutes(block.end)) - top);
              const isWork = block.category !== "life";
              const color = isWork ? "#3b82f6" : "#22c55e";
              const done = doneTaskIds.has(block.taskId);
              const isNow = now >= toMinutes(block.start) && now < toMinutes(block.end);
              return (
                <div
                  key={`${block.taskId}-${block.start}`}
                  className={`group absolute left-2 right-1 overflow-hidden rounded-md border px-2 py-0.5 ${
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
                  <div className="flex items-start gap-1">
                    <p
                      className={`min-w-0 flex-1 truncate text-[11px] font-medium leading-tight ${
                        done ? "text-slate-600 line-through" : "text-slate-100"
                      }`}
                    >
                      {block.pinned && <span className="mr-0.5">📌</span>}
                      {block.title}
                    </p>
                    {block.pinned && onUnpin && (
                      <button
                        onClick={() => onUnpin(block.taskId)}
                        title="固定を解除して自動配置に戻す"
                        className="shrink-0 text-[9px] text-slate-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                      >
                        解除
                      </button>
                    )}
                  </div>
                  {height > 32 && (
                    <p className="truncate text-[9px] text-slate-400">
                      {block.start}〜{block.end}
                    </p>
                  )}
                </div>
              );
            })}

            {/* 現在時刻ライン */}
            <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: y(now) }}>
              <div className="flex items-center">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="h-px flex-1 bg-amber-400/70" />
                <span className="ml-1 rounded bg-amber-400 px-1 text-[9px] font-bold text-slate-900">
                  {nowHHMM}
                </span>
              </div>
            </div>
          </div>
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
