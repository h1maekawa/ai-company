import { Users } from "lucide-react";
import { PixelEmployee } from "./PixelEmployee";
import { StatusBadge } from "./StatusBadge";
import { poseOf, type AgentView, type DepartmentView } from "./types";

function AgentCard({ agent }: { agent: AgentView }) {
  return (
    <li className="flex gap-3 rounded-xl border border-hairline bg-white/[0.025] p-3">
      <PixelEmployee pose={poseOf(agent.status)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <p className="truncate text-sm font-medium text-white">{agent.name}</p>
          <StatusBadge status={agent.status} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-sub">{agent.role}</p>
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
          <span className="text-sub">Current Mission: </span>
          {agent.currentMissionTitle ?? "なし"}
        </p>
        {agent.currentStep && (
          <p className="mt-1 truncate text-[11px] text-slate-300">
            <span className="text-sub">現在: </span>
            {agent.currentStep.title}
            <span className="text-sub">
              {" "}
              ({agent.currentStep.index}/{agent.currentStep.total})
            </span>
          </p>
        )}
        {agent.waitReason && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-amber-300/90">
            {agent.waitReason}
          </p>
        )}
      </div>
    </li>
  );
}

export function DepartmentPanel({ departments }: { departments: DepartmentView[] }) {
  return (
    <section aria-labelledby="departments-heading" className="rounded-2xl border border-hairline bg-ink-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="departments-heading" className="text-sm font-semibold text-white">
          AI Company
        </h2>
        <span className="text-[10px] text-sub">事業部 → AI社員</span>
      </div>

      {departments.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-[11px] text-sub">
          稼働中の事業部はありません
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {departments.map((department) => (
            <article key={department.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-white">
                  <span aria-hidden="true">{department.icon}</span>
                  {department.name}
                </h3>
                <p className="inline-flex items-center gap-1 text-[10px] text-sub">
                  <Users aria-hidden="true" className="h-3 w-3" />
                  AI社員 {department.agents.length} · 稼働中 {department.working} · 待機 {department.idle} · Task{" "}
                  {department.taskCount}
                </p>
              </header>
              <ul className="mt-3 space-y-2">
                {department.agents.map((agent) => (
                  <AgentCard key={agent.agentId} agent={agent} />
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
