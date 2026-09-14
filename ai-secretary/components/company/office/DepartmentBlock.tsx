import { EmployeeMiniCard } from "./EmployeeMiniCard";
import type { DepartmentView } from "./types";

/**
 * 事業ブロック。見出し + AI社員の横並び。
 *
 * 中に独自のスクロールは作らない。入りきらないときは折り返す。
 * 将来クリニックが増えたら、この上に ClinicBlock を挟めば済む形にしてある。
 */
export function DepartmentBlock({ department }: { department: DepartmentView }) {
  return (
    <article className="rounded-xl border border-hairline bg-white/[0.02] p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-white">
          <span aria-hidden="true">{department.icon}</span>
          {department.name}
        </h3>
        <p className="text-[10px] text-sub">
          AI社員 {department.agents.length} · 稼働中 {department.working} · 待機 {department.idle} · Task{" "}
          {department.taskCount}
        </p>
      </header>
      {department.agents.length === 0 ? (
        <p className="mt-2.5 rounded-lg border border-dashed border-hairline px-3 py-2 text-[10px] text-sub">
          このDepartmentにAI社員はいません
        </p>
      ) : (
        /* コンテナがmax-w-5xlなので、4列を超えると日本語名が潰れる */
        <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {department.agents.map((agent) => (
            <li key={agent.agentId}>
              <EmployeeMiniCard agent={agent} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
