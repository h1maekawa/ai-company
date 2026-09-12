"use client";

/**
 * エージェントのタスク一覧 — 要件1「チャット履歴はタスクログとして残す」
 *
 * チャットでの指示がどの担当のどのタスクになったかを見せる。
 * 承認の対象は生成物なので、ここには承認操作を置かない（承認は /content/review）。
 */

import { useCallback, useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { AGENT_ROLE_LABELS, type AgentTask } from "@/app/lib/agents/types";
import { REVIEW_PHASE_LABELS } from "@/app/lib/review/types";
import { relativeAge } from "@/app/lib/freshness";
import { Skeleton } from "@/components/ui/primitives";

const STATUS_STYLE: Record<string, string> = {
  queued: "border-hairline bg-white/5 text-sub",
  running: "border-brand/30 bg-brand/10 text-brand",
  done: "border-gain/25 bg-gain/10 text-gain",
  failed: "border-loss/25 bg-loss/10 text-loss",
  cancelled: "border-hairline bg-white/5 text-sub",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "待機中",
  running: "実行中",
  done: "完了",
  failed: "失敗",
  cancelled: "取消",
};

export function AgentTaskList({ limit = 8 }: { limit?: number }) {
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/agents/tasks")
      .then((r) => r.json())
      .then((json: { tasks?: AgentTask[] }) => setTasks(json.tasks ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!tasks) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <ListTodo className="h-4 w-4 text-sub" />
          エージェントのタスク
        </p>
        <p className="text-xs text-sub">{tasks.length}件</p>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-sub">
          チャットで「note記事を書いて」「A8案件を調べて」のように指示すると、
          担当ごとのタスクとしてここに記録されます。
          自動パイプラインの各ステップも同じ一覧に「自動」として残ります。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tasks.slice(0, limit).map((task) => (
            <li key={task.id} className="flex items-start gap-2.5 text-xs">
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                  STATUS_STYLE[task.status] ?? STATUS_STYLE.queued
                }`}
              >
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-white">{task.instruction}</span>
                <span className="mt-0.5 block text-[10px] text-sub">
                  {/* 由来を出す。チャット指示と自動実行では読み方が変わる（要件1 / 要件3） */}
                  {task.origin === "automation" ? "自動" : "指示"}・
                  {AGENT_ROLE_LABELS[task.role]}・{REVIEW_PHASE_LABELS[task.phase]}
                  {task.createdAt ? ` ・ ${relativeAge(task.createdAt)}` : ""}
                </span>
                {task.result && (
                  <span className="mt-0.5 block truncate text-[10px] text-sub">
                    {task.result}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
