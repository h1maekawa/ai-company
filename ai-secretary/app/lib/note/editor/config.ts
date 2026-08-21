export type LocalAiEditorConfig = {
  enabled: boolean;
  provider: "ollama";
  model?: string;
  jobTimeoutSeconds: number;
  fallbackToCloud: false;
};

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/** Local AIは明示的に有効化されない限り、常に停止側に倒す。 */
export function getLocalAiEditorConfig(
  env: NodeJS.ProcessEnv = process.env
): LocalAiEditorConfig {
  const provider = env.MAEMICHI_LOCAL_AI_PROVIDER?.trim() || "ollama";
  if (provider !== "ollama") {
    throw new Error("MAEMICHI_LOCAL_AI_PROVIDER は ollama のみ対応しています");
  }

  if (env.MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD === "true") {
    throw new Error("クラウドAIへの自動フォールバックは許可されていません");
  }

  return {
    enabled: env.MAEMICHI_LOCAL_AI_ENABLED === "true",
    provider: "ollama",
    model: env.MAEMICHI_LOCAL_AI_MODEL?.trim() || undefined,
    jobTimeoutSeconds: boundedInteger(
      env.MAEMICHI_LOCAL_AI_JOB_TIMEOUT_SECONDS,
      300,
      30,
      1800
    ),
    fallbackToCloud: false,
  };
}

