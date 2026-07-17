"use client";

import Link from "next/link";
import { CENTER_NODE, HUB_NODES } from "@/app/lib/config/hub";

// 放射状レイアウト: ノード i を中心から角度 (i/n)*360° の位置に置く。
// 座標は %ベースで SVG(viewBox 0-100) と CSS の position を共有する。
const RADIUS = 38;
function nodePosition(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // 12時方向スタート
  return {
    x: 50 + RADIUS * Math.cos(angle),
    y: 50 + RADIUS * Math.sin(angle),
  };
}

export default function HubPage() {
  const positions = HUB_NODES.map((_, i) => nodePosition(i, HUB_NODES.length));

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <header className="px-6 pt-6 pb-2 text-center">
        <h1 className="text-white font-bold text-xl">🧠 AI Company</h1>
        <p className="text-slate-500 text-xs mt-1">
          事業部をタップして話しかける
        </p>
      </header>

      {/* ─── Desktop / tablet: radial mind map ─── */}
      <main className="hidden sm:flex flex-1 items-center justify-center p-6">
        <div
          className="relative"
          style={{ width: "min(82vmin, 46rem)", height: "min(82vmin, 46rem)" }}
        >
          {/* connector lines */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            {positions.map((pos, i) => (
              <line
                key={HUB_NODES[i].id}
                x1="50"
                y1="50"
                x2={pos.x}
                y2={pos.y}
                stroke={HUB_NODES[i].color}
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
          {HUB_NODES.map((node, i) => (
            <Link
              key={node.id}
              href={`/chat?node=${node.id}`}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group"
              style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
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

      {/* ─── Mobile: vertical brainstorm tree ─── */}
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

        {/* branches */}
        <div className="ml-6 border-l-2 border-slate-800 pl-0 mt-1">
          {HUB_NODES.map((node) => (
            <div key={node.id} className="relative pt-3">
              {/* horizontal connector */}
              <span
                className="absolute left-0 top-[2.35rem] w-4 h-0.5"
                style={{ backgroundColor: node.color + "66" }}
              />
              <Link
                href={`/chat?node=${node.id}`}
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
      </main>
    </div>
  );
}
