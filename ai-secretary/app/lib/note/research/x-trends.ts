import { detectGenres } from "./sources/note";

export type XTrendLocation = "japan" | "tokyo";

export type XTrend = {
  name: string;
  postCount?: number;
  genreIds: string[];
  brandFitScore: number;
};

export type XTrendResponse = {
  location: XTrendLocation;
  trends: XTrend[];
  fetchedAt: string;
  skippedReason?: string;
};

type RawTrend = { trend_name?: string; name?: string; tweet_count?: number; post_count?: number };

const WOEID: Record<XTrendLocation, string> = {
  japan: "23424856",
  tokyo: "1118370",
};

export async function fetchXTrends(location: XTrendLocation): Promise<XTrendResponse> {
  const fetchedAt = new Date().toISOString();
  if (process.env.X_API_ENABLED !== "true" || !process.env.X_API_BEARER_TOKEN) {
    return {
      location,
      trends: [],
      fetchedAt,
      skippedReason: "X APIが未設定です。下のテーマ入力から引き続き投稿を作れます。",
    };
  }
  try {
    const response = await fetch(`https://api.x.com/2/trends/by/woeid/${WOEID[location]}`, {
      headers: { Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}` },
      next: { revalidate: 900 },
    });
    if (!response.ok) {
      return { location, trends: [], fetchedAt, skippedReason: `Xトレンドを取得できませんでした（HTTP ${response.status}）` };
    }
    const json = (await response.json()) as { data?: RawTrend[] };
    const trends = (json.data ?? []).slice(0, 30).flatMap((row) => {
      const name = row.trend_name ?? row.name;
      if (!name) return [];
      const genreIds = detectGenres(name);
      return [{
        name,
        postCount: row.tweet_count ?? row.post_count,
        genreIds,
        brandFitScore: Math.min(100, genreIds.length * 30),
      }];
    });
    return { location, trends, fetchedAt };
  } catch {
    return { location, trends: [], fetchedAt, skippedReason: "Xトレンドへ接続できません。手動テーマをご利用ください。" };
  }
}

export type TrendKeyword = {
  keyword: string;
  currentCount: number;
  previousCount?: number;
  growthRate?: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  relatedTopics: string[];
  genreIds: string[];
  brandFitScore: number;
  riskScore: number;
  expiresAt?: string;
};

export type SlangEntry = {
  phrase: string;
  meaning?: string;
  sourceCount: number;
  detectedAt: string;
  expiresAt: string;
  genres: string[];
  approvedByUser: boolean;
  usePolicy: "never" | "suggest-only" | "allowed";
};

export function toSuggestedSlang(keyword: TrendKeyword): SlangEntry {
  return {
    phrase: keyword.keyword,
    sourceCount: keyword.currentCount,
    detectedAt: keyword.firstDetectedAt,
    expiresAt: keyword.expiresAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
    genres: keyword.genreIds,
    approvedByUser: false,
    usePolicy: "suggest-only",
  };
}

export function extractTrendKeywords(
  texts: string[],
  previousCounts: Record<string, number> = {}
): TrendKeyword[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = text.match(/#[\p{L}\p{N}_ー]+|[A-Za-z][A-Za-z0-9._+-]{2,}|[\p{Script=Han}\p{Script=Katakana}ー]{3,}/gu) ?? [];
    for (const token of new Set(tokens.map((value) => value.trim()))) {
      if (token.length > 30) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const now = new Date();
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([keyword, currentCount]) => {
      const previousCount = previousCounts[keyword];
      const genreIds = detectGenres(keyword);
      return {
        keyword,
        currentCount,
        previousCount,
        growthRate: previousCount ? (currentCount - previousCount) / previousCount : undefined,
        firstDetectedAt: now.toISOString(),
        lastDetectedAt: now.toISOString(),
        relatedTopics: [],
        genreIds,
        brandFitScore: Math.min(100, genreIds.length * 30),
        riskScore: 0,
        expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      };
    });
}
