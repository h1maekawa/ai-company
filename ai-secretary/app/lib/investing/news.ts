/**
 * 保有銘柄のニュース取得とAI要約。
 *
 * 重要: ニュースは必ず外部フィードから取得した実際の見出しのみを扱う。
 * AIには「取得済みの見出しを要約・分類させる」だけで、記事を創作させない。
 * フィードが取得できない環境では空配列を返し、UIは「未取得」を表示する。
 */

import { callAI } from "../ai/client";
import { getVaultFile, saveVaultFile } from "../vault";
import { NewsItem, Sentiment } from "./types";

const CACHE_PATH = "memory/personal/fund/news-cache.md";
const CACHE_TTL_MINUTES = 60;
const MAX_ITEMS = 12;

/** 銘柄ごとのRSS。ティッカーを埋め込んで使う */
function feedUrl(ticker: string): string {
  return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function pick(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

/** URL全体から安定した短いIDを作る（前方一致による衝突を避ける） */
function hashId(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
  }
  return `n${hash.toString(36)}`;
}

/** RSSのXMLから記事を取り出す（外部パーサ依存を避けるため軽量に自前実装） */
function parseRss(xml: string, ticker: string): NewsItem[] {
  const items: NewsItem[] = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const raw of matches) {
    const title = pick(raw, "title");
    const link = pick(raw, "link");
    if (!title || !link) continue;

    const pubDate = pick(raw, "pubDate");
    const parsedDate = pubDate ? new Date(pubDate) : null;

    items.push({
      id: hashId(link),
      title,
      summary: null,
      source: pick(raw, "source") || new URL(link).hostname.replace(/^www\./, ""),
      url: link,
      publishedAt:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : new Date().toISOString(),
      tickers: [ticker],
      sentiment: null,
    });
  }
  return items;
}

/**
 * ティッカーごとの別名。フィードは一般市況記事も返すため、
 * 見出しに銘柄が実際に出てくるものだけを「保有銘柄のニュース」として扱う。
 */
const TICKER_ALIASES: Record<string, string[]> = {
  NVDA: ["nvidia"],
  MU: ["micron"],
  KO: ["coca-cola", "coca cola"],
  AAPL: ["apple"],
  AMD: ["advanced micro"],
  AVGO: ["broadcom"],
  TSM: ["taiwan semiconductor", "tsmc"],
  ASML: ["asml"],
  MSFT: ["microsoft"],
  GOOGL: ["alphabet", "google"],
  AMZN: ["amazon"],
  TSLA: ["tesla"],
  META: ["meta platforms"],
};

/** 見出しがそのティッカーの記事かどうかを判定する */
function mentionsTicker(title: string, ticker: string): boolean {
  const lower = title.toLowerCase();
  // ティッカーは単語境界で判定（"MU" が "MUCH" に誤ヒットしないように）
  if (new RegExp(`\\b${ticker.toLowerCase()}\\b`).test(lower)) return true;
  return (TICKER_ALIASES[ticker] ?? []).some((alias) => lower.includes(alias));
}

async function fetchForTicker(ticker: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(feedUrl(ticker), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Company/1.0)" },
      next: { revalidate: 1800 },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    // フィードではなくエラーページが返ることがあるので簡易判定
    if (!xml.includes("<item")) return [];
    // 銘柄フィードには一般市況記事も混ざるため、見出しに銘柄が出るものだけ残す
    return parseRss(xml, ticker).filter((item) => mentionsTicker(item.title, ticker));
  } catch (error) {
    console.error(`[investing/news] ${ticker} のフィード取得に失敗:`, error);
    return [];
  }
}

/* ─── AI要約（取得済み見出しのみが対象） ───────────────── */

const SUMMARY_PROMPT = `あなたは投資ニュースの要約AIです。
渡された「実際に配信された見出し」だけを対象に、日本語の要約と市場センチメントを付けてください。

## 厳守事項
- 見出しに書かれていない事実・数字を追加しない（推測禁止）
- 見出しだけでは判断できない場合、sentimentは "neutral" にする
- 要約は見出しの言い換え＋投資家目線の一言に留める
- **番号と見出しの対応を絶対に取り違えないこと**。各項目には、その番号の見出しの
  先頭30文字をそのままコピーした echo を必ず含めること（照合に使います）

## 出力（JSONのみ）
{"items":[{"n":1,"echo":"その番号の見出しの先頭30文字をそのままコピー","summary":"日本語要約（60文字以内）","sentiment":"positive|neutral|negative"}]}`;

/** 照合用に見出しを正規化（記号・空白差を無視して先頭を比べる） */
function normalizeTitle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9぀-ヿ一-龯]/g, "");
}

async function summarize(items: NewsItem[]): Promise<NewsItem[]> {
  if (items.length === 0) return items;

  const targets = items.slice(0, 6);
  const message = targets
    .map((item, index) => `[${index + 1}] ${item.title}（銘柄: ${item.tickers.join(",")}）`)
    .join("\n");

  try {
    const response = await callAI(message, SUMMARY_PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return items;

    const parsed = JSON.parse(match[0]) as {
      items?: { n?: number; echo?: string; summary?: string; sentiment?: string }[];
    };

    const enrichedByIndex = new Map<number, { summary: string; sentiment: Sentiment | null }>();

    for (const entry of parsed.items ?? []) {
      const index = Math.round(Number(entry.n)) - 1;
      const target = targets[index];
      if (!target || !entry.summary) continue;

      // echoが実際の見出しと一致しない場合、対応がずれているので要約を捨てる
      const echo = normalizeTitle(String(entry.echo ?? ""));
      const actual = normalizeTitle(target.title);
      if (!echo || !actual.startsWith(echo.slice(0, 12))) {
        console.warn(
          `[investing/news] 要約の対応がずれたため破棄しました: n=${entry.n} echo="${entry.echo}"`
        );
        continue;
      }

      enrichedByIndex.set(index, {
        summary: String(entry.summary),
        sentiment: (["positive", "neutral", "negative"].includes(String(entry.sentiment))
          ? entry.sentiment
          : null) as Sentiment | null,
      });
    }

    return items.map((item, index) => {
      const enriched = enrichedByIndex.get(index);
      return enriched ? { ...item, ...enriched } : item;
    });
  } catch (error) {
    console.error("[investing/news] AI要約に失敗:", error);
    return items;
  }
}

/* ─── キャッシュ ─────────────────────────────────────── */

type Cache = { fetchedAt: string; items: NewsItem[] };

async function loadCache(): Promise<Cache | null> {
  try {
    const file = await getVaultFile(CACHE_PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return null;
    const cache = JSON.parse(match[1]) as Cache;
    const age = (Date.now() - new Date(cache.fetchedAt).getTime()) / 60000;
    return age < CACHE_TTL_MINUTES ? cache : null;
  } catch {
    return null;
  }
}

async function saveCache(items: NewsItem[]): Promise<void> {
  const cache: Cache = { fetchedAt: new Date().toISOString(), items };
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(CACHE_PATH)).sha;
  } catch {
    // 初回
  }
  const markdown = `---
type: fund_news_cache
fetched: ${cache.fetchedAt}
items: ${items.length}
---

# ニュースキャッシュ

外部フィードから取得した見出しと、そのAI要約を${CACHE_TTL_MINUTES}分だけキャッシュします。

\`\`\`json
${JSON.stringify(cache, null, 2)}
\`\`\`
`;
  try {
    await saveVaultFile(CACHE_PATH, markdown, sha);
  } catch (error) {
    console.error("[investing/news] キャッシュ保存に失敗:", error);
  }
}

/**
 * 保有銘柄のニュースを取得する。
 * 取得できなかった場合は空配列（UI側で「未取得」を表示する）。
 */
export async function loadNews(tickers: string[]): Promise<{
  items: NewsItem[];
  fetchedAt: string | null;
  available: boolean;
}> {
  const cached = await loadCache();
  if (cached) {
    return { items: cached.items, fetchedAt: cached.fetchedAt, available: cached.items.length > 0 };
  }

  // 米国株ティッカー（英字のみ）に限定してフィードを引く
  const targets = tickers.filter((t) => /^[A-Z.]{1,6}$/.test(t)).slice(0, 5);
  const results = await Promise.all(targets.map(fetchForTicker));

  // 同じ記事が複数銘柄のフィードに出るため、URL単位でまとめて銘柄タグを統合する
  const byUrl = new Map<string, NewsItem>();
  for (const item of results.flat()) {
    const existing = byUrl.get(item.url);
    if (existing) {
      for (const ticker of item.tickers) {
        if (!existing.tickers.includes(ticker)) existing.tickers.push(ticker);
      }
    } else {
      byUrl.set(item.url, { ...item, tickers: [...item.tickers] });
    }
  }

  const merged = [...byUrl.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ITEMS);

  if (merged.length === 0) {
    return { items: [], fetchedAt: null, available: false };
  }

  const enriched = await summarize(merged);
  await saveCache(enriched);
  return { items: enriched, fetchedAt: new Date().toISOString(), available: true };
}
