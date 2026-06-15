"use client";

import { useState, useRef, useEffect } from "react";
import {
  SECRETARY_LABELS,
  SECRETARY_DESCRIPTIONS,
  SecretaryMode,
} from "@/app/lib/prompts";

type Provider = "ollama" | "gemini" | "groq" | "auto";
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: "ollama" | "gemini" | "groq";
  mode?: SecretaryMode;
};

function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-blue-400 mt-5 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-300 mt-3 mb-1">$1</h3>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300">$1</li>')
    .replace(/^[-•] (.+)$/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, "<br/>");
}

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "🖥️ Ollama（ローカル）",
  gemini: "✨ Gemini（クラウド）",
  groq:   "⚡ Groq（超高速）",
  auto:   "🤖 Auto（自動判定）",
};

const PROVIDER_BADGE: Record<string, string> = {
  ollama: "bg-slate-700 text-slate-300",
  gemini: "bg-blue-900 text-blue-300",
  groq:   "bg-orange-900 text-orange-300",
};

const MODE_ICON: Record<SecretaryMode, string> = {
  personal: "👤",
  business: "💼",
  note: "📝",
};

const MODE_EXAMPLES: Record<SecretaryMode, string[]> = {
  personal: [
    "今日やるべきこと整理して",
    "今週の振り返りをしたい",
    "睡眠リズムを整えたい",
  ],
  business: [
    "今期のKPIを整理して",
    "新規事業の論点を洗い出して",
    "意思決定の壁打ちをしたい",
  ],
  note: [
    "今日の記事を企画して",
    "楽天証券に合う記事ネタを5つ出して",
    "新NISAでタイトル案を5つ出して",
    "今月の投稿計画を立てて",
  ],
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [mode, setMode] = useState<SecretaryMode>("note");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, provider, mode }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? "エラーが発生しました。";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, provider: data.provider, mode: data.mode },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ 接続エラー。サーバーを確認してください。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleModeChange(newMode: SecretaryMode) {
    if (newMode === mode) return;
    setMode(newMode);
    // 会話履歴は維持（必要なら setMessages([]) でリセット可能）
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
            AI
          </div>
          <div>
            <h1 className="text-white font-semibold text-base leading-none">AI秘書</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              {MODE_ICON[mode]} {SECRETARY_LABELS[mode]} · Ollama + Gemini + Groq
            </p>
          </div>
        </div>

        {/* Provider selector */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(["ollama", "groq", "gemini", "auto"] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                provider === p
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === "ollama" ? "🖥️ Ollama"
                : p === "gemini" ? "✨ Gemini"
                : p === "groq" ? "⚡ Groq"
                : "🤖 Auto"}
            </button>
          ))}
        </div>
      </header>

      {/* Secretary mode selector */}
      <div className="border-b border-slate-800 px-6 py-3 bg-slate-900/40">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-2 items-center">
          <span className="text-slate-500 text-xs mr-1">秘書モード:</span>
          {(["personal", "business", "note"] as SecretaryMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                mode === m
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
              }`}
              title={SECRETARY_DESCRIPTIONS[m]}
            >
              {MODE_ICON[m]} {SECRETARY_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Provider description */}
      <div className="border-b border-slate-800/50 px-6 py-2 bg-slate-900/30">
        <p className="text-slate-500 text-xs text-center">
          {SECRETARY_DESCRIPTIONS[mode]} ・{" "}
          {provider === "ollama" && "ローカルLLM（プライベート・オフライン動作）"}
          {provider === "gemini" && "Google Gemini 2.0 Flash（高性能・最新情報対応）"}
          {provider === "groq" && "Groq LPU（llama-3.3-70b）超高速クラウド推論"}
          {provider === "auto" && "キーワードで自動判定：「最新」「ニュース」→ Gemini、それ以外 → Groq"}
        </p>
      </div>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center mt-16 space-y-4">
            <p className="text-slate-300 text-lg">
              {MODE_ICON[mode]} {SECRETARY_LABELS[mode]}
            </p>
            <p className="text-slate-500 text-sm">{SECRETARY_DESCRIPTIONS[mode]}</p>
            <div className="flex flex-col gap-2 items-center mt-6">
              {MODE_EXAMPLES[mode].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-sm text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 rounded-lg px-4 py-2 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-6 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold mr-3 mt-1 shrink-0">
                AI
              </div>
            )}
            <div className="max-w-[85%]">
              {msg.role === "assistant" && (msg.provider || msg.mode) && (
                <div className="mb-1 flex gap-1.5 flex-wrap">
                  {msg.mode && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                      {MODE_ICON[msg.mode]} {SECRETARY_LABELS[msg.mode]}
                    </span>
                  )}
                  {msg.provider && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PROVIDER_BADGE[msg.provider]}`}>
                      {msg.provider === "ollama" ? "🖥️ Ollama"
                        : msg.provider === "groq" ? "⚡ Groq"
                        : "✨ Gemini"}
                    </span>
                  )}
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mb-6">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold mr-3 mt-1 shrink-0">
              AI
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="text-slate-400 text-sm">
                {MODE_ICON[mode]} {SECRETARY_LABELS[mode]} · {PROVIDER_LABELS[provider]}で考え中
              </span>
              <span className="text-slate-400 text-sm animate-pulse">...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="border-t border-slate-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${SECRETARY_LABELS[mode]} に話しかける... (Enter で送信 / Shift+Enter で改行)`}
            rows={1}
            className="flex-1 bg-slate-800 text-slate-200 placeholder-slate-500 rounded-xl px-4 py-3 text-sm resize-none outline-none border border-slate-700 focus:border-blue-500 min-h-[44px] max-h-40"
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 160) + "px";
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl px-5 py-3 text-sm font-medium shrink-0 h-[44px]"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
