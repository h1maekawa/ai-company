const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";

export async function callOllama(message: string, systemPrompt: string): Promise<string> {
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
