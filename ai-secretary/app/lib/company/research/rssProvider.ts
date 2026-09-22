import type { ResearchProvider, ResearchProviderItem } from "./types";
import { EXTERNAL_CONTENT_CLASSIFICATION, untrustedExternalText } from "./externalSecurity";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const entity = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const field = (block: string, names: string[]) => { for (const name of names) { const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, "i")); if (match) return entity(match[1].trim()); } return undefined; };
const atomLink = (block: string) => block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];

export function parseRssOrAtom(xml: string, maxItems: number): ResearchProviderItem[] {
  if (!/<(?:rss|feed)\b/i.test(xml)) throw new Error("MALFORMED_FEED");
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.slice(0, maxItems).flatMap((block) => {
    const title = field(block, ["title"]); const link = field(block, ["link", "guid", "id"]) ?? atomLink(block);
    if (!title) return [];
    return [{ title: untrustedExternalText(title, 240), summary: untrustedExternalText(field(block, ["description", "summary", "content"]) ?? title), sourceUrl: link, sourceName: "RSS / Atom", publishedAt: field(block, ["pubDate", "published", "updated"]), reliability: "MEDIUM", tags: [EXTERNAL_CONTENT_CLASSIFICATION] }];
  });
}

export function createRssProvider(feedUrls: string[], options: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch } = {}): ResearchProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS; const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES; const fetchImpl = options.fetchImpl ?? fetch;
  return { id: "rss-atom", sourceType: "rss", async search(query) {
    const settled = await Promise.allSettled(feedUrls.slice(0, query.maxItems).map(async (url) => {
      const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
      if (!response.ok) throw new Error(`RSS_HTTP_${response.status}`);
      const declared = Number(response.headers.get("content-length") ?? 0); if (declared > maxBytes) throw new Error("RSS_BODY_TOO_LARGE");
      const body = await response.text(); if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error("RSS_BODY_TOO_LARGE");
      return parseRssOrAtom(body, query.maxItems);
    }));
    const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`${feedUrls[index]}:${result.reason instanceof Error ? result.reason.message : "RSS_FAILED"}`] : []);
    if (settled.length && settled.every((result) => result.status === "rejected")) throw new Error("RSS_ALL_FEEDS_FAILED");
    return { items: items.slice(0, query.maxItems), warnings, checkedAt: new Date().toISOString() };
  } };
}
