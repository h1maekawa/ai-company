import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOllama } from "./ollama";
import { ChatMessage } from "./types";

export type AIProvider = "gemini" | "groq" | "ollama" | "auto";

/**
 * 全ファイル共通のLLM呼び出し関数。デフォルトはGemini。
 */
export async function callAI(
  message: string,
  systemPrompt: string,
  options: {
    history?: ChatMessage[];
    provider?: AIProvider;
  } = {}
): Promise<string> {
  const { history = [], provider = (process.env.DEFAULT_PROVIDER as AIProvider | undefined) ?? "gemini" } = options;

  const isVercel = !!process.env.VERCEL;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (provider === "gemini" && hasGemini) {
    return callGemini(message, systemPrompt, history);
  }
  if (provider === "gemini" && !hasGemini) {
    throw new Error("GeminiのAPIキーが未設定です。GEMINI_API_KEY を .env.local または Vercel Environment Variables に設定してください。");
  }
  if (provider === "groq" && hasGroq) {
    return callGroq(message, systemPrompt, history);
  }
  if (provider === "groq" && !hasGroq) {
    throw new Error("Groqの設定に問題があります。GROQ_API_KEY が設定されているか確認してください。");
  }
  if (provider === "ollama" && !isVercel) {
    return callOllama(message, systemPrompt, history);
  }
  if (provider === "ollama" && isVercel) {
    throw new Error("VercelではOllamaを使用できません。DEFAULT_PROVIDER=gemini を設定してください。");
  }

  // auto: Geminiを最優先。明示providerでは他プロバイダーへ自動fallbackしない。
  if (hasGemini) {
    return callGemini(message, systemPrompt, history);
  }
  if (hasGroq) {
    return callGroq(message, systemPrompt, history);
  }
  if (!isVercel) {
    console.warn("[callAI] Groq/Gemini未設定。auto指定のためOllamaにフォールバック（ローカルのみ）。");
    return callOllama(message, systemPrompt, history);
  }

  throw new Error(
    "GeminiのAPIキーが未設定です。GEMINI_API_KEY を .env.local または Vercel Environment Variables に設定してください。"
  );
}
