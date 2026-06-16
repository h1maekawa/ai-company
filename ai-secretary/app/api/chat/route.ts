import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt } from "@/app/lib/prompts";
import { SecretaryMode } from "@/app/lib/config/modes";
import { callOllama } from "@/app/lib/ai/ollama";
import { callGemini } from "@/app/lib/ai/gemini";
import { callGroq } from "@/app/lib/ai/groq";
import { loadMemoryFromVault } from "@/app/lib/memory/loader";

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
  let systemPrompt = getSystemPrompt(activeMode);

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
    let reply: string;
    if (selectedProvider === "gemini") reply = await callGemini(message, systemPrompt);
    else if (selectedProvider === "groq") reply = await callGroq(message, systemPrompt);
    else reply = await callOllama(message, systemPrompt);

    return NextResponse.json({ reply, provider: selectedProvider, mode: activeMode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}