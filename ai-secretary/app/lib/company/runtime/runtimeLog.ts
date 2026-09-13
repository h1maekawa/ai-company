export type RuntimeErrorClass =
  | "STORE_ERROR" | "LEASE_ERROR" | "MODEL_ERROR" | "TIMEOUT"
  | "SECURITY_BLOCK" | "POLICY_BLOCK" | "REVIEW_FAILURE" | "UNKNOWN";

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    /(authorization|cookie|credential|password|secret|token|api.?key|financial)/i.test(key) ? "[REDACTED]" : redact(entry),
  ]));
};

export function classifyRuntimeError(error: unknown): RuntimeErrorClass {
  const message = error instanceof Error ? error.message : String(error);
  if (/STORE|REDIS|SCHEMA/.test(message)) return "STORE_ERROR";
  if (/LEASE|FENCING|MISSION_BUSY/.test(message)) return "LEASE_ERROR";
  if (/MODEL/.test(message)) return "MODEL_ERROR";
  if (/TIMEOUT|MAX_EXECUTION_TIME/.test(message)) return "TIMEOUT";
  if (/SECURITY/.test(message)) return "SECURITY_BLOCK";
  if (/POLICY|DISABLED|FORBIDDEN/.test(message)) return "POLICY_BLOCK";
  if (/REVIEW/.test(message)) return "REVIEW_FAILURE";
  return "UNKNOWN";
}

export function runtimeLog(input: {
  traceId?: string; missionId?: string; cycleId?: string; event: string;
  result: "success" | "failure" | "skipped"; latencyMs?: number; error?: unknown;
}) {
  console.log(JSON.stringify(redact({
    service: "personal-ai-company", ...input,
    errorClass: input.error ? classifyRuntimeError(input.error) : undefined,
    at: new Date().toISOString(),
  })));
}
