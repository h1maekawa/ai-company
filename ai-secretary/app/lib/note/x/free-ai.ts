export type XFreeAiConfig = {
  order: ("ollama" | "gemini")[];
  requireFreeTier: true;
  allowPaidFallback: false;
  geminiAllowed: boolean;
  geminiReason?: string;
};

export function getXFreeAiConfig(env: NodeJS.ProcessEnv = process.env): XFreeAiConfig {
  if (env.AI_ALLOW_PAID_FALLBACK === "true") throw new Error("X無料ワークスペースでは有料fallbackを許可しません");
  if (env.GEMINI_ALLOW_BILLING === "true") throw new Error("X無料ワークスペースではGemini課金接続を許可しません");
  const requested = (env.AI_PROVIDER_ORDER || "ollama,gemini").split(",").map((v) => v.trim());
  const order = requested.filter((v): v is "ollama" | "gemini" => v === "ollama" || v === "gemini");
  if (order[0] !== "ollama") throw new Error("Ollamaを第一優先にしてください");
  const freeModels = (env.GEMINI_FREE_MODELS || "").split(",").map((v) => v.trim()).filter(Boolean);
  const model = env.GEMINI_MODEL?.trim();
  const geminiAllowed = !!env.GEMINI_API_KEY && !!model && freeModels.includes(model) &&
    env.AI_REQUIRE_FREE_TIER !== "false";
  return {
    order, requireFreeTier: true, allowPaidFallback: false, geminiAllowed,
    geminiReason: geminiAllowed ? undefined : "無料モデル一覧・APIキー・無料枠設定を確認してください",
  };
}
