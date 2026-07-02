import { ChatMessage } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export async function callGemini(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GeminiのAPIキーが未設定です。GEMINI_API_KEY を .env.local または Vercel Environment Variables に設定してください。");
  }

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  );

  if (!res.ok) {
    let detail = `Gemini error: ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message ?? detail;
    } catch {}

    const normalized = detail.toLowerCase();
    if (
      res.status === 400 &&
      (normalized.includes("token") ||
        normalized.includes("too long") ||
        normalized.includes("input") ||
        normalized.includes("context"))
    ) {
      throw new Error("Geminiへの入力が長すぎます。読み込むmemory量を減らしてください。");
    }

    throw new Error(`Gemini APIでエラーが発生しました。APIキー、モデル名、利用制限を確認してください。詳細: ${detail}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "応答を取得できませんでした。";
}
