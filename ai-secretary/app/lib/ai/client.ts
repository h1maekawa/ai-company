import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOllama } from "./ollama";
import { ChatMessage } from "./types";
import { getAIProviderErrorCode, isRateLimitError } from "./errors";

export type AIProvider = "gemini" | "groq" | "ollama" | "auto";
export type AIResponseFormat = "text" | "json";

type ProviderCall = () => Promise<string>;

/** auto専用: Geminiのrate limitだけをGroqへ1回fallbackする。 */
export async function callAutoWithRateLimitFallback(options: {
  hasGemini: boolean;
  hasGroq: boolean;
  isVercel: boolean;
  gemini: ProviderCall;
  groq: ProviderCall;
  ollama: ProviderCall;
}): Promise<string> {
  if (options.hasGemini) {
    try {
      return await options.gemini();
    } catch (error) {
      if (
        (!isRateLimitError(error) && getAIProviderErrorCode(error) !== "rate_limited") ||
        !options.hasGroq
      ) throw error;
      console.warn("[callAI] Gemini rate limited; auto provider is falling back to Groq once.");
      return options.groq();
    }
  }
  if (options.hasGroq) return options.groq();
  if (!options.isVercel) {
    console.warn("[callAI] Groq/Gemini未設定。auto指定のためOllamaにフォールバック（ローカルのみ）。");
    return options.ollama();
  }
  throw new Error(
    "GeminiのAPIキーが未設定です。GEMINI_API_KEY を .env.local または Vercel Environment Variables に設定してください。"
  );
}

/**
 * 全ファイル共通のLLM呼び出し関数。デフォルトはGemini。
 */
export async function callAI(
  message: string,
  systemPrompt: string,
  options: {
    history?: ChatMessage[];
    signal?: AbortSignal;
    provider?: AIProvider;
    responseFormat?: AIResponseFormat;
  } = {}
): Promise<string> {
  const { history = [], provider = (process.env.DEFAULT_PROVIDER as AIProvider | undefined) ?? "gemini", responseFormat = "text" } = options;

  const isVercel = !!process.env.VERCEL;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (provider === "gemini" && hasGemini) {
    return callGemini(message, systemPrompt, history, responseFormat, options.signal);
  }
  if (provider === "gemini" && !hasGemini) {
    throw new Error("GeminiのAPIキーが未設定です。GEMINI_API_KEY を .env.local または Vercel Environment Variables に設定してください。");
  }
  if (provider === "groq" && hasGroq) {
    return callGroq(message, systemPrompt, history, responseFormat, options.signal);
  }
  if (provider === "groq" && !hasGroq) {
    throw new Error("Groqの設定に問題があります。GROQ_API_KEY が設定されているか確認してください。");
  }
  if (provider === "ollama" && !isVercel) {
    return callOllama(message, systemPrompt, history, responseFormat, options.signal);
  }
  if (provider === "ollama" && isVercel) {
    throw new Error("VercelではOllamaを使用できません。DEFAULT_PROVIDER=gemini を設定してください。");
  }

  // autoだけがrate limit時のfallbackを許可する。明示provider経路は上で直接return済み。
  return callAutoWithRateLimitFallback({
    hasGemini,
    hasGroq,
    isVercel,
    gemini: () => callGemini(message, systemPrompt, history, responseFormat, options.signal),
    groq: () => callGroq(message, systemPrompt, history, responseFormat, options.signal),
    ollama: () => callOllama(message, systemPrompt, history, responseFormat, options.signal),
  });
}
