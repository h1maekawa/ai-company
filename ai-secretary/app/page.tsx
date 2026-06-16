"use client";

import { useState, useRef, useEffect } from "react";
import {
  SECRETARY_LABELS,
  SECRETARY_DESCRIPTIONS,
} from "@/app/lib/prompts";
import { SecretaryMode, SECRETARY_MODES } from "@/app/lib/config/modes";

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
  groq: "⚡ Groq（超高速）",
  auto: "🤖 Auto（自動判定）",
};

const PROVIDER_BADGE: Record<string, string> = {
  ollama: "bg-slate-700 text-slate-300",
  gemini: "bg-blue-900 text-blue-300",
  groq: "bg-orange-900 text-orange-300",
};

const MODE_ICON: Record<SecretaryMode, string> = {
  personal: "👤",
  company: "💼",
  finance: "💰",
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
    "新規事業 of 論点を洗い出して",
    "意思決定の壁打ちをしたい",
  ],
  finance: [
    "現在の資産比率（ポートフォリオ）をどう最適化すべき？",
    "ウォッチリストに登録している企業の評価方法について",
    "長期的なインデックス積立と個別株投資の戦略バランス",
  ],
  note: [
    "今日の記事を企画して",
    "楽天証券に合う記事ネタを5つ出して",
    "新NISAでタイトル案を5つ出して",
    "今月の投稿計画を立てて",
  ],
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
  const [mode, setMode] = useState<SecretaryMode>("note");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Modal suggestion states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalSlug, setModalSlug] = useState("");
  const [modalCategory, setModalCategory] = useState("misc");
  const [modalImportance, setModalImportance] = useState<1 | 2 | 3>(1);
  const [modalContent, setModalContent] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);

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

      // Pop modal if the Hybrid checker suggests saving
      if (data.suggestSave) {
        setModalTitle(text.slice(0, 30));
        setModalSlug(data.slug || "knowledge-draft");
        setModalCategory(data.knowledgeCategory || "misc");
        setModalImportance(data.importance || 1);
        
        // Structure question and answer details for Vault content
        const formatted = `## ユーザーの質問\n${text}\n\n## AI秘書の回答\n${reply}`;
        setModalContent(formatted);
        
        setTimeout(() => {
          setShowSaveModal(true);
        }, 800);
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
        alert(`ナレッジを保存しました！\nID: ${data.id}\nパス: ${data.path}`);
        setShowSaveModal(false);
      } else {
        alert(`保存に失敗しました: ${data.error || "不明なエラー"}`);
      }
    } catch {
      alert("通信エラー。保存できませんでした。");
    } finally {
      setSavingKnowledge(false);
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
              {MODE_ICON[mode]} {SECRETARY_LABELS[mode]} · Ollama + Groq + Gemini
            </p>
          </div>
        </div>

        {/* Provider selector */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(["ollama", "groq", "gemini", "auto"] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${provider === p
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
          {SECRETARY_MODES.map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === m
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
          {provider === "groq" && "Groq LPU · llama-3.3-70b（超高速クラウド推論）"}
          {provider === "auto" && "キーワードで自動判定：「最新」「ニュース」「トレンド」→ Gemini、それ以外 → Groq"}
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
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
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

      {/* Save Suggestion Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-slate-700/60 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-blue-500/5 p-6 space-y-4">
            <div className="flex items-center gap-2 text-blue-400">
              <span className="text-xl font-bold">💡</span>
              <h3 className="text-white font-semibold text-lg">ナレッジ保存の提案</h3>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              この会話には重要な戦略や知見が含まれている可能性があります。Obsidianのナレッジベースに保存しますか？
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">タイトル (日本語)</label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
                  placeholder="タイトルを入力..."
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">ファイル名スラグ (英数字とハイフンのみ)</label>
                <input
                  type="text"
                  value={modalSlug}
                  onChange={(e) => setModalSlug(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
                  placeholder="例: docomo-sales-improvement"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">カテゴリ</label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
                  >
                    {KNOWLEDGE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">重要度</label>
                  <div className="flex items-center gap-1.5 h-[38px]">
                    {[1, 2, 3].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setModalImportance(star as 1 | 2 | 3)}
                        className="text-lg focus:outline-none transition-transform active:scale-95"
                      >
                        {modalImportance >= star ? (
                          <span className="text-yellow-400">★</span>
                        ) : (
                          <span className="text-slate-600">☆</span>
                        )}
                      </button>
                    ))}
                    <span className="text-slate-500 text-xs ml-1">
                      {modalImportance === 3 ? "資産化優先" : modalImportance === 2 ? "再利用価値" : "メモレベル"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800/80">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-medium transition-colors"
              >
                スキップ
              </button>
              <button
                onClick={handleSaveKnowledge}
                disabled={savingKnowledge}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-5 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:bg-slate-700 disabled:text-slate-500"
              >
                {savingKnowledge ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></span>
                    保存中...
                  </>
                ) : (
                  "保存する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}