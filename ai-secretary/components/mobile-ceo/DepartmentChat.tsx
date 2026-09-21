"use client";

import { useState, type FormEvent } from "react";
import type { DepartmentId } from "@/app/lib/mobile-ceo/departments";

type ChatMessage = { role: "user" | "assistant"; content: string };
type DirectiveSuggestion = { department: DepartmentId; instruction: string };

export function DepartmentChat({ id, label, onDirective }: { id: DepartmentId; label: string; onDirective: (instruction: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<DirectiveSuggestion | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const history = messages;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput(""); setBusy(true); setSuggestion(null);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, departmentId: id, history }) });
      const payload = await response.json();
      setMessages((current) => [...current, { role: "assistant", content: String(payload.reply ?? payload.error ?? "回答を取得できませんでした") }]);
      if (response.ok && payload.directiveSuggestion?.department === id) setSuggestion(payload.directiveSuggestion);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "接続エラーが発生しました。" }]);
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="department-chat-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h2 id="department-chat-title" className="text-base font-bold">💬 {label}について聞く</h2>
      {messages.length > 0 ? <div aria-live="polite" className="mt-3 max-h-80 space-y-2 overflow-y-auto">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-6 bg-violet-600/20" : "mr-6 bg-slate-800"}`}><span className="sr-only">{message.role === "user" ? "CEO" : label}: </span>{message.content}</div>)}</div> : <p className="mt-2 text-sm text-slate-400">質問はMissionを作らず、最新の部門データから回答します。</p>}
      {suggestion ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><p>これは{label}への実行指示です。勝手に実行せず、Directiveとして確認します。</p><button type="button" onClick={() => { onDirective(suggestion.instruction); setSuggestion(null); }} className="mt-3 min-h-11 w-full rounded-xl bg-amber-700 px-4 font-semibold">Directiveとして確認</button></div> : null}
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={`今の${label}の状況を教えて`} aria-label={`${label}への質問`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3"/><button disabled={busy} className="min-h-11 rounded-xl bg-violet-600 px-5 font-semibold disabled:opacity-50">{busy ? "確認中…" : "聞く"}</button></form>
    </section>
  );
}
