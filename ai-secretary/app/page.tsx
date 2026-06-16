"use client";

import { useState, useRef, useEffect } from "react";
import OrgTree from "@/components/OrgTree";
import Breadcrumbs from "@/components/Breadcrumbs";
import ExecutivePanel from "@/components/ExecutivePanel";
import FlowMap from "@/components/FlowMap";
import { ContextBus, TaskNode, createDefaultBus } from "@/app/lib/context/bus";
import { findSecretary } from "@/app/lib/config/registry";

type Provider = "ollama" | "gemini" | "groq" | "auto";
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: "ollama" | "gemini" | "groq";
  secretaryId?: string;
};

function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-blue-400 mt-4 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-slate-350 mt-3 mb-1">$1</h3>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300">$1</li>')
    .replace(/^[-•] (.+)$/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, "<br/>");
}

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "🖥️ Ollama（ローカル）",
  gemini: "✨ Gemini（クラウド）",
  groq: "⚡ Groq（超高速）",
  auto: "🤖 Auto（自動判定）",
};

const PROVIDER_BADGE: Record<string, string> = {
  ollama: "bg-slate-700 text-slate-300",
  gemini: "bg-blue-900 text-blue-350",
  groq: "bg-amber-900 text-amber-305",
};

const KNOWLEDGE_CATEGORIES = [
  { value: "sales", label: "📈 営業 (Sales)" },
  { value: "marketing", label: "📢 マーケティング (Marketing)" },
  { value: "recruiting", label: "👥 採用 (Recruiting)" },
  { value: "investing", label: "💰 投資 (Investing)" },
  { value: "systems", label: "⚙️ システム (Systems)" },
  { value: "content", label: "📝 コンテンツ (Content)" },
  { value: "strategy", label: "🎯 戦略 (Strategy)" },
  { value: "misc", label: "📂 その他 (Misc)" },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("groq");
  const [selectedSecretaryId, setSelectedSecretaryId] = useState<string>("executive-router");
  const [contextBus, setContextBus] = useState<ContextBus>(createDefaultBus());
  const [recommendedNext, setRecommendedNext] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Note Mode sub-tab state (shown when in Note secretaries)
  const [noteTab, setNoteTab] = useState<"chat" | "write">("chat");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTheme, setNoteTheme] = useState("");
  const [noteTarget, setNoteTarget] = useState("");
  const [notePurpose, setNotePurpose] = useState("");
  const [noteCta, setNoteCta] = useState("");
  const [noteTemplate, setNoteTemplate] = useState("sales-template");
  const [generatingNote, setGeneratingNote] = useState(false);

  // Modal suggestion states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalSlug, setModalSlug] = useState("");
  const [modalCategory, setModalCategory] = useState("misc");
  const [modalImportance, setModalImportance] = useState<1 | 2 | 3>(1);
  const [modalContent, setModalContent] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // Success and promotion states
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedKnowledgeId, setSavedKnowledgeId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSuccess, setPromoteSuccess] = useState(false);
  const [promotedInfo, setPromotedInfo] = useState<{ draftPath?: string; draftId?: string }>({});

  // Load Context Bus on mount
  useEffect(() => {
    async function loadCurrentBus() {
      try {
        const res = await fetch("/api/chat");
        const data = await res.json();
        if (data.currentBus) {
          setContextBus(data.currentBus);
          setSelectedSecretaryId(data.currentBus.activeSecretary || "executive-router");
        }
      } catch (e) {
        console.error("[DEBUG] Failed to load initial ContextBus:", e);
      }
    }
    loadCurrentBus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeSecretary = findSecretary(selectedSecretaryId);
  const isNoteMode = selectedSecretaryId.startsWith("note-");

  async function handleSubmit() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setRecommendedNext(undefined); // Reset recommendation

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider,
          secretaryId: selectedSecretaryId,
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? "エラーが発生しました。";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply,
          provider: data.provider,
          secretaryId: data.secretaryId,
        },
      ]);

      if (data.currentBus) {
        setContextBus(data.currentBus);
      }

      // Auto Routing Trigger (confidence >= 0.8)
      if (data.routeTo) {
        setSelectedSecretaryId(data.routeTo);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `📢 **自動ルーティング**: [${findSecretary(data.routeTo)?.config.name || data.routeTo}] に自動遷移しました。`,
          },
        ]);
      }

      // Proposal Routing Trigger (confidence 0.5 - 0.79)
      if (data.recommendedNext) {
        setRecommendedNext(data.recommendedNext);
      }

      // Pop modal if save is suggested
      if (data.suggestSave) {
        setModalTitle(text.slice(0, 30));
        setModalSlug(data.slug || "knowledge-draft");
        setModalCategory(data.knowledgeCategory || "misc");
        setModalImportance(data.importance || 1);

        const formatted = `## ユーザーの質問\n${text}\n\n## AI秘書の回答\n${reply}`;
        setModalContent(formatted);

        setTimeout(() => {
          setShowSaveModal(true);
        }, 850);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ 接続エラー。サーバーを確認してください。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const handleAcceptRecommendation = () => {
    if (!recommendedNext) return;
    const nextId = recommendedNext;
    setSelectedSecretaryId(nextId);
    setRecommendedNext(undefined);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `📢 **遷移承認**: [${findSecretary(nextId)?.config.name || nextId}] に切り替えました。引き続きこちらで対話できます。`,
      },
    ]);
  };

  async function handleSaveKnowledge() {
    if (!modalTitle.trim() || !modalSlug.trim()) {
      alert("タイトルとスラグを入力してください。");
      return;
    }

    setSavingKnowledge(true);
    try {
      const res = await fetch("/api/knowledge/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: modalTitle,
          slug: modalSlug,
          category: modalCategory,
          importance: modalImportance,
          content: modalContent,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSavedKnowledgeId(data.id);
        setSaveSuccess(true);
      } else {
        alert(`保存に失敗しました: ${data.error || "不明なエラー"}`);
      }
    } catch {
      alert("通信エラー。保存できませんでした。");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function handlePromoteKnowledge() {
    if (!savedKnowledgeId) return;

    setPromoting(true);
    try {
      const res = await fetch("/api/note/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeId: savedKnowledgeId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPromotedInfo({
          draftPath: data.draftPath,
          draftId: data.draftId,
        });
        setPromoteSuccess(true);
      } else {
        alert(`昇格に失敗しました: ${data.error || "不明なエラー"}`);
      }
    } catch {
      alert("通信エラー。昇格できませんでした。");
    } finally {
      setPromoting(false);
    }
  }

  async function handleGenerateNote() {
    if (
      !noteTitle.trim() ||
      !noteTheme.trim() ||
      !noteTarget.trim() ||
      !notePurpose.trim() ||
      !noteCta.trim()
    ) {
      alert("すべての入力項目を入力してください。");
      return;
    }

    setGeneratingNote(true);
    try {
      const res = await fetch("/api/note/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noteTitle,
          theme: noteTheme,
          target: noteTarget,
          purpose: notePurpose,
          cta: noteCta,
          template: noteTemplate,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Note下書きを作成しました！\nID: ${data.id}\nパス: ${data.path}`);
        setNoteTitle("");
        setNoteTheme("");
        setNoteTarget("");
        setNotePurpose("");
        setNoteCta("");
      } else {
        alert(`生成に失敗しました: ${data.error || "不明なエラー"}`);
      }
    } catch {
      alert("通信エラー。Note記事を生成できませんでした。");
    } finally {
      setGeneratingNote(false);
    }
  }

  function closeSaveModal() {
    setShowSaveModal(false);
    setSaveSuccess(false);
    setSavedKnowledgeId("");
    setPromoting(false);
    setPromoteSuccess(false);
    setPromotedInfo({});
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-350 flex h-screen overflow-hidden">
      {/* 1. Left Sidebar (Organization Tree) */}
      <OrgTree
        activeSecretaryId={selectedSecretaryId}
        taskPipeline={contextBus.taskPipeline}
        onSelectSecretary={(id) => {
          setSelectedSecretaryId(id);
          setRecommendedNext(undefined);
        }}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0e1017]">
        {/* Header Block */}
        <header className="border-b border-slate-900 bg-[#12141c]/60 backdrop-blur-md px-6 py-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Breadcrumbs activeSecretaryId={selectedSecretaryId} />
              <span className="text-xxs px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-semibold border border-slate-700/60">
                {activeSecretary?.config.role || "司令塔役"}
              </span>
            </div>

            {/* LLM Provider Selector */}
            <div className="flex gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
              {(["ollama", "groq", "gemini", "auto"] as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`px-3 py-1.5 rounded text-xxs font-semibold transition-colors ${
                    provider === p
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {p === "ollama"
                    ? "🖥️ Ollama"
                    : p === "gemini"
                    ? "✨ Gemini"
                    : p === "groq"
                    ? "⚡ Groq"
                    : "🤖 Auto"}
                </button>
              ))}
            </div>
          </div>

          {/* Executive metrics Panel */}
          <ExecutivePanel contextBus={contextBus} recommendedNext={recommendedNext} />

          {/* FlowMap Tracker */}
          <FlowMap
            decisionHistory={contextBus.decisionHistory}
            activeSecretaryId={selectedSecretaryId}
          />
        </header>

        {/* Note Mode Subtabs (Planning/Writing/Monetize Room subtabs) */}
        {isNoteMode && (
          <div className="bg-[#12141c]/30 border-b border-slate-900/60 px-6 py-2 shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => setNoteTab("chat")}
                className={`px-3 py-1 rounded text-xxs font-bold border transition-colors ${
                  noteTab === "chat"
                    ? "bg-blue-900/20 text-blue-400 border-blue-500/30"
                    : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-300"
                }`}
              >
                💬 チャット壁打ち
              </button>
              <button
                onClick={() => setNoteTab("write")}
                className={`px-3 py-1 rounded text-xxs font-bold border transition-colors ${
                  noteTab === "write"
                    ? "bg-blue-900/20 text-blue-400 border-blue-500/30"
                    : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-300"
                }`}
              >
                ✍️ 下書き生成ツール
              </button>
            </div>
          </div>
        )}

        {/* Main interactive window */}
        <main className="flex-1 overflow-y-auto px-6 py-6 w-full max-w-4xl mx-auto flex flex-col justify-between">
          <div className="w-full">
            {isNoteMode && noteTab === "write" ? (
              // Write tool
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl shadow-black/10">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="text-lg">✍️</span>
                  <h3 className="text-white font-bold text-sm">Note下書き生成ツール</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-500 text-xxs font-semibold mb-1">
                      記事タイトル (ファイル名用)
                    </label>
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                      placeholder="例: 月5万円の副収入を得るための投資アプリ3選"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-xxs font-semibold mb-1">
                      テーマ (記事の題材や書きたい内容)
                    </label>
                    <textarea
                      value={noteTheme}
                      onChange={(e) => setNoteTheme(e.target.value)}
                      className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors h-20 resize-none"
                      placeholder="例: 初心者会社員向けの積立投資アプリの比較と選び方。SBI証券や楽天証券を想定。"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        想定ターゲット
                      </label>
                      <input
                        type="text"
                        value={noteTarget}
                        onChange={(e) => setNoteTarget(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                        placeholder="例: 20〜30代の投資初心者会社員"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        記事の目的
                      </label>
                      <input
                        type="text"
                        value={notePurpose}
                        onChange={(e) => setNotePurpose(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                        placeholder="例: 投資への一歩を踏み出してもらう"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        CTA (行動喚起)
                      </label>
                      <input
                        type="text"
                        value={noteCta}
                        onChange={(e) => setNoteCta(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                        placeholder="例: 記事内のアフィリエイトリンクから口座開設"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        適用テンプレート
                      </label>
                      <select
                        value={noteTemplate}
                        onChange={(e) => setNoteTemplate(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                      >
                        <option value="sales-template">📈 営業・マーケティング</option>
                        <option value="finance-template">💰 ファイナンス・投資</option>
                        <option value="career-template">💼 就活・キャリア</option>
                        <option value="great-person-template">📜 労働×偉人・歴史</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800/80">
                  <button
                    onClick={handleGenerateNote}
                    disabled={generatingNote}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:bg-slate-700"
                  >
                    {generatingNote ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></span>
                        記事執筆中...
                      </>
                    ) : (
                      "下書き生成"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              // Chat
              <>
                {messages.length === 0 && (
                  <div className="text-center mt-12 space-y-4">
                    <span className="text-3xl block">
                      {activeSecretary?.config.id === "executive-router" ? "👑" : "👤"}
                    </span>
                    <h3 className="text-white font-bold text-base">
                      {activeSecretary?.config.name || "副代表AI (ルーティング)"}
                    </h3>
                    <p className="text-slate-500 text-xs max-w-md mx-auto leading-relaxed">
                      {activeSecretary?.config.prompt.substring(0, 150) ||
                        "相談内容に合わせた専門秘書への自動案内、または直接対話が可能です。"}
                      ...
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`mb-6 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center text-xs font-bold mr-3 mt-1 shrink-0">
                        AI
                      </div>
                    )}
                    <div className="max-w-[85%]">
                      {msg.role === "assistant" && (msg.provider || msg.secretaryId) && (
                        <div className="mb-1 flex gap-1.5 flex-wrap">
                          {msg.secretaryId && (
                            <span className="text-xxs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/40">
                              {findSecretary(msg.secretaryId)?.config.name.replace(/\s*\(.*\)/, "") ||
                                msg.secretaryId}
                            </span>
                          )}
                          {msg.provider && (
                            <span
                              className={`text-xxs px-2 py-0.5 rounded-full ${
                                PROVIDER_BADGE[msg.provider]
                              }`}
                            >
                              {msg.provider.toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-[#161821] text-slate-200 rounded-tl-none border border-slate-800/80"
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
                    <div className="w-7 h-7 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center text-xs font-bold mr-3 mt-1 shrink-0">
                      AI
                    </div>
                    <div className="bg-[#161821] border border-slate-800/80 rounded-xl rounded-tl-none px-4 py-3">
                      <span className="text-slate-500 text-xs">
                        {activeSecretary?.config.name || "副代表AI"} が思考中
                      </span>
                      <span className="text-slate-400 text-xs animate-pulse">...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Recommended transition suggestion banner */}
          {recommendedNext && !loading && (
            <div className="my-4 p-3 bg-blue-900/10 border border-blue-500/20 rounded-xl flex items-center justify-between gap-3 shadow-md shadow-blue-500/5">
              <div className="text-xxs text-slate-400">
                💡 COO推薦: この話題は{" "}
                <strong className="text-blue-400">
                  {findSecretary(recommendedNext)?.config.name || recommendedNext}
                </strong>{" "}
                が最適です。切り替えますか？
              </div>
              <button
                onClick={handleAcceptRecommendation}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xxs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                切り替える
              </button>
            </div>
          )}

          {/* Input Box */}
          {!(isNoteMode && noteTab === "write") && (
            <div className="mt-6 border-t border-slate-900 pt-4 bg-[#0e1017]">
              <div className="flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`${
                    activeSecretary?.config.name || "副代表AI"
                  } にメッセージを送る... (Enterで送信 / Shift+Enterで改行)`}
                  rows={1}
                  className="flex-1 bg-slate-900 text-slate-200 placeholder-slate-650 rounded-xl px-4 py-3 text-xs resize-none outline-none border border-slate-800 focus:border-blue-500 min-h-[42px] max-h-36 transition-colors"
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 140) + "px";
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl px-5 py-3 text-xs font-bold shrink-0 h-[42px] transition-colors"
                >
                  送信
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 2. Right Sidebar (Task Pipeline View) */}
      <aside className="w-60 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            📋 タスクパイプライン
          </h3>
          <p className="text-xxs text-slate-500 mt-0.5">Context Bus タスク一覧</p>
        </div>

        <div className="flex-1 p-3 space-y-2">
          {contextBus.taskPipeline.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-xxs leading-relaxed">
              登録済みのタスクはありません。
              <br />
              (会話中にAIが自動的にタスクを作成します)
            </div>
          ) : (
            contextBus.taskPipeline.map((task) => {
              const statusColors = {
                pending: "bg-slate-800 text-slate-500 border-slate-700/60",
                in_progress: "bg-amber-900/20 text-amber-400 border-amber-500/20",
                done: "bg-emerald-900/20 text-emerald-400 border-emerald-500/20",
                blocked: "bg-rose-900/20 text-rose-400 border-rose-500/20",
              };
              const statusLabels = {
                pending: "未着手",
                in_progress: "進行中",
                done: "完了",
                blocked: "保留",
              };

              return (
                <div
                  key={task.id}
                  className="p-2.5 rounded-lg bg-slate-850 border border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xxs font-bold text-slate-300 leading-tight">
                      {task.title}
                    </span>
                    <span
                      className={`text-xxxxs px-1.5 py-0.5 rounded border ${
                        statusColors[task.status]
                      }`}
                    >
                      {statusLabels[task.status]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xxxxs text-slate-500">
                    <span>担当: {findSecretary(task.owner)?.config.name.replace(/\s*\(.*\)/, "") || task.owner}</span>
                    <span>ID: {task.id}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Save Suggestion Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#13151f] border border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-blue-400 border-b border-slate-850 pb-2">
              <span className="text-lg">💡</span>
              <h3 className="text-white font-bold text-sm">ナレッジ保存の提案</h3>
            </div>

            {!saveSuccess ? (
              <>
                <p className="text-slate-400 text-xxs leading-relaxed">
                  この会話には重要なナレッジが含まれています。Obsidianナレッジベースに保存しますか？
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-500 text-xxs font-semibold mb-1">
                      タイトル (日本語)
                    </label>
                    <input
                      type="text"
                      value={modalTitle}
                      onChange={(e) => setModalTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-xxs font-semibold mb-1">
                      ファイル名スラグ (英数字・ハイフン)
                    </label>
                    <input
                      type="text"
                      value={modalSlug}
                      onChange={(e) => setModalSlug(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        カテゴリ
                      </label>
                      <select
                        value={modalCategory}
                        onChange={(e) => setModalCategory(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                      >
                        {KNOWLEDGE_CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-500 text-xxs font-semibold mb-1">
                        重要度
                      </label>
                      <div className="flex items-center gap-1.5 h-[34px]">
                        {[1, 2, 3].map((star) => (
                          <button
                            key={star}
                            onClick={() => setModalImportance(star as 1 | 2 | 3)}
                            className="text-sm focus:outline-none"
                          >
                            {modalImportance >= star ? (
                              <span className="text-yellow-400">★</span>
                            ) : (
                              <span className="text-slate-700">☆</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-850">
                  <button
                    onClick={closeSaveModal}
                    className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-xxs font-semibold transition-colors"
                  >
                    スキップ
                  </button>
                  <button
                    onClick={handleSaveKnowledge}
                    disabled={savingKnowledge}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-5 py-2 text-xxs font-semibold transition-colors disabled:bg-slate-800"
                  >
                    {savingKnowledge ? "保存中..." : "保存する"}
                  </button>
                </div>
              </>
            ) : !promoteSuccess ? (
              <div className="space-y-4 text-center">
                <span className="text-3xl block">🎉</span>
                <h4 className="text-white font-bold text-sm">ナレッジを保存しました！</h4>
                <p className="text-slate-500 text-xxs">ID: {savedKnowledgeId}</p>

                <div className="bg-slate-900/60 border border-slate-850 rounded-lg p-3 text-slate-400 text-xxs text-left leading-relaxed">
                  <strong>続けてNote記事に昇格（Promote）しますか？</strong>
                  <br />
                  自動的にリサーチファイルを生成し、AIによる下書き執筆段階に移ります。
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-850">
                  <button
                    onClick={closeSaveModal}
                    className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-xxs font-semibold transition-colors"
                  >
                    閉じる
                  </button>
                  <button
                    onClick={handlePromoteKnowledge}
                    disabled={promoting}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-5 py-2 text-xxs font-semibold transition-colors"
                  >
                    {promoting ? "昇格中..." : "昇格する"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <span className="text-3xl block text-center">🚀</span>
                <h4 className="text-white font-bold text-sm text-center">Note下書きへ昇格完了！</h4>

                <div className="bg-slate-900 border border-slate-850 rounded-lg p-4 space-y-2 text-xxs text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-300">📁 リサーチ:</span>{" "}
                    {promotedInfo.draftPath?.replace("/drafts/", "/research/").replace(".md", "")}{" "}
                    (Research)
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300">✍️ 下書き:</span>{" "}
                    {promotedInfo.draftPath}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300">🆔 下書きID:</span>{" "}
                    {promotedInfo.draftId}
                  </div>
                </div>

                <div className="flex items-center justify-end pt-4 border-t border-slate-850">
                  <button
                    onClick={closeSaveModal}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg px-6 py-2 text-xxs font-semibold transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}