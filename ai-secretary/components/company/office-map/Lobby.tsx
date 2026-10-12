import Link from "next/link";
import type { HomeSummary } from "./roomModel";

function updatedAtLabel(generatedAt?: string) {
  if (!generatedAt) return "最終更新 UNKNOWN";
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return "最終更新 UNKNOWN";
  return `最終更新 ${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
}

const FLOOR_TILE = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 18px)",
};

/**
 * 中央Lobby — CEO / Home。
 *
 * フロア全体の要約（確認件数・最終更新・昨日の事実）をここに集約する。
 * 新しい集計はしない。/api/company/home-summary の値をそのまま置くだけ。
 */
export function Lobby({
  summary,
  summaryUnavailable,
  orderClassName,
}: {
  summary?: HomeSummary;
  summaryUnavailable: boolean;
  orderClassName?: string;
}) {
  const attentionCount = summary?.attention.length;
  const facts = summary?.yesterday.facts ?? [];

  return (
    <div className={`min-h-40 ${orderClassName ?? ""}`}>
      <Link
        href="/"
        aria-label="ホームへ戻る"
        style={FLOOR_TILE}
        className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border-2 border-amber-300/40 bg-amber-400/[0.08] p-4"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-4 -right-4 text-6xl opacity-[0.1]">
          🛋️
        </span>
        <header className="relative">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
            <span aria-hidden="true">🏛️</span> Lobby · CEO / Home
          </p>
          <p className="mt-1 text-[11px] text-sub">{updatedAtLabel(summary?.generatedAt)}</p>
        </header>

        <div className="relative mt-3 space-y-1.5">
          <p className="text-xs text-white">
            {summaryUnavailable
              ? "UNKNOWN · 集計を取得できません"
              : attentionCount === undefined
                ? "取得中…"
                : attentionCount > 0
                  ? `確認が必要 ${attentionCount}件`
                  : "確認が必要な項目はありません"}
          </p>
          {facts.length > 0 && (
            <ul className="space-y-0.5 text-[10px] text-sub">
              {facts.slice(0, 3).map((fact) => (
                <li key={fact}>・{fact}</li>
              ))}
            </ul>
          )}
          {summary?.unavailable && summary.unavailable.length > 0 && (
            <p className="text-[10px] text-amber-300/80">UNKNOWN: {summary.unavailable.join("・")}</p>
          )}
        </div>
      </Link>
    </div>
  );
}
