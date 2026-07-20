"use client";

import Link from "next/link";
import { CENTER_NODE, GROUP_LABELS, HUB_NODES, HubNode } from "@/app/lib/config/hub";

/**
 * ゾーン分割レイアウト:
 *   左半分 = 👤 個人事業部 / 右半分 = 🏢 会社事業部 / 下中央 = 共通（改善など）
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

// グループごとの配置角度。左半円=個人(4枠)、右半円=会社(3枠)、下中央=共通(1枠)
const GROUP_ANGLES: Record<string, number[]> = {
  personal: [230, 195, 160, 125],
  company: [-50, 0, 50],
  shared: [90],
};

function layoutNodes(): { node: HubNode; x: number; y: number }[] {
  const used: Record<string, number> = { personal: 0, company: 0, shared: 0 };
  return HUB_NODES.map((node) => {
    const angles = GROUP_ANGLES[node.group] ?? GROUP_ANGLES.shared;
    const angle = angles[Math.min(used[node.group], angles.length - 1)];
    used[node.group] += 1;
    return { node, ...positionAt(angle) };
  });
}

const GROUP_ORDER = ["personal", "company", "shared"] as const;

export default function HubPage() {
  const placed = layoutNodes();

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <header className="px-6 pt-6 pb-2 text-center">
        <h1 className="text-white font-bold text-xl">🧠 AI Company</h1>
        <p className="text-slate-500 text-xs mt-1">
          事業部をタップして話しかける
        </p>
        <Link
          href="/piro"
          className="inline-flex mt-3 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
        >
          Piro Creator OSを開く →
        </Link>
      </header>

      {/* ─── Desktop / tablet: zoned mind map ─── */}
      <main className="hidden sm:flex flex-1 items-center justify-center p-6">
        <div
          className="relative"
          style={{ width: "min(82vmin, 46rem)", height: "min(82vmin, 46rem)" }}
        >
          {/* zone backgrounds */}
          <div
            className="absolute rounded-3xl border"
            style={{
              left: 0,
              top: "2%",
              width: "48%",
              height: "96%",
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
          <div
            className="absolute rounded-3xl border"
            style={{
              right: 0,
              top: "2%",
              width: "48%",
              height: "96%",
              backgroundColor: GROUP_LABELS.company.color + "08",
              borderColor: GROUP_LABELS.company.color + "26",
            }}
          >
            <span
              className="absolute top-3 right-4 text-xs font-semibold"
              style={{ color: GROUP_LABELS.company.color }}
            >
              {GROUP_LABELS.company.icon} {GROUP_LABELS.company.name}
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
              href={`/chat?node=${node.id}`}
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
              <div
                className="ml-3 pl-0"
                style={{ borderLeft: `2px solid ${label.color}44` }}
              >
                {nodes.map((node) => (
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
            </section>
          );
        })}
      </main>
    </div>
  );
}
