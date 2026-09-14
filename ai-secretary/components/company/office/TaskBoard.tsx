import { ChevronRight } from "lucide-react";
import { TASK_BOARD_COLUMNS } from "@/app/lib/company/execution/uiProjection";
import { StatusBadge } from "./StatusBadge";
import type { TaskView } from "./types";

/** 完了は積み上がるので、トップ画面では直近だけ見せる。 */
const DONE_VISIBLE = 5;

function TaskCard({ task }: { task: TaskView }) {
  return (
    <details className="group rounded-lg border border-hairline bg-white/[0.025] open:bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sub transition-transform group-open:rotate-90"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-medium leading-relaxed text-white">{task.title}</p>
          <p className="mt-1.5 truncate text-[10px] text-sub">
            {task.departmentIcon ? `${task.departmentIcon} ` : ""}
            {task.departmentName ?? "部門未定"}
            {" · "}
            {task.assigneeName ?? "未割当"}
          </p>
          <div className="mt-2">
            <StatusBadge status={task.status} />
          </div>
          {task.currentStep && (
            <p className="mt-1.5 truncate text-[10px] text-slate-300">
              現在: {task.currentStep.title}
              <span className="text-sub">
                {" "}
                ({task.currentStep.index}/{task.currentStep.total})
              </span>
            </p>
          )}
          {task.waitReason && (
            <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-amber-300/90">
              {task.waitReason}
            </p>
          )}
        </div>
      </summary>
      <div className="border-t border-hairline px-3 py-2.5">
        <p className="line-clamp-4 text-[11px] leading-relaxed text-slate-300">
          {task.description || "説明はありません"}
        </p>
      </div>
    </details>
  );
}

export function TaskBoard({ tasks }: { tasks: TaskView[] }) {
  return (
    <section aria-labelledby="task-board-heading" className="rounded-2xl border border-hairline bg-ink-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="task-board-heading" className="text-sm font-semibold text-white">
          Task Board
        </h2>
        <span className="text-[10px] text-sub">Missionをそのまま表示</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_BOARD_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.column === column.id);
          const visible = column.id === "done" ? columnTasks.slice(0, DONE_VISIBLE) : columnTasks;
          const hidden = columnTasks.length - visible.length;
          return (
            <div key={column.id}>
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-sub">{column.label}</h3>
                <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-sub">
                  {columnTasks.length}
                </span>
              </div>
              {visible.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {visible.map((task) => (
                    <li key={task.missionId}>
                      <TaskCard task={task} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-hairline px-3 py-2.5 text-[10px] text-sub">
                  なし
                </p>
              )}
              {hidden > 0 && <p className="mt-1.5 text-[10px] text-sub">ほか {hidden} 件</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
