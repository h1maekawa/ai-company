import { DepartmentBlock } from "./DepartmentBlock";
import type { DepartmentView } from "./types";

export function DepartmentPanel({ departments }: { departments: DepartmentView[] }) {
  return (
    <section aria-labelledby="departments-heading" className="rounded-2xl border border-hairline bg-ink-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="departments-heading" className="text-sm font-semibold text-white">
          AI Company
        </h2>
        <span className="text-[10px] text-sub">クリックで担当・現在地・理由</span>
      </div>

      {departments.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-[11px] text-sub">
          稼働中の事業はありません
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {departments.map((department) => (
            <DepartmentBlock key={department.id} department={department} />
          ))}
        </div>
      )}
    </section>
  );
}
