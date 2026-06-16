import React from "react";
import { DecisionNode } from "@/app/lib/context/bus";
import { findSecretary } from "@/app/lib/config/registry";

interface FlowMapProps {
  decisionHistory: DecisionNode[];
  activeSecretaryId: string;
}

export default function FlowMap({ decisionHistory, activeSecretaryId }: FlowMapProps) {
  // Build transition nodes dynamically
  const flowNodes: string[] = ["CEO"];

  decisionHistory.forEach(h => {
    const toName = findSecretary(h.to)?.config.name.replace(/\s*\(.*\)/, "") || h.to;
    if (flowNodes[flowNodes.length - 1] !== toName) {
      flowNodes.push(toName);
    }
  });

  const currentSecName =
    findSecretary(activeSecretaryId)?.config.name.replace(/\s*\(.*\)/, "") || activeSecretaryId;
  if (flowNodes[flowNodes.length - 1] !== currentSecName) {
    flowNodes.push(currentSecName);
  }

  // Keep last 5 nodes to fit nicely on the screen
  const displayNodes = flowNodes.slice(-5);

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-center gap-2 w-full overflow-x-auto select-none shadow-md">
      <span className="text-slate-500 text-xxs font-semibold tracking-wider mr-2">
        🧠 FLOW:
      </span>
      <div className="flex items-center gap-1.5 flex-nowrap">
        {displayNodes.map((node, idx) => {
          const isLast = idx === displayNodes.length - 1;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-slate-700 text-xs font-bold">→</span>}
              <div
                className={`px-3 py-1.5 rounded-lg text-xxs font-semibold transition-all ${
                  isLast
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-1 ring-blue-400"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {node}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
