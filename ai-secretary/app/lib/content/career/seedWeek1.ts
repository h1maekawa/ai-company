import { CAREER_DIVISION_ID, type CareerBatch, type CareerKnowledgeItem, type CareerPost, type CareerSlide, type CareerSource, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";
import { checkCareerFactuality, checkCareerPrivacy } from "./privacy";
import { parseWeek1Csv } from "./week1Csv";

export const WEEK1_START_DATE = "2026-10-26";
export const WEEK1_CSV_VAULT_PATH = "shukatsu_lab_ready_v1/03_week1_posts.csv";

const CAREER_STATE_GROUPS = ["sources", "knowledgeItems", "batches", "posts", "audit"] as const;

/** Allow the initial CSV import only when the state contains audit history and no Career data. */
export function assertInitialWeek1ImportState(value: unknown): asserts value is CareerState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WEEK1_EXISTING_STATE_UNREADABLE");
  const state = value as Record<string, unknown>;
  for (const key of CAREER_STATE_GROUPS) {
    const group = state[key];
    if (!Array.isArray(group) || group.some((item) => !item || typeof item !== "object" || Array.isArray(item) || (item as { divisionId?: unknown }).divisionId !== CAREER_DIVISION_ID)) {
      throw new Error("WEEK1_EXISTING_STATE_UNREADABLE");
    }
  }
  if (["sources", "knowledgeItems", "batches", "posts"].some((key) => (state[key] as unknown[]).length > 0)) {
    throw new Error("WEEK1_EXISTING_CAREER_DATA");
  }
}

export function parseInitialCareerStateJson(raw: string): CareerState {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("WEEK1_EXISTING_STATE_UNREADABLE"); }
  assertInitialWeek1ImportState(value);
  return value;
}

function parseSlide(rawText: string, position: number): CareerSlide {
  const separator = rawText.search(/[：:]/u);
  if (separator >= 0) return { position, headline: rawText.slice(0, separator).trim(), body: rawText.slice(separator + 1).trim() };
  return { position, headline: `Slide ${position}`, body: rawText.trim() };
}

function contentHashForPost(post: CareerPost): string {
  const content = post.platform === "x"
    ? post.body
    : `${post.caption}\n${post.slides.map((slide) => `${slide.headline}\n${slide.body}`).join("\n")}`;
  return careerHash(content);
}

export function seedWeek1Batch(
  state: CareerState,
  csvText: string,
  weekStartDate = WEEK1_START_DATE,
  now = new Date(),
): { batch: CareerBatch; posts: CareerPost[]; source: CareerSource; items: CareerKnowledgeItem[] } {
  const rows = parseWeek1Csv(csvText);
  const at = now.toISOString();
  const sourceDigest = careerHash(csvText);
  const sourceId = careerId("career_source");
  const source: CareerSource = {
    id: sourceId,
    divisionId: CAREER_DIVISION_ID,
    sourceType: "note",
    privateUri: `local:${WEEK1_CSV_VAULT_PATH}`,
    contentHash: sourceDigest,
    language: "ja",
    ingestedAt: at,
    retentionPolicy: "private_until_human_deletion",
    processingStatus: "processed",
    error: null,
  };

  const dayIndexMap: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 };
  const topicMap: Record<string, string> = { 月: "自己分析", 火: "ガクチカ", 水: "自己PR", 木: "志望動機", 金: "面接対策", 土: "逆質問", 日: "週間準備" };
  const items: CareerKnowledgeItem[] = Object.entries(topicMap).map(([day, topic]) => {
    const xRow = rows.find((row) => row.day === day && row.platform === "x");
    const fullBody = xRow?.body ?? `${topic}に関する実践ノウハウです。`;
    const privacy = checkCareerPrivacy(fullBody);
    return {
      id: careerId("career_knowledge"), divisionId: CAREER_DIVISION_ID, sourceId,
      title: `${topic}の実践ノウハウ`, summary: fullBody.slice(0, 100), bodyPrivate: fullBody, topic,
      audience: "就活初心者", evidenceType: "general_advice", privacyRisk: privacy.risk,
      verificationStatus: "unverified", createdAt: at, updatedAt: at,
    };
  });

  const batchId = careerId("career_batch");
  const posts: CareerPost[] = rows.map((row) => {
    const schedule = new Date(`${weekStartDate}T19:00:00+09:00`);
    schedule.setDate(schedule.getDate() + dayIndexMap[row.day]);
    const topic = topicMap[row.day];
    const knowledgeItem = items.find((item) => item.topic === topic)!;
    const slides = row.platform === "instagram" ? row.slides.map((slide, index) => parseSlide(slide, index + 1)) : [];
    const fullContent = row.platform === "x" ? row.body : `${row.caption}\n${slides.map((slide) => `${slide.headline}\n${slide.body}`).join("\n")}`;
    const privacy = checkCareerPrivacy(fullContent);
    return {
      id: careerId("career_post"), divisionId: CAREER_DIVISION_ID, batchId, knowledgeItemId: knowledgeItem.id,
      platform: row.platform, scheduledAt: schedule.toISOString(), title: row.title,
      body: row.platform === "x" ? row.body : "", caption: row.platform === "instagram" ? row.caption : "", slides,
      status: "review", anonymityCheck: privacy.risk, factualityCheck: checkCareerFactuality(fullContent),
      sponsorshipFlag: false, approvedBy: null, approvedAt: null, contentHash: careerHash(fullContent), createdAt: at, updatedAt: at,
    };
  });

  const batch: CareerBatch = {
    id: batchId, divisionId: CAREER_DIVISION_ID, weekStartDate, timezone: "Asia/Tokyo",
    generationModel: "local-template-v1", promptVersion: "career-v1", status: "review", generatedAt: at,
    approvedAt: null, postIds: posts.map((post) => post.id),
  };

  // Fail closed on any overlapping import identity or matching post content. No partial append/overwrite.
  if (state.batches.some((item) => item.divisionId === CAREER_DIVISION_ID && item.weekStartDate === weekStartDate)) {
    throw new Error("WEEK1_BATCH_ALREADY_EXISTS");
  }
  if (state.sources.some((item) => item.divisionId === CAREER_DIVISION_ID && item.contentHash === sourceDigest && item.privateUri === source.privateUri)) {
    throw new Error("WEEK1_SOURCE_ALREADY_IMPORTED");
  }
  const existingIds = new Set(state.posts.map((post) => post.id));
  if (posts.some((post) => existingIds.has(post.id))) throw new Error("WEEK1_DUPLICATE_POST_ID");
  if (posts.some((candidate) => state.posts.some((existing) => {
    if (existing.divisionId !== CAREER_DIVISION_ID || existing.platform !== candidate.platform) return false;
    const sameScheduleDay = existing.scheduledAt.slice(0, 10) === candidate.scheduledAt.slice(0, 10);
    const sameSlot = sameScheduleDay && existing.title === candidate.title;
    const sameContent = existing.contentHash === candidate.contentHash || contentHashForPost(existing) === candidate.contentHash;
    return sameSlot || sameContent;
  }))) {
    throw new Error("WEEK1_DUPLICATE_POST_CONTENT");
  }
  if (items.some((candidate) => state.knowledgeItems.some((existing) => existing.divisionId === CAREER_DIVISION_ID && existing.topic === candidate.topic && existing.title === candidate.title))) {
    throw new Error("WEEK1_DUPLICATE_KNOWLEDGE_ITEM");
  }

  return { batch, posts, source, items };
}

export function importWeek1CsvIntoState(
  state: CareerState,
  csvText: string,
  weekStartDate = WEEK1_START_DATE,
  now = new Date(),
): CareerState {
  assertInitialWeek1ImportState(state);
  const { batch, posts, source, items } = seedWeek1Batch(state, csvText, weekStartDate, now);
  return {
    sources: [source, ...state.sources],
    knowledgeItems: [...items, ...state.knowledgeItems],
    batches: [batch, ...state.batches],
    posts: [...posts, ...state.posts],
    audit: [{
      id: careerId("career_audit"), divisionId: CAREER_DIVISION_ID, action: "week1_posts_seeded",
      at: now.toISOString(), details: { batchId: batch.id, postCount: posts.length },
    }, ...state.audit],
  };
}
