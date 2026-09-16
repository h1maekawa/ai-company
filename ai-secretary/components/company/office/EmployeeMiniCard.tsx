import { PixelEmployee } from "./PixelEmployee";
import { STATUS_DOT, poseOf, type AgentView } from "./types";

/**
 * 一覧用の小さなAI社員カード。
 *
 * 最初の画面に出すのは Name / Status / Current Mission の3つだけ。
 * Role・現在のStep・止まっている理由は開いたときに見せる。
 * 全員分を一度に見せることを、1人あたりの情報量より優先する（v3方針）。
 */
export function EmployeeMiniCard({ agent }: { agent: AgentView }) {
  const hasDetail = Boolean(agent.role || agent.currentStep || agent.waitReason);
  return (
    <details className="group rounded-lg border border-hairline bg-white/[0.025] open:bg-white/[0.05]">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-2 [&::-webkit-details-marker]:hidden">
        <PixelEmployee pose={poseOf(agent.status)} compact />
        <span className="min-w-0 flex-1">
          {/* モバイルは2列で名前が切れるうえ、hoverが無いのでtitleも読めない。
              名前だけは2行まで折り返す */}
          <span title={agent.name} className="block line-clamp-2 text-[11px] font-medium leading-snug text-white">
            {agent.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-sub">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
            <span className="truncate">{agent.status}</span>
          </span>
          {/* 「―」だけだと何の行か分からない。無いことは無いと書く。
              実際のMission名と取り違えないよう、色も落としておく */}
          {agent.currentMissionTitle ? (
            <span title={agent.currentMissionTitle} className="mt-0.5 block truncate text-[10px] text-slate-300">
              {agent.currentMissionTitle}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-[10px] text-sub">Mission なし</span>
          )}
        </span>
      </summary>
      {hasDetail && (
        <div className="space-y-1 border-t border-hairline px-2 py-1.5 text-[10px] leading-relaxed">
          <p className="text-sub">{agent.role}</p>
          {agent.currentStep && (
            <p className="text-slate-300">
              現在: {agent.currentStep.title}
              <span className="text-sub">
                {" "}
                ({agent.currentStep.index}/{agent.currentStep.total})
              </span>
            </p>
          )}
          {agent.waitReason && <p className="text-amber-300/90">{agent.waitReason}</p>}
        </div>
      )}
    </details>
  );
}
