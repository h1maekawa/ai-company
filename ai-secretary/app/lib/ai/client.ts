import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOllama } from "./ollama";
import { ChatMessage } from "./types";

export type AIProvider = "gemini" | "groq" | "ollama" | "auto";

/**
 * 全ファイル共通のLLM呼び出し関数。Gemini優先、Groq→Ollamaの順でフォールバック。
 */
export async function callAI(
  message: string,
  systemPrompt: string,
  options: {
    history?: ChatMessage[];
    provider?: AIProvider;
  } = {}
): Promise<string> {
  const { history = [], provider = "auto" } = options;

  const isVercel = !!process.env.VERCEL;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (provider === "gemini" && hasGemini) {
    return callGemini(message, systemPrompt, history);
  }
  if (provider === "groq" && hasGroq) {
    return callGroq(message, systemPrompt, history);
  }
  if (provider === "ollama" && !isVercel) {
    return callOllama(message, systemPrompt, history);
  }

  // auto: Gemini優先で自動選択
  if (hasGemini) {
    return callGemini(message, systemPrompt, history);
  }
  if (hasGroq) {
    console.warn("[callAI] GEMINI_API_KEY未設定。Groqにフォールバック。");
    return callGroq(message, systemPrompt, history);
  }
  if (!isVercel) {
    console.warn("[callAI] APIキー未設定。Ollamaにフォールバック（ローカルのみ）。");
    return callOllama(message, systemPrompt, history);
  }

  throw new Error(
    "[callAI] GEMINI_API_KEY も GROQ_API_KEY も設定されていません。" +
    "Vercelの環境変数を確認してください。"
  );
}
