import { computeEmployeeUtilization } from "@/app/lib/mobile-ceo/controlCenter";

/**
 * AI社員の「現在稼働率」。勤務時間・CPU時間ではなく、現在のMission状態から算出した瞬間値。
 * CEO確認待ち（WAITING_APPROVAL）は稼働中に含めない。
 */
export function EmployeeUtilizationSummary({ statuses }: { statuses: string[] }) {
  const summary = computeEmployeeUtilization(statuses);
  const rate = summary.utilization === null ? "未取得" : `${Math.round(summary.utilization * 100)}%`;
  const rows: Array<[string, number]> = [["稼働中", summary.active], ["CEO確認待ち", summary.waitingApproval], ["問題あり", summary.error], ["待機中", summary.idle], ["完了", summary.complete], ["未取得", summary.unknown]];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs text-slate-400">現在稼働率</span>
        <span className="text-lg font-bold">{summary.active} / {summary.total}人 <span className="text-violet-300">{rate}</span></span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {rows.filter(([label, value]) => value > 0 || label !== "未取得").map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-[10px] text-slate-500">現在のMission状態から算出（勤務時間・CPU時間ではありません）</p>
    </div>
  );
}
