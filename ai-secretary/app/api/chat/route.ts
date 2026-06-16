import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, SecretaryMode } from "@/app/lib/prompts";
import { getVaultFile } from "@/app/lib/vault";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ─── Ollama ───────────────────────────────────────────
async function callOllama(message: string, systemPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
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
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Ollamaサーバーに接続できません（クラウド環境ではGroqまたはGeminiをご利用ください）。");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
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

// ─── Groq ─────────────────────────────────────────────
async function callGroq(message: string, systemPrompt: string): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEYが設定されていません。.env.localを確認してください。");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? `Groq error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "応答を取得できませんでした。";
}

// ─── ルーティング判定 ──────────────────────────────────
function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

// ─── メモリ読み込み ──────────────────────────────────
async function loadMemoryFromVault(): Promise<string> {
  const memoryFiles = [
    { name: "profile.md", path: "memory/profile.md" },
    { name: "goals.md", path: "memory/goals.md" },
    { name: "today.md", path: "memory/today.md" },
  ];

  const loadedParts: string[] = [];

  for (const file of memoryFiles) {
    try {
      const { content } = await getVaultFile(file.path);
      if (content && content.trim()) {
        loadedParts.push(`=== ${file.name} ===\n${content.trim()}`);
      }
    } catch (e) {
      console.error(`Failed to load memory file ${file.name}:`, e);
    }
  }

  return loadedParts.join("\n\n");
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

  let systemPrompt = getSystemPrompt(mode);

  try {
    const memory = await loadMemoryFromVault();
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

    return NextResponse.json({ reply, provider: selectedProvider, mode: mode ?? "note" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}