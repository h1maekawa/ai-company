"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  SECRETARY_LABELS,
  SECRETARY_DESCRIPTIONS,
  SecretaryMode,
} from "@/app/lib/prompts";

type Provider = "groq" | "ollama" | "gemini" | "auto";
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: Provider;
  mode?: SecretaryMode;
};

const renderer = new marked.Renderer();
renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
  const classes: Record<number, string> = {
    2: "text-lg font-bold text-blue-400 mt-5 mb-2",
    3: "text-base font-semibold text-slate-300 mt-3 mb-1",
  };
  const cls = classes[depth] ?? "font-semibold mt-2 mb-1";
  return `<h${depth} class="${cls}">${text}</h${depth}>`;
};
renderer.listitem = ({ text }: { text: string }) =>
  `<li class="ml-4 list-disc text-slate-300">${text}</li>`;
renderer.code = ({ text }: { text: string }) =>
  `<pre class="bg-slate-900 rounded p-2 text-xs overflow-x-auto my-2"><code>${text}</code></pre>`;

marked.setOptions({ renderer });

function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  if (typeof window === "undefined") return rawHtml;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "ul", "ol", "li", "h1", "h2", "h3", "h4",
      "blockquote", "code", "pre", "hr", "a", "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "class", "target", "rel"],
  });
}

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: "✨ Gemini（メイン）",
  groq: "⚡ Groq（予備）",
  ollama: "🖥️ Ollama（非推奨）",
  auto:   "🤖 Auto（自動判定）",
};

const PROVIDER_BADGE: Record<string, string> = {
  groq: "bg-emerald-900 text-emerald-300",
  ollama: "bg-slate-700 text-slate-300",
  gemini: "bg-blue-900 text-blue-300",
  auto: "bg-purple-900 text-purple-300",
};

function resolveDefaultProvider(): Provider {
  const value = process.env.NEXT_PUBLIC_DEFAULT_PROVIDER;
  if (value === "groq" || value === "ollama" || value === "gemini" || value === "auto") {
    return value;
  }
  return "gemini";
}

const MODE_ICON: Record<SecretaryMode, string> = {
  personal: "👤",
  company: "💼",
  finance: "📈",
  note: "📝",
};

const MODE_EXAMPLES: Record<SecretaryMode, string[]> = {
  personal: [
    "今日やるべきこと整理して",
    "今週の振り返りをしたい",
    "睡眠リズムを整えたい",
  ],
  company: [
    "今期のKPIを整理して",
    "新規事業の論点を洗い出して",
    "意思決定の壁打ちをしたい",
  ],
  finance: [
    "ポートフォリオの現状を分析して",
    "ARM株の決算チェックをして",
    "投資戦略の壁打ちをしたい",
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
  const [provider, setProvider] = useState<Provider>(resolveDefaultProvider);
  const [mode, setMode] = useState<SecretaryMode>("note");
  const bottomRef = useRef<HTMLDivElement>(null);

  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [roleText, setRoleText] = useState("");
  const [tasksText, setTasksText] = useState("");
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [saveStateRole, setSaveStateRole] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveStateTasks, setSaveStateTasks] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [pendingTasksUpdate, setPendingTasksUpdate] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("activeCompany");
        if (stored === "crestix") {
          localStorage.setItem("activeCompany", "company");
        }
      } catch (e) {
        console.error("Failed to migrate activeCompany in localStorage:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (mode === "company") {
      const fetchMemory = async () => {
        setLoadingMemory(true);
        try {
          const apiHeaders = {
            "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "",
          };
          const [roleRes, tasksRes] = await Promise.all([
            fetch("/api/memory/role.md", { headers: apiHeaders }).then((r) => r.json()),
            fetch("/api/memory/tasks.md", { headers: apiHeaders }).then((r) => r.json()),
          ]);
          if (roleRes.content !== undefined) setRoleText(roleRes.content);
          if (tasksRes.content !== undefined) setTasksText(tasksRes.content);
        } catch (err) {
          console.error("Failed to load memory:", err);
        } finally {
          setLoadingMemory(false);
        }
      };
      fetchMemory();
    }
  }, [mode]);


  async function handleSaveRole() {
    setSaveStateRole("saving");
    try {
      const res = await fetch("/api/memory/role.md", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "",
        },
        body: JSON.stringify({ content: roleText }),
      });
      if (res.ok) {
        setSaveStateRole("success");
        setTimeout(() => setSaveStateRole("idle"), 3000);
      } else {
        setSaveStateRole("error");
      }
    } catch {
      setSaveStateRole("error");
    }
  }

  async function handleSaveTasks(newContent?: string) {
    setSaveStateTasks("saving");
    const textToSave = newContent !== undefined ? newContent : tasksText;
    try {
      const res = await fetch("/api/memory/tasks.md", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "",
        },
        body: JSON.stringify({ content: textToSave }),
      });
      if (res.ok) {
        setSaveStateTasks("success");
        if (newContent !== undefined) {
          setTasksText(newContent);
        }
        setTimeout(() => setSaveStateTasks("idle"), 3000);
      } else {
        setSaveStateTasks("error");
      }
    } catch {
      setSaveStateTasks("error");
    }
  }

  async function handleSubmit() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "",
        },
        body: JSON.stringify({
          message: text,
          provider,
          mode,
          history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      let reply = data.reply ?? data.error ?? "エラーが発生しました。";

      // [TASKS_UPDATE]ブロックを抽出・除去
      const regex = /\[TASKS_UPDATE\]([\s\S]*?)\[\/TASKS_UPDATE\]/;
      const match = reply.match(regex);
      if (match) {
        const tasksUpdateContent = match[1].trim();
        setPendingTasksUpdate(tasksUpdateContent);
        reply = reply.replace(regex, "").trim();
      }

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
              {MODE_ICON[mode]} {SECRETARY_LABELS[mode]} · Gemini
            </p>
          </div>
        </div>

        {/* Provider selector */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(["gemini", "groq", "ollama", "auto"] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                provider === p
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === "groq" ? "⚡ Groq" : p === "ollama" ? "🖥️ Ollama" : p === "gemini" ? "✨ Gemini" : "🤖 Auto"}
            </button>
          ))}
        </div>
      </header>

      {/* Secretary mode selector */}
      <div className="border-b border-slate-800 px-6 py-3 bg-slate-900/40">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-2 items-center">
          <span className="text-slate-500 text-xs mr-1">秘書モード:</span>
          {(["personal", "company", "finance", "note"] as SecretaryMode[]).map((m) => (
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
          {provider === "gemini" && "Google Gemini（メインAI・ローカル/スマホ共通）"}
          {provider === "groq" && "Groq（予備AI・入力制限に注意）"}
          {provider === "ollama" && "Ollama（ローカル専用・Vercelでは非推奨）"}
          {provider === "auto" && "自動判定：Gemini優先、必要に応じてGroq/Ollama"}
        </p>
      </div>

      {/* Fund report link */}
      {mode === "finance" && (
        <div className="border-b border-slate-800/50 px-4 py-2 bg-slate-900/20 text-center">
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-900/50 hover:border-blue-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            📊 投資レポートを見る
          </Link>
        </div>
      )}

      {/* Role/Task Editing Panel */}
      {mode === "company" && (
        <div className="border-b border-slate-800 bg-slate-900/20 max-w-3xl w-full mx-auto px-4 pt-4 pb-2">
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg">
            {/* Panel Header */}
            <button
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800 hover:bg-slate-700/80 transition-colors text-left"
            >
              <span className="text-slate-200 font-semibold text-xs flex items-center gap-2">
                <span>📋</span> 現在の役割・タスク（編集可能）
              </span>
              <span className="text-slate-400 text-[11px] font-medium">
                {isPanelOpen ? "▲ 閉じる" : "▼ 開く"}
              </span>
            </button>


            {/* Panel Body */}
            {isPanelOpen && (
              <div className="p-4 bg-slate-900/40 border-t border-slate-800 space-y-4">
                {loadingMemory ? (
                  <div className="text-center py-4 text-xs text-slate-500 animate-pulse">
                    メモリをロード中...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Role Area */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-medium text-xs">現在の役割</label>
                        <div className="flex items-center gap-2">
                          {saveStateRole === "success" && (
                            <span className="text-[10px] text-emerald-400 font-medium">✓ 保存しました</span>
                          )}
                          {saveStateRole === "error" && (
                            <span className="text-[10px] text-rose-400 font-medium">⚠️ 保存に失敗しました</span>
                          )}
                          <button
                            onClick={handleSaveRole}
                            disabled={saveStateRole === "saving"}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                          >
                            {saveStateRole === "saving" ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={roleText}
                        onChange={(e) => setRoleText(e.target.value)}
                        placeholder="現在の役割を記入..."
                        rows={6}
                        className="w-full bg-slate-800/80 text-slate-300 placeholder-slate-600 rounded-lg p-2 text-xs resize-none outline-none border border-slate-700 focus:border-blue-500 font-mono leading-relaxed"
                      />
                    </div>

                    {/* Tasks Area */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-medium text-xs">やるべきこと</label>
                        <div className="flex items-center gap-2">
                          {saveStateTasks === "success" && (
                            <span className="text-[10px] text-emerald-400 font-medium">✓ 保存しました</span>
                          )}
                          {saveStateTasks === "error" && (
                            <span className="text-[10px] text-rose-400 font-medium">⚠️ 保存に失敗しました</span>
                          )}
                          <button
                            onClick={() => handleSaveTasks()}
                            disabled={saveStateTasks === "saving"}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                          >
                            {saveStateTasks === "saving" ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={tasksText}
                        onChange={(e) => setTasksText(e.target.value)}
                        placeholder="やるべきことを記入..."
                        rows={6}
                        className="w-full bg-slate-800/80 text-slate-300 placeholder-slate-600 rounded-lg p-2 text-xs resize-none outline-none border border-slate-700 focus:border-blue-500 font-mono leading-relaxed"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                      {msg.provider === "groq" ? "⚡ Groq" : msg.provider === "ollama" ? "🖥️ Ollama" : msg.provider === "gemini" ? "✨ Gemini" : "🤖 Auto"}
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

        {/* Pending Tasks Update Proposal Card */}
        {pendingTasksUpdate && (
          <div className="bg-slate-800/95 border border-blue-500/30 rounded-xl p-4 my-4 shrink-0 backdrop-blur">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <h4 className="text-blue-400 font-semibold text-xs flex items-center gap-2">
                <span>📝</span> タスクの更新案があります
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingTasksUpdate(null)}
                  className="text-slate-400 hover:text-slate-200 text-[10px] px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 hover:bg-slate-700 transition-colors"
                >
                  無視する
                </button>
                <button
                  onClick={async () => {
                    await handleSaveTasks(pendingTasksUpdate);
                    setPendingTasksUpdate(null);
                  }}
                  disabled={saveStateTasks === "saving"}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                >
                  {saveStateTasks === "saving" ? "反映中..." : "反映する"}
                </button>
              </div>
            </div>
            <pre className="text-slate-300 text-[11px] bg-slate-900/60 p-3 rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-slate-800">
              {pendingTasksUpdate}
            </pre>
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
