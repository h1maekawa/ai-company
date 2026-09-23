"use client";

import { useState } from "react";
import { HUMAN_NOTE_MAX_LENGTH } from "@/app/lib/mobile-ceo/controlCenter";

export type HumanDecisionValue = "APPROVED" | "HOLD" | "REJECTED";
const LABEL: Record<HumanDecisionValue, string> = { APPROVED: "承認", HOLD: "保留", REJECTED: "却下" };
const TONE: Record<HumanDecisionValue, string> = { APPROVED: "bg-emerald-700", HOLD: "bg-slate-700", REJECTED: "bg-rose-800" };

/**
 * Human Decisionが必要なProposal専用の共通UI（Creator / Fund / Investment Learningで共用）。
 * 承認はProposalの状態を変えるだけで、コード・Registry・Policyを自動変更しない。
 * 補足はAI提案本文を上書きせず、別の判断記録として送る。
 */
export function HumanDecisionPanel({ options = ["APPROVED", "HOLD", "REJECTED"], withNote = true, onDecide }: { options?: HumanDecisionValue[]; withNote?: boolean; onDecide: (decision: HumanDecisionValue, note: string) => Promise<string | null> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: HumanDecisionValue) {
    if (busy) return;
    if (!window.confirm(`人間CEOとして「${LABEL[decision]}」しますか？\n（コード・Registry・Policyは自動変更されません）`)) return;
    setBusy(true);
    const error = await onDecide(decision, note.trim()).catch(() => "送信に失敗しました");
    setBusy(false);
    setMessage(error ?? `${LABEL[decision]}しました。実装・Policy変更は別工程です。`);
    if (!error) setNote("");
  }

  return (
    <div className="mt-3 space-y-2">
      {withNote ? (
        <label className="block text-xs text-slate-400">
          CEO補足（任意・AI提案とは別に保存）
          <textarea value={note} maxLength={HUMAN_NOTE_MAX_LENGTH} onChange={(event) => setNote(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100" placeholder="例: Xだけでなくnote側にも同じ基準を使ってほしい" />
          <span className="block text-right text-[10px] text-slate-600">{note.length} / {HUMAN_NOTE_MAX_LENGTH}</span>
        </label>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button key={option} type="button" disabled={busy} onClick={() => void decide(option)} className={`min-h-11 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${TONE[option]}`}>{LABEL[option]}</button>
        ))}
      </div>
      {message ? <p role="status" className="text-xs text-amber-200">{message}</p> : null}
    </div>
  );
}

/** same-origin + idempotency-key 付きで Human Decision を送る。失敗時はエラーメッセージを返す。 */
export async function postHumanDecision(url: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
  if (response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return String(payload.error ?? "判断を保存できませんでした");
}
