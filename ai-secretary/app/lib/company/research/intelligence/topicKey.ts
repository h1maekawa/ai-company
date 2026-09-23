import type { ResearchChannel, ResearchIntent } from "../types";

/**
 * topic_key = Research Request / Artifact の単位。Source item重複の researchFingerprint とは役割が違う。
 *
 * 巨大な企業マスタやOntologyは作らない。必要最小限:
 *   - ticker alias（会社名・日本語名 → ticker）
 *   - theme alias（表記ゆれ → 1つのslug）
 *   - slugify と channel prefix
 * LLMの生出力slugは揺れるため、ここで必ず正規化する。
 */

/** 会社名・日本語名 → ticker。キーは slug 化済みの値 */
export const COMPANY_ALIASES: Record<string, string> = {
  micron: "MU", "micron-technology": "MU", "マイクロン": "MU", "マイクロンテクノロジー": "MU",
  nvidia: "NVDA", "エヌビディア": "NVDA",
  broadcom: "AVGO", "ブロードコム": "AVGO",
  amd: "AMD", "advanced-micro-devices": "AMD",
  tsmc: "TSM", "taiwan-semiconductor": "TSM",
  asml: "ASML",
  "sk-hynix": "000660.KS", "skハイニックス": "000660.KS",
  vertiv: "VRT", "バーティブ": "VRT",
  eaton: "ETN", "イートン": "ETN",
  microsoft: "MSFT", "マイクロソフト": "MSFT",
  alphabet: "GOOGL", google: "GOOGL",
  "東京エレクトロン": "8035.T", "tokyo-electron": "8035.T",
};

/** theme の表記ゆれ → canonical slug */
export const THEME_ALIASES: Record<string, string> = {
  "agentic-ai": "ai-agent", "ai-agents": "ai-agent", "aiエージェント": "ai-agent", "ai-エージェント": "ai-agent", "エージェント": "ai-agent",
  "power": "power-demand", "電力需要": "power-demand", "電力": "power-demand", "electricity-demand": "power-demand",
  "ai-datacenter": "ai-data-center", "ai-データセンター": "ai-data-center", "aiデータセンター": "ai-data-center", "data-center": "ai-data-center",
  "high-bandwidth-memory": "hbm",
  "半導体": "semiconductor", "semiconductors": "semiconductor", "半導体市場": "semiconductor",
  "ai副業": "ai-side-business", "ai投資": "ai-investing",
};

/** 英数字は小文字、日本語などの文字はそのまま残し、区切りを - にする */
export function slugify(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** 大文字の略語だがtickerとして扱わないもの（テーマ語・一般略語） */
const NOT_TICKERS = new Set(["AI", "AGI", "LLM", "HBM", "GPU", "CPU", "TPU", "DRAM", "NAND", "SNS", "KPI", "IR", "SEC", "EV", "API", "IT", "PC", "US", "USA", "EU", "UK", "OK", "ROI", "ROIC", "FCF", "EPS", "PER", "PBR", "ETF", "IPO", "CEO", "CFO", "TAM", "SAAS", "OSS", "VR", "AR", "XR", "NG", "PR", "DX"]);
const TICKER = /^[A-Za-z]{1,5}$|^\d{4}\.T$|^\d{6}\.KS$/;

export function normalizeCompanyKey(raw: string): string {
  const body = raw.replace(/^company:/i, "").trim();
  if (TICKER.test(body) && !COMPANY_ALIASES[slugify(body)]) return `company:${body.toUpperCase()}`;
  const slug = slugify(body);
  const ticker = COMPANY_ALIASES[slug] ?? COMPANY_ALIASES[slug.replace(/-(inc|corp|corporation|technology|technologies|holdings|co|ltd)$/, "")];
  return `company:${ticker ?? slug}`;
}

export function normalizeThemeSlug(raw: string): string {
  const slug = slugify(raw.replace(/^(theme|platform:[a-z]+):/i, ""));
  return THEME_ALIASES[slug] ?? slug;
}

/** intent と channel から topic_key の prefix を付けて正規化する */
export function normalizeTopicKey(raw: string, intent: ResearchIntent, channel?: ResearchChannel): string {
  if (intent === "company_research") return normalizeCompanyKey(raw);
  if (intent === "platform_research") return `platform:${channel ?? "x"}:${normalizeThemeSlug(raw)}`;
  return `theme:${normalizeThemeSlug(raw)}`;
}

/** LLMを使えないときのための決定的な会社検出（依頼文に既知の会社名・tickerがあるか） */
export function detectCompany(message: string): string | null {
  const text = (message ?? "").normalize("NFKC");
  for (const [alias, ticker] of Object.entries(COMPANY_ALIASES)) {
    const pattern = alias.replace(/-/g, "[\\s-]?");
    if (new RegExp(pattern, "iu").test(text)) return ticker;
  }
  const ticker = [...text.matchAll(/(?<![A-Za-z])([A-Z]{2,5})(?![A-Za-z])/g)].map((match) => match[1]).find((value) => !NOT_TICKERS.has(value));
  return ticker ?? null;
}

export function detectChannel(message: string): ResearchChannel | undefined {
  const text = (message ?? "").toLowerCase();
  if (/tiktok|ティックトック/.test(text)) return "tiktok";
  if (/instagram|インスタ/.test(text)) return "instagram";
  if (/note(?!book)/.test(text)) return "note";
  if (/(?:^|[^a-z])x(?:で|の|[^a-z]|$)|twitter|ツイッター/.test(text)) return "x";
  return undefined;
}
