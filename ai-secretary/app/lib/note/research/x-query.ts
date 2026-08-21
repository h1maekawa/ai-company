const TOPIC_EXPANSIONS: Record<string, string[]> = {
  半導体: ["半導体", "NVIDIA", "エヌビディア", "TSMC", "Micron", "マイクロン", "キオクシア", "ラピダス", "AIデータセンター", "メモリー市況", "設備投資", "半導体株"],
  AI: ["生成AI", "ChatGPT", "Claude", "Gemini", "AIエージェント", "個人開発"],
  新NISA: ["新NISA", "NISA", "投資信託", "インデックス投資", "資産形成"],
};

const UNSUPPORTED_CONTROL = /[\u0000-\u001f\u007f]/g;

export function normalizeXQuery(query: string): string {
  const cleaned = query.replace(UNSUPPORTED_CONTROL, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const additions: string[] = [];
  if (!/(^|\s)lang:[a-z]{2}(\s|$)/i.test(cleaned)) additions.push("lang:ja");
  if (!/(^|\s)-?is:retweet(\s|$)/i.test(cleaned)) additions.push("-is:retweet");
  return [cleaned, ...additions].join(" ");
}

export function expandFocusTopic(focusTopic?: string): string[] {
  const topic = focusTopic?.trim();
  if (!topic) return [];
  const direct = TOPIC_EXPANSIONS[topic] ?? [topic];
  return [...new Set(direct)];
}

export function buildXQueries(options: {
  focusTopic?: string;
  xQuery?: string;
  fallbackKeywords?: string[];
  maxQueries?: number;
}): string[] {
  if (options.xQuery?.trim()) return [normalizeXQuery(options.xQuery)];
  const terms = expandFocusTopic(options.focusTopic);
  const source = terms.length > 0 ? terms : options.fallbackKeywords ?? [];
  const maxQueries = Math.max(1, Math.min(options.maxQueries ?? 4, 5));
  const chunks: string[][] = [];
  for (const term of source.slice(0, maxQueries * 3)) {
    const target = chunks[chunks.length - 1];
    if (!target || target.length >= 3) chunks.push([term]);
    else target.push(term);
  }
  return chunks.slice(0, maxQueries).map((chunk) =>
    normalizeXQuery(chunk.length === 1 ? chunk[0] : `(${chunk.map(quoteIfNeeded).join(" OR ")})`)
  );
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

