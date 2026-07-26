"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CENTER_NODE, GROUP_LABELS, HUB_NODES, HubNode, hubNodeHref } from "@/app/lib/config/hub";
import type { DailyPlan, PlanSummary } from "@/app/lib/planning/types";
import { formatDuration } from "@/app/lib/planning/types";

/**
 * 放射レイアウト: 中央=秘書（唯一の窓口）、周囲=個人事業部の各部署＋共通（改善）。
 * 角度は「東=0°・時計回り（画面座標系: yは下向きが正）」で指定する。
 * 座標は %ベースで SVG(viewBox 0-100) と CSS position を共有する。
 */
const RADIUS = 38;

function positionAt(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + RADIUS * Math.cos(rad),
    y: 50 + RADIUS * Math.sin(rad),
  };
}

/**
 * 個人事業部は上側の弧（150°→390°）へ均等配置、共通（改善）は真下。
 * 部署が増減しても崩れないよう、角度は件数から計算する。
 */
function layoutNodes(): { node: HubNode; x: number; y: number }[] {
  const personal = HUB_NODES.filter((n) => n.group === "personal");
  const others = HUB_NODES.filter((n) => n.group !== "personal");

  const placed = personal.map((node, index) => {
    const angle =
      personal.length === 1 ? 270 : 150 + (240 * index) / (personal.length - 1);
    return { node, ...positionAt(angle) };
  });

  others.forEach((node, index) => {
    // 共通ノードは真下に、複数あれば左右へ散らす
    const angle = 90 + (index - (others.length - 1) / 2) * 40;
    placed.push({ node, ...positionAt(angle) });
  });

  return placed;
}

const GROUP_ORDER = ["personal", "company", "shared"] as const;

export default function HubPage() {
  const placed = layoutNodes();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [summary, setSummary] = useState<PlanSummary | null>(null);

  useEffect(() => {
    fetch("/api/planning")
      .then((r) => r.json())
      .then((data) => {
        if (data?.plan) {
          setPlan(data.plan);
          setSummary(data.summary);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <header className="px-6 pt-6 pb-2 text-center">
        <h1 className="text-white font-bold text-xl">🧠 AI Company</h1>
        <p className="text-slate-500 text-xs mt-1">事業部をタップして話しかける</p>
      </header>

      {/* ─── Today's Dashboard ─────────────────────── */}
      <section className="mx-auto w-full max-w-3xl px-6 pt-3">
        <Link
          href="/planning"
          className="block rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-amber-500/40 hover:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-widest text-amber-400">TODAY</p>
            <span className="text-[11px] text-slate-500">朝会をひらく →</span>
          </div>

          {summary && summary.total > 0 ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label="今日やること" value={`${summary.total}件`} accent="#e2e8f0" />
                <Kpi label="残タスク" value={`${summary.remaining}件`} accent="#fb923c" />
                <Kpi
                  label="今日の予定時間"
                  value={formatDuration(summary.plannedMinutes)}
                  accent="#34d399"
                />
                <Kpi label="完了率" value={`${summary.completionRate}%`} accent="#f472b6" />
              </div>

              {(summary.currentBlock || summary.nextBlock) && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold text-amber-300">
                    {summary.currentBlock ? "NOW — 今これをやる" : "NEXT — 次のブロック"}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-white">
                    {(summary.currentBlock ?? summary.nextBlock)!.title}
                  </p>
                  <p className="text-[11px] text-amber-200/70">
                    {(summary.currentBlock ?? summary.nextBlock)!.start}〜
                    {(summary.currentBlock ?? summary.nextBlock)!.end}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              {plan
                ? "今日やることがまだ未登録です。朝会で書き出しましょう。"
                : "読み込み中…"}
            </p>
          )}
        </Link>
      </section>

      {/* ─── Desktop / tablet: zoned mind map ─── */}
      <main className="hidden sm:flex flex-1 items-center justify-center p-6">
        <div
          className="relative"
          style={{ width: "min(72vmin, 42rem)", height: "min(72vmin, 42rem)" }}
        >
          {/* zone background（個人事業部で全域を1ゾーン化） */}
          <div
            className="absolute inset-0 rounded-3xl border"
            style={{
              backgroundColor: GROUP_LABELS.personal.color + "08",
              borderColor: GROUP_LABELS.personal.color + "26",
            }}
          >
            <span
              className="absolute top-3 left-4 text-xs font-semibold"
              style={{ color: GROUP_LABELS.personal.color }}
            >
              {GROUP_LABELS.personal.icon} {GROUP_LABELS.personal.name}
            </span>
          </div>

          {/* connector lines */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            {placed.map(({ node, x, y }) => (
              <line
                key={node.id}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke={node.color}
                strokeOpacity="0.35"
                strokeWidth="0.35"
                strokeDasharray="1.6 1"
              />
            ))}
          </svg>

          {/* center node */}
          <Link
            href={`/chat?node=${CENTER_NODE.id}`}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 group"
            style={{ left: "50%", top: "50%" }}
          >
            <div className="w-24 h-24 rounded-full bg-blue-600 group-hover:bg-blue-500 flex items-center justify-center text-4xl shadow-lg shadow-blue-900/50 ring-4 ring-blue-500/20 group-hover:ring-blue-400/40 transition-all group-hover:scale-105">
              {CENTER_NODE.icon}
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-sm">{CENTER_NODE.name}</p>
              <p className="text-slate-500 text-[10px]">{CENTER_NODE.tagline}</p>
            </div>
          </Link>

          {/* department nodes */}
          {placed.map(({ node, x, y }) => (
            <Link
              key={node.id}
              href={hubNodeHref(node)}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-all group-hover:scale-110 shadow-md"
                style={{
                  backgroundColor: node.color + "22",
                  border: `2px solid ${node.color}66`,
                }}
              >
                {node.icon}
              </div>
              <div className="text-center max-w-[8rem]">
                <p className="text-slate-200 font-medium text-xs group-hover:text-white transition-colors">
                  {node.name}
                </p>
                <p className="text-slate-600 text-[10px] leading-tight group-hover:text-slate-500 transition-colors">
                  {node.tagline}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* ─── Mobile: grouped vertical brainstorm tree ─── */}
      <main className="sm:hidden flex-1 px-6 py-4 overflow-y-auto">
        {/* center node */}
        <Link
          href={`/chat?node=${CENTER_NODE.id}`}
          className="flex items-center gap-3 bg-blue-600/10 border border-blue-500/40 rounded-2xl px-4 py-3 active:bg-blue-600/20 transition-colors"
        >
          <div className="w-12 h-12 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-2xl shadow-md shadow-blue-900/40">
            {CENTER_NODE.icon}
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm">{CENTER_NODE.name}</p>
            <p className="text-slate-500 text-xs truncate">{CENTER_NODE.tagline}</p>
          </div>
        </Link>

        {GROUP_ORDER.map((groupId) => {
          const nodes = HUB_NODES.filter((n) => n.group === groupId);
          if (nodes.length === 0) return null;
          const label = GROUP_LABELS[groupId];
          return (
            <section key={groupId} className="mt-4">
              <h2
                className="text-xs font-semibold flex items-center gap-1.5 mb-1"
                style={{ color: label.color }}
              >
                {label.icon} {label.name}
              </h2>
              <div className="ml-3 pl-0" style={{ borderLeft: `2px solid ${label.color}44` }}>
                {nodes.map((node) => (
                  <div key={node.id} className="relative pt-3">
                    {/* horizontal connector */}
                    <span
                      className="absolute left-0 top-[2.35rem] w-4 h-0.5"
                      style={{ backgroundColor: node.color + "66" }}
                    />
                    <Link
                      href={hubNodeHref(node)}
                      className="ml-4 flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl px-3.5 py-2.5 active:bg-slate-800 transition-colors"
                      style={{ borderLeftColor: node.color + "99", borderLeftWidth: 3 }}
                    >
                      <div
                        className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl"
                        style={{
                          backgroundColor: node.color + "22",
                          border: `1.5px solid ${node.color}66`,
                        }}
                      >
                        {node.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-200 font-medium text-sm">{node.name}</p>
                        <p className="text-slate-600 text-xs truncate">{node.tagline}</p>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
