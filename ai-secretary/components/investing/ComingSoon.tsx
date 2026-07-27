"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { InvestingShell } from "./Shell";
import { Card, EmptyState } from "./ui";

/**
 * まだ実装していない画面。存在しない数字を並べるより、
 * 「何が必要でいつ出せるか」を正直に示す。
 */
export function ComingSoon({
  title,
  description,
  icon,
  needs,
  backHref = "/investing",
  backLabel = "ダッシュボードへ",
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  needs?: string[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <InvestingShell title={title}>
      <Card>
        <EmptyState
          icon={icon}
          title={`${title}は準備中です`}
          description={description}
          action={
            <Link
              href={backHref}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/85"
            >
              {backLabel}
            </Link>
          }
        />
        {needs && needs.length > 0 && (
          <div className="mx-auto mt-2 max-w-md rounded-xl border border-hairline bg-white/[0.02] p-4">
            <p className="text-[11px] font-semibold text-sub">実装に必要なもの</p>
            <ul className="mt-1.5 space-y-1">
              {needs.map((need) => (
                <li key={need} className="text-[11px] text-sub">
                  ・{need}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </InvestingShell>
  );
}
