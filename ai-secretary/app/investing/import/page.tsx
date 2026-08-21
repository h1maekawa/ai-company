"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { InvestingShell } from "@/components/investing/Shell";

/**
 * /investing/import — 楽天証券 資産残高CSV取込。
 * （旧 /fund のCSV取込セクションを Canonical Route /investing 配下へ移設）
 * 取込先・API（POST /api/fund/import）・保存パス（memory/personal/fund/holdings.md）は不変。
 */
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  // 楽天証券CSVはShift_JIS。UTF-8として厳密デコードに失敗したらShift_JISで読む
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

export default function InvestingImportPage() {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const csvText = decodeCsvBuffer(buffer);
      const res = await fetch("/api/fund/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "取込に失敗しました");
      setMessage(`取込完了：${json.holdingsCount}件（${json.importedAt} JST）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取込に失敗しました");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <InvestingShell title="CSV取込">
      <section className="max-w-xl rounded-2xl border border-hairline bg-ink-card p-5">
        <h2 className="text-sm font-semibold text-white">楽天証券 資産残高CSV取込</h2>
        <p className="mt-1 text-xs leading-relaxed text-sub">
          口座管理 → 資産残高からダウンロードしたCSVを選択（Shift_JISのままで可）。
          取込結果は{" "}
          <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">
            memory/personal/fund/holdings.md
          </code>{" "}
          に保存されます。証券注文の自動実行は行いません。
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="mt-4 text-xs text-sub file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-brand/85"
        />

        {importing && <p className="mt-2 text-xs text-brand">取込中...</p>}
        {message && (
          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {message}
            <Link href="/investing/allocation" className="ml-2 underline hover:text-emerald-200">
              配分・集中度を見る →
            </Link>
          </div>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-loss/25 bg-loss/10 px-3 py-2 text-xs text-loss">
            {error}
          </p>
        )}
      </section>
    </InvestingShell>
  );
}
