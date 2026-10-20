import { CAREER_DIVISION_ID, type CareerBatch, type CareerKnowledgeItem, type CareerPost, type CareerSource, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";
import { checkCareerFactuality, checkCareerPrivacy } from "./privacy";

export function ingestCareerText(state: CareerState, input: { text: string; title: string; type?: "transcript" | "note" }, now = new Date()): { source: CareerSource; items: CareerKnowledgeItem[] } {
  const text = input.text.trim();
  if (text.length < 30 || text.length > 300_000) throw new Error("TEXT_LENGTH_INVALID");
  const digest = careerHash(text);
  const existing = state.sources.find((source) => source.contentHash === digest);
  if (existing) throw new Error("DUPLICATE_SOURCE");
  const at = now.toISOString();
  const source: CareerSource = { id: careerId("career_source"), divisionId: CAREER_DIVISION_ID, sourceType: input.type ?? "transcript", privateUri: `local:${sourcePath()}`, contentHash: digest, language: "ja", ingestedAt: at, retentionPolicy: "private_until_human_deletion", processingStatus: "processed", error: null };
  const chunks = text.split(/\n{2,}|(?<=[。！？])\s*(?=【|■|●|\d+[.)])/u).map((chunk) => chunk.trim()).filter((chunk) => chunk.length >= 20);
  if (!chunks.length) chunks.push(text);
  const items = chunks.map((body, index): CareerKnowledgeItem => {
    const privacy = checkCareerPrivacy(body);
    const first = body.split(/[。！？\n]/u)[0].slice(0, 80);
    return { id: careerId("career_knowledge"), divisionId: CAREER_DIVISION_ID, sourceId: source.id, title: `${input.title.trim().slice(0, 60)}${chunks.length > 1 ? ` · ${index + 1}` : ""}`, summary: first, bodyPrivate: body, topic: inferTopic(body), audience: "就活中の学生", evidenceType: "personal_experience", privacyRisk: privacy.risk, verificationStatus: "unverified", createdAt: at, updatedAt: at };
  }).filter((item, index, all) => all.findIndex((candidate) => careerHash(candidate.bodyPrivate) === careerHash(item.bodyPrivate)) === index);
  return { source, items };
}

function sourcePath() { return "memory/personal/career/career-state.json"; }
function inferTopic(text: string) {
  const topics: Array<[RegExp, string]> = [[/面接/u, "面接"], [/ES|エントリーシート/u, "ES"], [/自己分析/u, "自己分析"], [/企業研究/u, "企業研究"], [/インターン/u, "インターン"], [/失敗|落ちた|不合格/u, "失敗からの学び"], [/内定|選考/u, "選考体験"]];
  return topics.find(([pattern]) => pattern.test(text))?.[1] ?? "就活の振り返り";
}

export function generateCareerWeek(state: CareerState, knowledgeItemIds: string[], weekStartDate: string, now = new Date()): { batch: CareerBatch; posts: CareerPost[] } {
  const localNoon = new Date(`${weekStartDate}T12:00:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate) || Number.isNaN(localNoon.getTime()) || localNoon.toISOString().slice(0, 10) !== weekStartDate || localNoon.getUTCDay() !== 1) throw new Error("INVALID_WEEK_START_MUST_BE_MONDAY");
  const selected = knowledgeItemIds.map((id) => state.knowledgeItems.find((item) => item.id === id && item.divisionId === CAREER_DIVISION_ID)).filter((item): item is CareerKnowledgeItem => Boolean(item));
  if (selected.length !== 7 || new Set(selected.map((item) => item.id)).size !== 7) throw new Error("SELECT_SEVEN_UNIQUE_KNOWLEDGE_ITEMS");
  if (selected.some((item) => item.verificationStatus !== "human_verified")) throw new Error("KNOWLEDGE_VERIFICATION_REQUIRED");
  if (selected.some((item) => item.privacyRisk !== "clear")) throw new Error("PRIVACY_REVIEW_REQUIRED");
  if (new Set(selected.map((item) => item.topic.toLocaleLowerCase())).size < 7) throw new Error("TOPIC_DUPLICATES");
  const batchId = careerId("career_batch");
  const at = now.toISOString();
  const posts: CareerPost[] = [];
  for (const [index, item] of selected.entries()) {
    const schedule = new Date(`${weekStartDate}T19:00:00+09:00`);
    schedule.setDate(schedule.getDate() + index);
    const source = item.bodyPrivate.replace(/\s+/gu, " ").trim();
    const distilled = source.length > 220 ? `${source.slice(0, 217)}…` : source;
    const title = `${item.topic}で振り返ること`;
    const xBody = `${title}\n\n当時の経験：${distilled}\n\nこれは個人の体験記録です。選考の一般則ではありません。`;
    const slideBodies = [
      { headline: `${item.topic}で気づいたこと`, body: "就活中に経験したことを、次に活かせる形で整理します。" },
      { headline: "当時の課題", body: distilled },
      { headline: "振り返って見えた理由", body: `この経験から考えたこと：${distilled}` },
      { headline: "次に試せる具体策", body: "自分の状況に合わせて、小さく準備・実践・振り返りを繰り返す。" },
      { headline: "要点", body: `${item.topic}の個人経験として記録。状況により結果は異なります。\n保存して見返してください。` },
    ];
    for (const platform of ["x", "instagram"] as const) {
      const text = platform === "x" ? xBody : slideBodies.map((slide) => `${slide.headline}\n${slide.body}`).join("\n");
      const privacy = checkCareerPrivacy(text);
      const factualityCheck = checkCareerFactuality(text);
      const post: CareerPost = { id: careerId("career_post"), divisionId: CAREER_DIVISION_ID, batchId, knowledgeItemId: item.id, platform, scheduledAt: schedule.toISOString(), title, body: platform === "x" ? xBody : "", caption: platform === "instagram" ? `${title}\n\n個人の体験を振り返り、次に活かすためのメモです。選考の一般則を示すものではありません。\n\n保存して見返してください。` : "", slides: platform === "instagram" ? slideBodies.map((slide, position) => ({ position: position + 1, ...slide })) : [], status: privacy.risk === "clear" && factualityCheck === "clear" ? "draft" : "review", anonymityCheck: privacy.risk, factualityCheck, sponsorshipFlag: false, approvedBy: null, approvedAt: null, contentHash: careerHash(text), createdAt: at, updatedAt: at };
      posts.push(post);
    }
  }
  const batch: CareerBatch = { id: batchId, divisionId: CAREER_DIVISION_ID, weekStartDate, timezone: "Asia/Tokyo", generationModel: "local-template-v1", promptVersion: "career-v1", status: posts.some((post) => post.anonymityCheck !== "clear" || post.factualityCheck !== "clear") ? "review" : "draft", generatedAt: at, approvedAt: null, postIds: posts.map((post) => post.id) };
  return { batch, posts };
}
