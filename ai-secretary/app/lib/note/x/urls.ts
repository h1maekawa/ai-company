export type ParsedXPostUrl = { handle: string; postId: string; canonicalUrl: string };

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID = /^\d{5,30}$/;

export function normalizeXHandle(value: string): string | null {
  const handle = value.trim().replace(/^@/, "");
  return HANDLE.test(handle) ? handle : null;
}

export function parseXPostUrl(value: string): ParsedXPostUrl | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["x.com", "www.x.com"].includes(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 3 || parts[1] !== "status") return null;
    if (!HANDLE.test(parts[0]) || !POST_ID.test(parts[2])) return null;
    return {
      handle: parts[0],
      postId: parts[2],
      canonicalUrl: `https://x.com/${parts[0]}/status/${parts[2]}`,
    };
  } catch {
    return null;
  }
}

export function xProfileUrl(handle: string): string | null {
  const normalized = normalizeXHandle(handle);
  return normalized ? `https://x.com/${normalized}` : null;
}

export function buildXOEmbedUrl(postUrl: string, theme: "light" | "dark" = "dark"): string {
  const parsed = parseXPostUrl(postUrl);
  if (!parsed) throw new Error("Xの個別ポストURLが不正です");
  const url = new URL("https://publish.x.com/oembed");
  url.searchParams.set("url", parsed.canonicalUrl);
  url.searchParams.set("omit_script", "true");
  url.searchParams.set("dnt", "true");
  url.searchParams.set("theme", theme);
  return url.toString();
}

/** oEmbedの任意HTMLは受け入れず、公式blockquoteに必要な最小markupだけ残す。 */
export function sanitizeXOEmbedHtml(html: string): string {
  if (!html.includes("twitter-tweet") || /<(script|iframe|object|embed|form|input)\b/i.test(html)) {
    throw new Error("X公式として許可できない埋め込みHTMLです");
  }
  const cleaned = html
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<(?!\/?(?:blockquote|p|a)\b)[^>]+>/gi, "");
  if (/<a\b[^>]*href\s*=\s*["'](?!https:\/\/(?:x\.com|twitter\.com)\/)/i.test(cleaned)) {
    throw new Error("X以外のリンクを含む埋め込みHTMLです");
  }
  return cleaned;
}
