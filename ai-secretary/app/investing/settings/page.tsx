"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InvestingShell } from "@/components/investing/Shell";
import { Card, CardHeader } from "@/components/investing/ui";

type Status = { source: string; updatedAt: string | null; positions: number; historyPoints: number };

const SOURCE_LABEL: Record<string, string> = {
  holdings_csv: "楽天証券CSV（holdings.md）",
  positions_md: "positions.md（手動更新）",
  none: "未取込",
};

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/investing/portfolio")
      .then((r) => r.json())
      .then((json) =>
        setStatus({
          source: json.source ?? "none",
          updatedAt: json.updatedAt ?? null,
          positions: json.positions?.length ?? 0,
          historyPoints: json.history?.length ?? 0,
        })
      )
      .catch(() => undefined);
  }, []);

  return (
    <InvestingShell title="設定">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="データ連携の状態" hint="この画面の数字がどこから来ているか" />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-sub">保有データ</dt>
              <dd className="text-right text-white">
                {status ? SOURCE_LABEL[status.source] : "…"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-sub">保有銘柄数</dt>
              <dd className="text-white">{status ? `${status.positions}件` : "…"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-sub">最終更新</dt>
              <dd className="text-white">{status?.updatedAt ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-sub">資産推移の記録点数</dt>
              <dd className="text-white">{status ? `${status.historyPoints}点` : "…"}</dd>
            </div>
          </dl>
          <Link
            href="/fund"
            className="mt-4 block rounded-xl bg-brand py-2.5 text-center text-xs font-semibold text-white hover:bg-brand/85"
          >
            投資部門でCSVを取り込む・方針を設定する
          </Link>
        </Card>

        <Card>
          <CardHeader title="表示方針" hint="数字の扱いについて" />
          <ul className="space-y-2.5 text-xs leading-relaxed text-slate-300">
            <li>・評価額や損益はVaultの保有記録のみを使い、推定値で補完しません。</li>
            <li>・取得できない項目は「—」または「未取得」と表示します。</li>
            <li>・ニュースは配信元の見出しのみを扱い、AIは要約と分類だけを担当します。</li>
            <li>・健全性スコアは保有構成から機械的に算出し、相場予測は含みません。</li>
            <li>・資産推移はこの画面を開いた日の評価額を1日1点ずつ記録して作ります。</li>
          </ul>
        </Card>
      </div>
    </InvestingShell>
  );
}
