import Link from "next/link";
import { AGENT_DEPARTMENT_HREF } from "@/app/lib/config/navigation";
import { PixelEmployee } from "./PixelEmployee";
import { STATUS_DOT, poseOf, type AgentView } from "./types";

function EmployeeSummary({ agent }: { agent: AgentView }) {
  return <><PixelEmployee pose={poseOf(agent.status)} compact/><span className="min-w-0 flex-1"><span title={agent.name} className="block line-clamp-2 text-[11px] font-medium leading-snug text-white">{agent.name}</span><span className="mt-0.5 flex items-center gap-1 text-[10px] text-sub"><span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`}/><span className="truncate">{agent.status}</span></span>{agent.currentMissionTitle ? <span title={agent.currentMissionTitle} className="mt-0.5 block truncate text-[10px] text-slate-300">{agent.currentMissionTitle}</span> : <span className="mt-0.5 block truncate text-[10px] text-sub">Mission なし</span>}</span></>;
}

export function EmployeeMiniCard({ agent }: { agent: AgentView }) {
  const href = AGENT_DEPARTMENT_HREF[agent.agentId];
  const hasDetail = Boolean(agent.role || agent.currentStep || agent.waitReason);
  return <div className="h-full rounded-lg border border-hairline bg-white/[0.025]">{href ? <Link href={href} className="flex min-h-14 items-center gap-2 rounded-t-lg p-2 hover:bg-white/[0.05]" aria-label={`${agent.name}の担当画面を開く`}><EmployeeSummary agent={agent}/></Link> : <div className="flex min-h-14 items-center gap-2 p-2"><EmployeeSummary agent={agent}/></div>}{hasDetail ? <details className="border-t border-hairline"><summary className="min-h-11 cursor-pointer list-none px-2 py-3 text-[10px] text-violet-300 [&::-webkit-details-marker]:hidden">詳細</summary><div className="space-y-1 px-2 pb-2 text-[10px] leading-relaxed"><p className="text-sub">{agent.role}</p>{agent.currentStep ? <p className="text-slate-300">現在: {agent.currentStep.title} <span className="text-sub">({agent.currentStep.index}/{agent.currentStep.total})</span></p> : null}{agent.waitReason ? <p className="text-amber-300/90">{agent.waitReason}</p> : null}</div></details> : null}</div>;
}
