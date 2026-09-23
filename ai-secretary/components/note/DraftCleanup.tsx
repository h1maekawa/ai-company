"use client";

import { useState } from "react";
import type { DraftCleanupPlan } from "@/app/lib/note/maintenance/draftCleanup";

const LABELS: Array<[keyof DraftCleanupPlan["before"], string]> = [
  ["total", "合計"], ["draft", "draft"], ["approved", "approved"], ["queued", "queued"], ["scheduled", "scheduled"],
  ["published", "published"], ["failed", "failed"], ["discarded", "discarded"], ["withBufferPostId", "Buffer紐付けあり"],
];

/**
 * 旧X下書きの整理（1回限りのメンテナンス）。まずdry-runで件数とidを確認し、その内容を人間が承認したときだけ実行する。
 * Buffer予約・公開済み・Research・Performanceは変更しない。
 */
export function DraftCleanup() {
  const [plan, setPlan] = useState<DraftCleanupPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function dryRun() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/note/maintenance/draft-cleanup");
      const payload = await response.json();
      if (!response.ok) setMessage(String(payload.error ?? "dry-runに失敗しました"));
      else setPlan(payload);
    } finally { setBusy(false); }
  }

  async function execute() {
    if (!plan || !window.confirm(`未公開・未予約のX下書き ${plan.targets.length}件を削除します。\nBuffer予約・公開済み・Researchは変更しません。実行しますか？`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/note/maintenance/draft-cleanup", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ confirmedByHuman: true, planId: plan.planId }) });
      const payload = await response.json();
      setMessage(response.ok ? `${payload.removed.length}件を削除しました（残り ${payload.after.total}件）。` : String(payload.error ?? "実行に失敗しました"));
      setPlan(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-[11px] leading-relaxed text-sub">実行前に X Daily Automation を停止してください。queued / scheduled / published とBuffer紐付けのある下書きは削除しません。</p>
      <button type="button" disabled={busy} onClick={() => void dryRun()} className="min-h-11 rounded-xl border border-hairline px-4 text-xs">dry-run（件数を確認）</button>
      {plan ? (
        <div className="space-y-2 rounded-xl border border-hairline p-3">
          <dl className="grid grid-cols-3 gap-2 text-xs">{LABELS.map(([key, label]) => <div key={key}><dt className="text-sub">{label}</dt><dd className="font-semibold">{plan.before[key]} → {plan.after[key]}</dd></div>)}</dl>
          <p className="text-xs">削除対象 {plan.targets.length}件 / 外部紐付けのため保持 {plan.retainedLinked.length}件</p>
          <details><summary className="min-h-11 cursor-pointer py-2 text-xs text-sub">対象ID</summary><ul className="max-h-40 overflow-y-auto text-[11px] text-sub">{plan.targets.map((item) => <li key={item.id}>{item.id} ({item.status})</li>)}</ul></details>
          <button type="button" disabled={busy || plan.targets.length === 0} onClick={() => void execute()} className="min-h-11 w-full rounded-xl bg-rose-800 text-xs font-semibold text-white disabled:opacity-50">人間として確認し、{plan.targets.length}件を削除</button>
        </div>
      ) : null}
      {message ? <p role="status" className="text-xs text-amber-200">{message}</p> : null}
    </div>
  );
}
