import { ChatMessage } from "./types";
import { AIProviderError, AIRateLimitError, parseRetryAfterMs, type AIProviderErrorCode } from "./errors";
import type { AIResponseFormat } from "./client";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
// llama-3.1-8b-instant は2026-08-16 shutdown。Groq公式の後継を安全な既定値にする。
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function buildGroqRequestBody(
  messages: { role: string; content: string }[],
  responseFormat: AIResponseFormat = "text"
): Record<string, unknown> {
  return {
    model: GROQ_MODEL,
    messages,
    temperature: 0.7,
    ...(responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
  };
}

export async function callGroq(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = [],
  responseFormat: AIResponseFormat = "text"
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
    body: JSON.stringify(buildGroqRequestBody(messages, responseFormat)),
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    const code = classifyGroqError(res.status, rawBody);
    if (code === "rate_limited") {
      throw new AIRateLimitError(parseRetryAfterMs(res.headers.get("retry-after"), rawBody));
    }
    throw new AIProviderError(code);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "応答を取得できませんでした。";
}

/** GroqのHTTP応答をSecretを含まない安定した理由コードへ分類する。 */
export function classifyGroqError(status: number, rawBody = ""): AIProviderErrorCode {
  const body = rawBody.toLowerCase();
  if (status === 401) return "invalid_api_key";
  if (status === 403) return "model_permission";
  if (status === 429) return "rate_limited";
  if (status === 404 || /model.*(not found|unavailable|deprecat|shut|does not exist)/i.test(body)) {
    return "model_unavailable";
  }
  if (
    status === 413 ||
    ((status === 400 || status === 422) && /(context|token|input).*(too long|limit|exceed|maximum)/i.test(body))
  ) {
    return "input_too_long";
  }
  return "provider_error";
}
