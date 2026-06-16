import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt } from "@/app/lib/prompts";
import { SecretaryMode } from "@/app/lib/config/modes";
import { callOllama } from "@/app/lib/ai/ollama";
import { callGemini } from "@/app/lib/ai/gemini";
import { callGroq } from "@/app/lib/ai/groq";
import { loadMemoryFromVault } from "@/app/lib/memory/loader";
import { parseSaveSuggestion } from "@/app/lib/parser/saveSuggestion";
import { saveChatLog } from "@/app/lib/memory/logs";

// ─── ルーティング判定 ──────────────────────────────────
function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

// ─── メインハンドラー ──────────────────────────────────
export async function POST(req: NextRequest) {
  const { message, provider, mode } = (await req.json()) as {
    message?: string;
    provider?: "ollama" | "gemini" | "groq" | "auto";
    mode?: SecretaryMode;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }

  const activeMode: SecretaryMode = mode || "personal";
  
  // Define instructions for LLM to suggest saving worth-while conversations
  const promptSuffix = `

---
## 会話の保存判定ルール
今回の会話が「戦略設計、営業改善、仮説整理、意思決定、学び、失敗分析、コンテンツ設計、投資分析、業務改善」のいずれかに該当し、ナレッジとして保存する価値があるか判定してください。
保存する価値があると判断した場合、回答の最後に以下のHTMLコメント形式で、1行のメタデータを必ず追加してください（会話の文脈に最も合致するカテゴリと推奨スラグ、重要度を選択してください）。
保存価値がない場合は、何も追加しないでください。

<!-- SAVE_SUGGESTION: {
  "suggestSave": true,
  "category": "sales | marketing | recruiting | investing | systems | content | strategy | misc",
  "slug": "推奨されるファイル名用英数字スラグ（日本語不可、小文字、英数字とハイフンのみ。例: docomo-sales-improvement）",
  "importance": 1-3
} -->
`;

  let systemPrompt = getSystemPrompt(activeMode) + promptSuffix;

  try {
    const memory = await loadMemoryFromVault(activeMode);
    if (memory) {
      systemPrompt = `${systemPrompt}\n\n---\n## あなたが把握しているユーザー情報（自動読み込み）\n\n${memory}\n---\n`;
    }
  } catch (e) {
    console.error("Failed to append memory files to system prompt:", e);
  }

  let selectedProvider: "ollama" | "gemini" | "groq" = "groq";
  if (provider === "ollama") selectedProvider = "ollama";
  else if (provider === "gemini") selectedProvider = "gemini";
  else if (provider === "groq") selectedProvider = "groq";
  else if (provider === "auto") {
    selectedProvider = shouldUseGemini(message) ? "gemini" : "groq";
  }

  try {
    let rawReply: string;
    if (selectedProvider === "gemini") rawReply = await callGemini(message, systemPrompt);
    else if (selectedProvider === "groq") rawReply = await callGroq(message, systemPrompt);
    else rawReply = await callOllama(message, systemPrompt);

    // Hybrid precheck and suggestion parsing
    const parsed = parseSaveSuggestion(message, rawReply);

    // ─── Save Summary Log in the background (fire-and-forget) ───
    saveChatLog(activeMode, message, parsed.replyWithoutMetadata).catch((err) => {
      console.error("[DEBUG] Background saveChatLog failed:", err);
    });

    return NextResponse.json({
      reply: parsed.replyWithoutMetadata,
      suggestSave: parsed.suggestSave,
      knowledgeCategory: parsed.category,
      slug: parsed.slug,
      importance: parsed.importance,
      provider: selectedProvider,
      mode: activeMode,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}