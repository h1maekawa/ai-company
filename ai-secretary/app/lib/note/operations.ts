import type { Brand } from "./types";
import type {
  ContentPerformance,
  ContentPurpose,
  ExperienceEntry,
  PerformanceWeights,
  SocialDraft,
  WinningTopicPolicy,
  NoteArticleDraft,
} from "./research/types";

export type XScheduleSlot = {
  time: string;
  purpose: Extract<ContentPurpose, "reach" | "trust" | "note-bridge">;
  role: string;
};

/** 初期固定値。呼び出し側から差し替えられるため、将来の時間最適化に対応できる。 */
export const DEFAULT_X_SCHEDULE: readonly XScheduleSlot[] = [
  { time: "07:30", purpose: "reach", role: "認知・インプレッション獲得" },
  { time: "12:15", purpose: "trust", role: "ノウハウ・信頼獲得" },
  { time: "20:30", purpose: "note-bridge", role: "深掘り・note導線" },
];

export function scheduledAtInTokyo(
  date: Date,
  time: string,
  timeZoneOffsetMinutes = 9 * 60
): string {
  const [hours, minutes] = time.split(":").map(Number);
  const local = new Date(date.getTime() + timeZoneOffsetMinutes * 60_000);
  const utc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    hours,
    minutes
  ) - timeZoneOffsetMinutes * 60_000;
  return new Date(utc).toISOString();
}

export type SafetyGateResult = { safe: boolean; reasons: string[] };

export const X_MAX_WEIGHTED_LENGTH = 280;
/** 通常生成で狙う安全マージン込みの上限。採否の絶対上限は280のまま。 */
export const TARGET_X_WEIGHTED_LENGTH = 250;
export const X_LENGTH_REGENERATION_ATTEMPTS = 2;
export const X_URL_WEIGHT = 23;

/**
 * Xのweighted lengthを外部依存なしで算出する。
 * URLはt.coの固定長23、Latin系は1、それ以外（日本語・絵文字等）は2として扱う。
 * 絵文字結合列などはXより保守的に数える場合があるが、上限超過を通さない側へ倒す。
 */
export function xWeightedLength(text: string): number {
  let total = 0;
  let cursor = 0;
  const urlPattern = /https?:\/\/[^\s]+/giu;
  for (const match of text.matchAll(urlPattern)) {
    const index = match.index ?? cursor;
    total += weightedCodePoints(text.slice(cursor, index));
    total += X_URL_WEIGHT;
    cursor = index + match[0].length;
  }
  return total + weightedCodePoints(text.slice(cursor));
}

export type XLengthValidationResult = {
  text: string;
  weightedLength: number;
  retryCount: number;
  withinLimit: boolean;
};

/**
 * AI生成文を既存のweighted length SSOTで検査し、超過時だけ意味を保った再生成を依頼する。
 * slice/truncateはせず、有限回で止める。既存Draftの一括更新には使用しない。
 */
export async function validateGeneratedXText(
  initialText: string,
  regenerate: (text: string, attempt: number) => Promise<string>,
  options: { maxRetries?: number; normalize?: (text: string) => string } = {}
): Promise<XLengthValidationResult> {
  const maxRetries = options.maxRetries ?? X_LENGTH_REGENERATION_ATTEMPTS;
  const normalize = options.normalize ?? ((text: string) => text.trim());
  let text = normalize(initialText);
  let retryCount = 0;

  while (xWeightedLength(text) > X_MAX_WEIGHTED_LENGTH && retryCount < maxRetries) {
    retryCount += 1;
    text = normalize(await regenerate(text, retryCount));
  }

  const weightedLength = xWeightedLength(text);
  return { text, weightedLength, retryCount, withinLimit: weightedLength <= X_MAX_WEIGHTED_LENGTH };
}

function weightedCodePoints(text: string): number {
  let total = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const singleWeight =
      codePoint <= 0x10ff ||
      (codePoint >= 0x2000 && codePoint <= 0x200d) ||
      (codePoint >= 0x2010 && codePoint <= 0x201f) ||
      (codePoint >= 0x2032 && codePoint <= 0x2037);
    total += singleWeight ? 1 : 2;
  }
  return total;
}

const UNSAFE_CLAIMS = [
  /必ず.{0,12}(稼げ|儲か|成功|改善)/,
  /絶対に.{0,12}(稼げ|儲か|成功|改善)/,
  /確実に.{0,12}(稼げ|儲か|成功|改善)/,
  /成果を保証/,
  /元本保証/,
];
const SECRET_MARKERS = [/api[_-]?key/i, /password/i, /secret/i, /bearer\s+[a-z0-9._-]+/i];
const PERSONAL_DATA = [/\b\d{3}-\d{4}-\d{4}\b/, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i];

export function runXSafetyGate(input: {
  draft: SocialDraft;
  brand: Brand;
  experiences: ExperienceEntry[];
}): SafetyGateResult {
  const reasons: string[] = [];
  const text = input.draft.text.trim();
  if (!text) reasons.push("本文が空です");
  if (xWeightedLength(text) > X_MAX_WEIGHTED_LENGTH) {
    reasons.push("Xの文字数上限を超えています。投稿を短くしてください。");
  }
  if (input.draft.failureReason) reasons.push(input.draft.failureReason);
  if ((input.draft.similarityScore ?? 0) >= 0.72) reasons.push("他者または過去投稿との類似度が高すぎます");
  if (UNSAFE_CLAIMS.some((pattern) => pattern.test(text))) reasons.push("成果保証・根拠のない断定を含みます");
  if (SECRET_MARKERS.some((pattern) => pattern.test(text))) reasons.push("機密情報らしき文字列を含みます");
  if (PERSONAL_DATA.some((pattern) => pattern.test(text))) reasons.push("個人情報らしき文字列を含みます");
  for (const expression of input.brand.personality.avoidedExpressions) {
    if (expression && text.includes(expression)) reasons.push(`ブランド禁止表現を含みます: ${expression}`);
  }
  if (/私が|自分が|実際に|試した|やってみた/.test(text)) {
    const verified = input.experiences.some((experience) => experience.verifiedByUser && !experience.sensitive);
    if (!verified) reasons.push("本人確認済みの根拠がない体験表現を含みます");
  }
  return { safe: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function contentPerformanceScore(
  record: ContentPerformance,
  weights: PerformanceWeights
): number {
  const impressions = record.impressions ?? 0;
  const engagements = (record.likes ?? 0) + (record.replies ?? 0) + (record.reposts ?? 0);
  const engagementRate = impressions > 0 ? engagements / impressions : 0;
  const raw =
    Math.log10(impressions + 1) * 10 * weights.impressions +
    Math.log10((record.likes ?? 0) + 1) * 10 * weights.likes +
    Math.log10((record.replies ?? 0) + 1) * 10 * weights.replies +
    Math.log10((record.reposts ?? 0) + 1) * 10 * weights.reposts +
    engagementRate * weights.engagementRate * 10 +
    Math.log10((record.profileVisits ?? 0) + 1) * 10 * weights.profileVisits +
    Math.log10((record.followersGained ?? 0) + 1) * 10 * weights.followersGained +
    Math.log10((record.noteClicks ?? record.linkClicks ?? 0) + 1) * 10 * weights.noteClicks;
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

export type TopicPerformance = {
  topicId: string;
  genreId: string;
  postCount: number;
  averageScore: number;
  strongPostCount: number;
  winning: boolean;
  nextStage: "x-angle" | "x-thread" | "free-note" | "paid-note";
};

export function evaluateWinningTopics(
  records: ContentPerformance[],
  weights: PerformanceWeights,
  policy: WinningTopicPolicy
): TopicPerformance[] {
  const groups = new Map<string, ContentPerformance[]>();
  for (const record of records.filter((item) => item.platform === "x")) {
    const topicId = record.trendClusterId ?? `genre:${record.genreId}`;
    groups.set(topicId, [...(groups.get(topicId) ?? []), record]);
  }
  return [...groups.entries()].map(([topicId, items]) => {
    const genreId = items[0].genreId;
    const scores = items.map((item) => contentPerformanceScore(item, weights));
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const strongPostCount = scores.filter((score) => score >= policy.strongPostScore).length;
    const winning =
      items.length >= policy.minimumPosts &&
      averageScore >= policy.minimumAverageScore &&
      strongPostCount >= policy.minimumStrongPosts;
    const max = Math.max(...scores);
    const nextStage: TopicPerformance["nextStage"] = !winning
      ? "x-angle"
      : items.length < 3
        ? "x-thread"
        : max < 75
          ? "free-note"
          : "paid-note";
    return {
      topicId,
      genreId,
      postCount: items.length,
      averageScore: Math.round(averageScore * 10) / 10,
      strongPostCount,
      winning,
      nextStage,
    };
  }).sort((a, b) => b.averageScore - a.averageScore);
}

export type FunnelMetrics = {
  impressions: number;
  profileVisits: number;
  followersGained: number;
  noteClicks: number;
  freeNoteViews: number;
  paidPurchases: number;
  repeatPurchases: number;
  revenue: number;
};

export function buildFunnel(records: ContentPerformance[]): FunnelMetrics {
  const sum = (pick: (record: ContentPerformance) => number | undefined) =>
    records.reduce((total, record) => total + (pick(record) ?? 0), 0);
  return {
    impressions: sum((r) => r.impressions),
    profileVisits: sum((r) => r.profileVisits),
    followersGained: sum((r) => r.followersGained),
    noteClicks: sum((r) => r.noteClicks ?? r.linkClicks),
    freeNoteViews: sum((r) => r.freeNoteViews ?? r.noteViews),
    paidPurchases: sum((r) => r.paidPurchases ?? r.noteSales),
    repeatPurchases: sum((r) => r.repeatPurchases),
    revenue: sum((r) => r.noteRevenue),
  };
}

export function diagnoseFunnel(metrics: FunnelMetrics): string {
  if (metrics.impressions < 1) return "Theme / Hook: Xの表示を増やす";
  if (metrics.profileVisits / metrics.impressions < 0.01) return "Theme / Hook: プロフィール閲覧率を改善する";
  if (metrics.followersGained / Math.max(1, metrics.profileVisits) < 0.05) return "Branding / Profile / Trust: フォロー転換を改善する";
  if (metrics.noteClicks / Math.max(1, metrics.followersGained) < 0.1) return "CTA / 導線: note遷移を改善する";
  if (metrics.paidPurchases / Math.max(1, metrics.freeNoteViews) < 0.01) return "Free / Paid Boundary: 購入率を改善する";
  if (metrics.repeatPurchases / Math.max(1, metrics.paidPurchases) < 0.1) return "Paid Content Quality: リピート率を改善する";
  return "ファネルは健全です。Winning Topicへの投資を継続する";
}

export function suggestedPriceBand(articleType: "free" | "paid", hasReusableAssets: boolean, depth: number): string {
  if (articleType === "free") return "無料";
  if (depth >= 3 && hasReusableAssets) return "1,000円以上（完全ガイド候補）";
  if (hasReusableAssets) return "300〜500円（Prompt・Template・具体手順）";
  return "100円（初期90日の軽い実践記事）";
}

export function canQueueNotePublication(input: {
  status: string;
  articleType: "free" | "paid" | "affiliate";
  price?: number;
  paywallAfterHeading?: string;
}): { allowed: boolean; reason?: string } {
  if (input.status !== "approved") return { allowed: false, reason: "note実公開には人間の承認が必要です" };
  if (input.articleType === "paid" && (!(input.price && input.price > 0) || !input.paywallAfterHeading)) {
    return { allowed: false, reason: "有料noteは価格と有料境界の人間確認が必要です" };
  }
  return { allowed: true };
}

export type WeeklyNoteCandidate = {
  topicId: string;
  articleType: "free" | "paid";
  candidateKey: string;
  score: number;
};

export function weekKeyTokyo(date = new Date()): string {
  const local = new Date(date.getTime() + 9 * 3_600_000);
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - day + 1);
  return local.toISOString().slice(0, 10);
}

export function nextMetricsSnapshotHour(ageHours: number, completedHours?: number): 1 | 6 | 24 | null {
  for (const target of [1, 6, 24] as const) {
    if (ageHours >= target && (completedHours ?? 0) < target) return target;
  }
  return null;
}

export function planWeeklyNoteCandidates(input: {
  topics: TopicPerformance[];
  existingArticles: NoteArticleDraft[];
  weekKey: string;
  freeTarget?: number;
  paidTarget?: number;
}): WeeklyNoteCandidate[] {
  const freeTarget = input.freeTarget ?? 2;
  const paidTarget = input.paidTarget ?? 1;
  const existingKeys = new Set(input.existingArticles.map((article) => article.autoCandidateKey).filter(Boolean));
  const thisWeek = input.existingArticles.filter((article) => article.autoCandidateWeek === input.weekKey);
  let freeRemaining = Math.max(0, freeTarget - thisWeek.filter((article) => article.articleType === "free").length);
  let paidRemaining = Math.max(0, paidTarget - thisWeek.filter((article) => article.articleType === "paid").length);
  const candidates: WeeklyNoteCandidate[] = [];
  const eligible = input.topics.filter((topic) => topic.winning).sort((a, b) => b.averageScore - a.averageScore);

  for (const topic of eligible) {
    const key = `${input.weekKey}:${topic.topicId}:free`;
    if (freeRemaining > 0 && !existingKeys.has(key) && (topic.nextStage === "free-note" || topic.nextStage === "paid-note")) {
      candidates.push({ topicId: topic.topicId, articleType: "free", candidateKey: key, score: topic.averageScore });
      existingKeys.add(key);
      freeRemaining--;
    }
  }
  for (const topic of eligible) {
    const key = `${input.weekKey}:${topic.topicId}:paid`;
    if (paidRemaining > 0 && !existingKeys.has(key) && topic.nextStage === "paid-note") {
      candidates.push({ topicId: topic.topicId, articleType: "paid", candidateKey: key, score: topic.averageScore });
      existingKeys.add(key);
      paidRemaining--;
    }
  }
  return candidates;
}
