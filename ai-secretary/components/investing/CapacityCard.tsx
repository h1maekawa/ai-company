"use client";

import { Wallet } from "lucide-react";
import type { Capacity } from "@/app/lib/investing/capacity";
import { formatJpy } from "@/app/lib/investing/types";
import { Card, CardHeader, EmptyState, Skeleton } from "./ui";

const CONFIDENCE_LABEL = { high: "確度 高", medium: "確度 中", low: "確度 低" } as const;

/**
 * 家計簿から取り込んだ「今月あといくら使えるか」「投資に回せるか」を示すカード。
 * 金額は家計簿側の計算結果をそのまま表示する（ここでは推定しない）。
 */
export function CapacityCard({
  capacity,
  configured,
  loading,
}: {
  capacity: Capacity | null;
  configured: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="今月の使えるお金" />
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  if (!capacity) {
    return (
      <Card>
        <CardHeader title="今月の使えるお金" />
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title={configured ? "家計簿から取得できませんでした" : "家計簿と未連携です"}
          description={
            configured
              ? "家計簿アプリへ接続できていません。連携シークレットとURLをご確認ください。"
              : "FLOWPLUS_BASE_URL と FLOWPLUS_API_SECRET を設定すると、口座残高と予算から自動で算出されます。"
          }
        />
      </Card>
    );
  }

  const living = capacity.living;
  const investable = capacity.investable_amount;
  const overspending = living ? living.pace > 1 : false;
  const usedPct =
    living && living.variable_budget > 0
      ? Math.min(100, (living.spent / living.variable_budget) * 100)
      : 0;

  return (
    <Card>
      <CardHeader
        title="今月の使えるお金"
        hint={`${capacity.target_month}・家計簿から自動取得`}
        action={
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-sub">
            {CONFIDENCE_LABEL[capacity.confidence]}
          </span>
        }
      />

      {/* 生活費の残り */}
      {living ? (
        <div className="mb-4">
          <p className="text-[11px] text-sub">生活費の残り（今月）</p>
          <p
            className={`mt-0.5 text-2xl font-semibold tabular-nums ${
              living.remaining < 0 ? "text-loss" : "text-white"
            }`}
          >
            {formatJpy(living.remaining)}
          </p>
          <p className="mt-0.5 text-[11px] text-sub">
            あと{living.days_left}日 ・ 1日あたり {formatJpy(living.daily_allowance)}
            {overspending && <span className="ml-1 text-loss">・ペース超過</span>}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${usedPct}%`,
                backgroundColor: overspending ? "#EF4444" : "#22C55E",
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-sub">
            予算 {formatJpy(living.variable_budget)} 中 {formatJpy(living.spent)} を使用
          </p>
        </div>
      ) : (
        <p className="mb-4 text-xs text-sub">生活費の内訳を取得できていません。</p>
      )}

      {/* 投資に回せる額 */}
      <div className="rounded-xl border border-hairline bg-white/[0.02] p-3">
        <p className="text-[11px] text-sub">投資に回せる額</p>
        <p
          className={`mt-0.5 text-xl font-semibold tabular-nums ${
            investable === null ? "text-sub" : investable > 0 ? "text-gain" : "text-loss"
          }`}
        >
          {investable === null ? "算出できません" : formatJpy(investable)}
        </p>
        {investable !== null && investable <= 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-loss">
            生活費と支払いを差し引くと余力がありません。今月の新規投資は見送りが妥当です。
          </p>
        )}

        {capacity.breakdown.length > 0 && (
          <ul className="mt-2.5 space-y-1 border-t border-hairline pt-2.5">
            {capacity.breakdown.map((row) => (
              <li key={row.label} className="flex justify-between text-[11px]">
                <span className="text-sub">
                  <span className={row.sign === "+" ? "text-gain" : "text-loss"}>{row.sign}</span>{" "}
                  {row.label}
                </span>
                <span className="tabular-nums text-slate-300">{formatJpy(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {capacity.missing_data.length > 0 && (
        <p className="mt-3 text-[10px] leading-relaxed text-sub">
          ※ {capacity.missing_data.join(" / ")}
        </p>
      )}
    </Card>
  );
}
