import { ChatMessage } from "./types";
import { AIRateLimitError, parseRetryAfterMs } from "./errors";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function callGroq(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("Groqの設定に問題があります。GROQ_API_KEY が設定されているか確認してください。");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new AIRateLimitError(parseRetryAfterMs(res.headers.get("retry-after"), rawBody));
    }
    let detail = `Groq error: ${res.status}`;
    try {
      detail = JSON.parse(rawBody)?.error?.message ?? detail;
    } catch {}
    throw new Error(`Groqの設定に問題があります。GROQ_API_KEY が設定されているか確認してください。詳細: ${detail}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "応答を取得できませんでした。";
}
