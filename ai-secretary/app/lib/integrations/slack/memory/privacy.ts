import { redactSecrets } from "../../../engineering/security";

/** Keep wording intact except credentials and private/temporary URLs. Used BEFORE retry storage too. */
export function redactMemoryText(value: string): { text: string; redacted: boolean } {
  const secrets = Object.entries(process.env).filter(([key]) => /(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|COOKIE)$/.test(key)).map(([, value]) => value ?? "");
  let text = redactSecrets(value, process.env, secrets).replace(/\[REDACTED\]/g, "[REDACTED_SECRET]");
  text = text
    .replace(/\b(?:set-cookie|cookie)\s*[:=][^\r\n]*/gi, "cookie: [REDACTED_SECRET]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[REDACTED_SECRET]")
    .replace(/\b(?:xox[baprs]-[\w-]+|sk-[\w-]{12,}|AIza[\w-]{20,})\b/g, "[REDACTED_SECRET]")
    .replace(/((?:["']?)(?:api[_ -]?key|password|passwd|secret|token|cookie|authorization)(?:["']?)\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\n,;]+)/gi, "$1[REDACTED_SECRET]")
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => /files\.(?:slack\.com|slack-edge\.com)|[?&](?:token|key|signature|sig|x-amz-[^=]+|x-goog-[^=]+)=/i.test(url) ? "[REDACTED_SECRET]" : url);
  return { text, redacted: text !== value };
}

/** Only visible Block Kit text; never serialize action values, private URLs or arbitrary metadata. */
export function readableBlocks(blocks: readonly Record<string, unknown>[] = []): string {
  const texts: string[] = [];
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (Array.isArray(value)) { value.forEach((v) => visit(v, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    if (typeof row.text === "string") texts.push(row.text);
    else visit(row.text, depth + 1);
    for (const key of ["fields", "elements", "accessory", "title"]) visit(row[key], depth + 1);
  }
  blocks.forEach((block) => visit(block, 0));
  return [...new Set(texts)].join("\n\n");
}
