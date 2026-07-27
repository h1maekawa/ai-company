"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const PRESETS = [
  "今の保有バランスをどう見る？",
  "NVIDIAの保有方針を整理して",
  "現金比率はどのくらいが妥当？",
  "次に検討すべき分散先は？",
];

/**
 * 画面右下に常駐する投資アシスタント。
 * 既存の /api/chat を投資秘書(personal-fund)に固定して呼ぶ。
 */
export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          mode: "finance",
          secretaryId: "personal-fund",
          history,
        }),
      });
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? data.error ?? "回答を取得できませんでした" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ 接続エラーが発生しました" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  return (
    <>
      {/* 起動ボタン（モバイルは下部ナビに重ならない位置） */}
      <button
        onClick={() => setOpen(true)}
        aria-label="AIアシスタントを開く"
        className={`fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lift transition-transform hover:scale-105 lg:bottom-6 lg:right-6 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-20 right-4 z-40 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-hairline bg-ink-card shadow-lift lg:bottom-6 lg:right-6"
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-brand">
                  <MessageSquare className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-semibold">投資アシスタント</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="閉じる">
                <X className="h-4 w-4 text-sub hover:text-white" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-sub">保有状況を踏まえて答えます。例えば:</p>
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => send(preset)}
                      className="block w-full rounded-xl border border-hairline px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:border-brand/40 hover:text-white"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        message.role === "user"
                          ? "rounded-br-sm bg-brand text-white"
                          : "rounded-bl-sm bg-white/[0.06] text-slate-200"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-white/[0.06] px-3 py-2 text-xs text-sub">
                    考え中<span className="animate-pulse">…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={submit} className="flex gap-2 border-t border-hairline p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="投資について質問する"
                className="flex-1 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="送信"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
