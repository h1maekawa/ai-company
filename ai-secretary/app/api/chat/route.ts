import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, SecretaryMode } from "@/app/lib/prompts";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-2.0-flash";

// ─── Ollama ───────────────────────────────────────────
async function callOllama(message: string, systemPrompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data?.message?.content ?? "応答を取得できませんでした。";
}

// ─── Gemini ───────────────────────────────────────────
async function callGemini(message: string, systemPrompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEYが設定されていません。.env.localを確認してください。");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "応答を取得できませんでした。";
}

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
    provider?: "ollama" | "gemini" | "auto";
    mode?: SecretaryMode;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }

  // 秘書モード別のシステムプロンプトを取得
  const systemPrompt = getSystemPrompt(mode);

  // provider: "ollama" | "gemini" | "auto"
  let useGemini = false;
  if (provider === "gemini") useGemini = true;
  else if (provider === "auto") useGemini = shouldUseGemini(message);

  try {
    const reply = useGemini
      ? await callGemini(message, systemPrompt)
      : await callOllama(message, systemPrompt);
    const usedProvider = useGemini ? "gemini" : "ollama";
    return NextResponse.json({ reply, provider: usedProvider, mode: mode ?? "note" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
