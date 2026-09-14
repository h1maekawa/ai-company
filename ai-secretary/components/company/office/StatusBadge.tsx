import type { SimpleUiStatus } from "@/app/lib/company/execution/uiProjection";
import { STATUS_DOT, STATUS_STYLE } from "./types";

/** 状態バッジ。色とドットの対応はtypes.tsの1か所だけで決める。 */
export function StatusBadge({ status }: { status: SimpleUiStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}
