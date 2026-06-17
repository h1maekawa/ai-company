import React from "react";
import { ContextBus, getActiveBus } from "@/app/lib/context/bus";

interface ExecutivePanelProps {
  contextBus: ContextBus;
  recommendedNext?: string;
}

export default function ExecutivePanel({ contextBus, recommendedNext }: ExecutivePanelProps) {
  const activeBus = getActiveBus(contextBus);
  
  return (
    <div className="bg-[#151720] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between w-full shadow-lg shadow-black/30">
      {/* Metric 1: Goal */}
      <div className="flex-1 border-r border-slate-800/80 pr-4 last:border-r-0">
        <span className="text-slate-500 text-xxs tracking-wider uppercase font-semibold">
          🏆 Current Goal
        </span>
        <p className="text-white font-bold text-sm mt-1 truncate">
          {activeBus.currentGoal || "未設定（一般的な対話）"}
        </p>
      </div>

      {/* Metric 2: Intent */}
      <div className="flex-1 border-r border-slate-800/80 pr-4 last:border-r-0">
        <span className="text-slate-500 text-xxs tracking-wider uppercase font-semibold">
          🎯 Current Priority
        </span>
        <p className="text-blue-400 font-bold text-sm mt-1 truncate">
          {activeBus.currentIntent || "一般指示分類中"}
        </p>
      </div>

      {/* Metric 3: Proposed next step */}
      <div className="flex-1 border-r border-slate-800/80 pr-4 last:border-r-0">
        <span className="text-slate-500 text-xxs tracking-wider uppercase font-semibold">
          🧭 Suggested Step
        </span>
        <p className="text-amber-400 font-bold text-sm mt-1 truncate">
          {recommendedNext
            ? `遷移推奨: ${recommendedNext}`
            : activeBus.activeSecretary === "executive-coo"
            ? "進行整理完了"
            : "作業中..."}
        </p>
      </div>

      {/* Metric 4: Pipeline state */}
      <div className="flex-1 pr-4 last:border-r-0">
        <span className="text-slate-500 text-xxs tracking-wider uppercase font-semibold">
          📈 Pipeline Tasks
        </span>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-white font-bold text-sm">
            {activeBus.taskPipeline.filter(t => t.status === "done").length} /{" "}
            {activeBus.taskPipeline.length}
          </span>
          <span className="text-slate-500 text-xxs">完了</span>
        </div>
      </div>
    </div>
  );
}

