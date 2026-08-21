import type { ResearchItem } from "./types";

export type NotebookLMSource = {
  title: string;
  url: string;
  excerpt: string;
  keyFinding: string;
};

export type NotebookLMImport = {
  topic: string;
  summary?: string;
  sources: NotebookLMSource[];
};

export function notebookLMPrompt(topic: string): string {
  return `「${topic.trim() || "今回扱いたいテーマ"}」についてDeep Researchを行ってください。
note・Xの企画材料として使います。一次情報や信頼できる公開情報を優先し、事実と推測を分けてください。

回答は説明文やMarkdownを付けず、次のJSONだけにしてください。
{
  "topic": "調査テーマ",
  "summary": "調査全体の要約（400文字以内）",
  "sources": [
    {
      "title": "出典タイトル",
      "url": "https://で始まる出典URL",
      "excerpt": "出典で実際に確認できる短い抜粋または忠実な要約",
      "keyFinding": "この出典から分かること。推測は推測と明記"
    }
  ]
}
出典URLが確認できない内容はsourcesへ入れないでください。最低2件、最大20件にしてください。`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safePublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseNotebookLMImport(raw: string): NotebookLMImport {
  if (raw.length > 100_000) throw new Error("NotebookLMの結果が大きすぎます（10万文字以内）");
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("NotebookLMのJSONが見つかりません");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("JSON形式を確認してください。NotebookLMの回答を最初から最後までコピーしてください");
  }
  if (!value || typeof value !== "object") throw new Error("NotebookLMの結果が正しくありません");
  const input = value as { topic?: unknown; summary?: unknown; sources?: unknown };
  const topic = cleanText(input.topic, 200);
  if (!topic) throw new Error("topicがありません");
  if (!Array.isArray(input.sources)) throw new Error("sourcesがありません");
  const sources = input.sources.slice(0, 20).flatMap((item): NotebookLMSource[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const url = safePublicUrl(source.url);
    const title = cleanText(source.title, 300);
    const excerpt = cleanText(source.excerpt, 800);
    const keyFinding = cleanText(source.keyFinding, 800);
    return url && title && excerpt && keyFinding ? [{ title, url, excerpt, keyFinding }] : [];
  });
  if (sources.length === 0) {
    throw new Error("有効な出典がありません。httpsのURL・タイトル・抜粋・要点が必要です");
  }
  return { topic, summary: cleanText(input.summary, 400) || undefined, sources };
}

export function notebookLMResearchItems(input: NotebookLMImport, now = new Date().toISOString()): ResearchItem[] {
  const seen = new Set<string>();
  return input.sources.flatMap((source, index): ResearchItem[] => {
    if (seen.has(source.url)) return [];
    seen.add(source.url);
    return [{
      id: `nlm-${Date.now()}-${index}`,
      platform: "web",
      sourceType: "notebooklm",
      sourceUrl: source.url,
      title: source.title,
      textExcerpt: `${source.keyFinding}\n\n出典確認用: ${source.excerpt}`.slice(0, 1400),
      detectedGenreIds: [],
      fetchedAt: now,
    }];
  });
}
