const INSTRUCTION_LIKE = /(?:ignore (?:all |any )?(?:previous|prior) instructions?|reveal (?:secrets?|tokens?)|run (?:this )?command|change (?:the )?system rules?|system prompt)/gi;
const SECRET_LIKE = /(?:bearer\s+|sk-|gh[opusr]_)[A-Za-z0-9_.-]+/gi;

/** External research is data, never an instruction channel. */
export function untrustedExternalText(value: unknown, max = 1200): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(INSTRUCTION_LIKE, "[UNTRUSTED_INSTRUCTION_REMOVED]")
    .replace(SECRET_LIKE, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const EXTERNAL_CONTENT_CLASSIFICATION = "UNTRUSTED_EXTERNAL_CONTENT" as const;
