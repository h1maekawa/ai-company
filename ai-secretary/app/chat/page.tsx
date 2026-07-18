"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { CENTER_NODE, GROUP_LABELS, findHubNode, HubNode } from "@/app/lib/config/hub";

type Provider = "groq" | "ollama" | "gemini" | "auto";
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: Provider;
};

// marked v18: カスタムレンダラーで token.text を使うとインライン記法が未変換の
// 生Markdownのまま出力される（**太字** 等がそのまま見える）ため、レンダラーは
// 差し替えず素のHTMLに変換し、見た目は globals.css の .chat-md で整える。
marked.setOptions({ gfm: true, breaks: true });

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

/** 送信時（ユーザー操作中）に一度だけ通知許可を求める */
function ensureNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

/**
 * ウィンドウを見ていないとき（別アプリ作業中・最小化中）だけ
 * macOS/OSの通知センターに完了通知を出す。
 */
function notifyIfBackground(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification(title, {
      body,
      tag: "ai-secretary-reply",
      icon: "/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // 通知が出せない環境では静かに無視
  }
}

function ChatView() {
  const searchParams = useSearchParams();
  const node: HubNode = findHubNode(searchParams.get("node")) ?? CENTER_NODE;
  // 中央ノード（AI秘書）だけは秘書を固定せず、従来のインテント自動振り分けに任せる
  const pinnedSecretaryId = node.id === CENTER_NODE.id ? undefined : node.secretaryId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>(resolveDefaultProvider);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [roleText, setRoleText] = useState("");
  const [tasksText, setTasksText] = useState("");
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [saveStateRole, setSaveStateRole] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveStateTasks, setSaveStateTasks] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [pendingTasksUpdate, setPendingTasksUpdate] = useState<string | null>(null);
  const [kaizenProposal, setKaizenProposal] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ?node= が変わったら（改善秘書へ相談リンク等）会話をリセットして別部署として開始
  useEffect(() => {
    setMessages([]);
    setKaizenProposal(null);
    setPendingTasksUpdate(null);
  }, [node.id]);

  useEffect(() => {
    if (node.mode === "company") {
      const fetchMemory = async () => {
        setLoadingMemory(true);
        try {
          const [roleRes, tasksRes] = await Promise.all([
            fetch("/api/memory/role.md").then((r) => r.json()),
            fetch("/api/memory/tasks.md").then((r) => r.json()),
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
  }, [node.mode]);

  async function handleSaveRole() {
    setSaveStateRole("saving");
    try {
      const res = await fetch("/api/memory/role.md", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

    ensureNotificationPermission();
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider,
          mode: node.mode,
          secretaryId: pinnedSecretaryId,
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
        { role: "assistant", content: reply, provider: data.provider },
      ]);
      if (data.kaizen) {
        setKaizenProposal(data.kaizen);
      }
      notifyIfBackground(
        `${node.icon} ${node.name}の回答が届きました`,
        reply.replace(/[#*`>\-|]/g, "").slice(0, 120)
      );
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ 接続エラー。サーバーを確認してください。" },
      ]);
      notifyIfBackground(`${node.icon} ${node.name}`, "⚠️ 接続エラーが発生しました");
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

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/"
              aria-label="マップに戻る"
              className="shrink-0 flex items-center gap-1 text-slate-400 hover:text-slate-200 text-sm border border-slate-700 hover:border-slate-500 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              ← 🧠
            </Link>
            <div
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base"
              style={{ backgroundColor: node.color + "33", border: `1px solid ${node.color}` }}
            >
              {node.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-white font-semibold text-base leading-none">{node.name}</h1>
                <span
                  className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    color: GROUP_LABELS[node.group].color,
                    backgroundColor: GROUP_LABELS[node.group].color + "1a",
                  }}
                >
                  {GROUP_LABELS[node.group].icon} {GROUP_LABELS[node.group].name}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5 truncate">{node.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              aria-label="AIプロバイダー"
              className="bg-slate-800 text-slate-200 text-xs sm:text-sm rounded-lg pl-2 pr-1 py-1.5 border border-slate-700 focus:border-blue-500 outline-none max-w-[6rem] sm:max-w-none"
            >
              <option value="gemini">✨ Gemini</option>
              <option value="groq">⚡ Groq</option>
              <option value="ollama">🖥️ Ollama</option>
              <option value="auto">🤖 Auto</option>
            </select>
          </div>
        </div>
      </header>

      {/* Fund report link */}
      {node.mode === "finance" && (
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
      {node.mode === "company" && (
        <div className="border-b border-slate-800 bg-slate-900/20 max-w-3xl w-full mx-auto px-4 pt-4 pb-2">
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg">
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

            {isPanelOpen && (
              <div className="p-4 bg-slate-900/40 border-t border-slate-800 space-y-4">
                {loadingMemory ? (
                  <div className="text-center py-4 text-xs text-slate-500 animate-pulse">
                    メモリをロード中...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: node.color + "22", border: `1px solid ${node.color}55` }}
            >
              {node.icon}
            </div>
            <p className="text-slate-300 text-lg">{node.name}</p>
            <p className="text-slate-500 text-sm">{node.tagline}</p>
            <div className="flex flex-col gap-2 items-center mt-6">
              {node.examples.map((ex) => (
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
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 mt-1 shrink-0"
                style={{ backgroundColor: node.color + "33", border: `1px solid ${node.color}` }}
              >
                {node.icon}
              </div>
            )}
            <div className="max-w-[85%]">
              {msg.role === "assistant" && msg.provider && (
                <div className="mb-1 flex gap-1.5 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    {node.icon} {node.name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PROVIDER_BADGE[msg.provider]}`}>
                    {msg.provider === "groq" ? "⚡ Groq" : msg.provider === "ollama" ? "🖥️ Ollama" : msg.provider === "gemini" ? "✨ Gemini" : "🤖 Auto"}
                  </span>
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
                  <div className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mb-6">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 mt-1 shrink-0"
              style={{ backgroundColor: node.color + "33", border: `1px solid ${node.color}` }}
            >
              {node.icon}
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="text-slate-400 text-sm">
                {node.icon} {node.name} · {PROVIDER_LABELS[provider]}で考え中
              </span>
              <span className="text-slate-400 text-sm animate-pulse">...</span>
            </div>
          </div>
        )}

        {/* Kaizen Proposal Card */}
        {kaizenProposal && (
          <div className="bg-slate-800/95 border border-lime-500/30 rounded-xl p-4 my-4 shrink-0 backdrop-blur">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <h4 className="text-lime-400 font-semibold text-xs flex items-center gap-2">
                <span>💡</span> AI会社の改善提案があります（自動で記録済み）
              </h4>
              <div className="flex gap-2">
                <Link
                  href="/chat?node=kaizen"
                  className="bg-lime-600 hover:bg-lime-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                >
                  改善秘書と相談
                </Link>
                <button
                  onClick={() => setKaizenProposal(null)}
                  className="text-slate-400 hover:text-slate-200 text-[10px] px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 hover:bg-slate-700 transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
            <pre className="text-slate-300 text-[11px] bg-slate-900/60 p-3 rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-slate-800">
              {kaizenProposal}
            </pre>
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
            placeholder={`${node.name} に話しかける... (Enter で送信 / Shift+Enter で改行)`}
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

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
