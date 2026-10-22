import { CAREER_DIVISION_ID, type CareerBatch, type CareerKnowledgeItem, type CareerPost, type CareerSlide, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";
import { checkCareerFactuality, checkCareerPrivacy } from "./privacy";

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_CAREER_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3:8b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60000);

export type OllamaGenerationResult = {
  xBody: string;
  instagramTitle: string;
  instagramCaption: string;
  slides: Array<{ headline: string; body: string }>;
};

/**
 * ローカルOllama (qwen3:8b) 専用の就活SNS投稿生成器。
 * 外部有料APIへの無断フォールバックは行わない。
 */
export async function callOllamaForCareer(
  prompt: string,
  systemPrompt: string,
  timeoutMs = OLLAMA_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
        format: "json",
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: status ${res.status}`);
    }

    const data = await res.json();
    const content = data?.message?.content;
    if (!content) {
      throw new Error("Ollama returned empty response");
    }
    return content;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms. Fallback to external AI is strictly disabled.`);
    }
    throw new Error(`Ollama connection failed: ${(error as Error).message}. Fallback to external AI is strictly disabled.`);
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `あなたは匿名ブランド「就活攻略ラボ」のSNSコンテンツ作成AIです。
対象：就活初心者（大学生）
発信：実践ノウハウ中心。今日からできる小さな行動を提示。
禁止事項：実名、学校名、企業名、内定保証、誇大表現、虚偽の体験。具体例は「架空の説明例」として記述。

ナレッジ情報から、X用投稿1本とInstagramカルーセル用5枚（表紙、課題、考え方、実践、まとめ）およびキャプションを生成してください。
出力は必ず以下のJSONフォーマットのみを返してください。マークダウンや追加テキストは含めないでください。

{
  "xBody": "X用の本文（120〜200文字程度、ハッシュタグ付き）",
  "instagramTitle": "Instagram投稿のタイトル（20文字以内）",
  "instagramCaption": "Instagramのキャプション（保存CTA、ハッシュタグ付き）",
  "slides": [
    { "headline": "スライド1の短い見出し", "body": "スライド1の本文（1〜3行）" },
    { "headline": "スライド2の短い見出し", "body": "スライド2の本文（1〜3行）" },
    { "headline": "スライド3の短い見出し", "body": "スライド3の本文（1〜3行）" },
    { "headline": "スライド4の短い見出し", "body": "スライド4の本文（1〜3行）" },
    { "headline": "スライド5の短い見出し", "body": "スライド5の本文（1〜3行）" }
  ]
}`;

export async function generateCareerWeekWithOllama(
  state: CareerState,
  knowledgeItemIds: string[],
  weekStartDate: string,
  now = new Date()
): Promise<{ batch: CareerBatch; posts: CareerPost[] }> {
  const localNoon = new Date(`${weekStartDate}T12:00:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate) || Number.isNaN(localNoon.getTime()) || localNoon.toISOString().slice(0, 10) !== weekStartDate || localNoon.getUTCDay() !== 1) {
    throw new Error("INVALID_WEEK_START_MUST_BE_MONDAY");
  }

  const selected = knowledgeItemIds
    .map((id) => state.knowledgeItems.find((item) => item.id === id && item.divisionId === CAREER_DIVISION_ID))
    .filter((item): item is CareerKnowledgeItem => Boolean(item));

  if (selected.length !== 7 || new Set(selected.map((item) => item.id)).size !== 7) {
    throw new Error("SELECT_SEVEN_UNIQUE_KNOWLEDGE_ITEMS");
  }
  if (selected.some((item) => item.verificationStatus !== "human_verified")) {
    throw new Error("KNOWLEDGE_VERIFICATION_REQUIRED");
  }
  if (selected.some((item) => item.privacyRisk !== "clear")) {
    throw new Error("PRIVACY_REVIEW_REQUIRED");
  }
  if (new Set(selected.map((item) => item.topic.toLocaleLowerCase())).size < 7) {
    throw new Error("TOPIC_DUPLICATES");
  }

  const batchId = careerId("career_batch");
  const at = now.toISOString();
  const posts: CareerPost[] = [];

  for (const [index, item] of selected.entries()) {
    const schedule = new Date(`${weekStartDate}T19:00:00+09:00`);
    schedule.setDate(schedule.getDate() + index);

    const userPrompt = `ナレッジテーマ：${item.topic}
タイトル：${item.title}
内容：${item.bodyPrivate}
就活初心者が今日10分で実践できるノウハウに昇華させて作成してください。`;

    const rawJson = await callOllamaForCareer(userPrompt, SYSTEM_PROMPT);
    let parsed: OllamaGenerationResult;
    try {
      parsed = JSON.parse(rawJson);
      if (!parsed.xBody || !parsed.slides || parsed.slides.length !== 5) {
        throw new Error("Invalid structure");
      }
    } catch {
      throw new Error(`OLLAMA_OUTPUT_MALFORMED: Failed to parse generated content for topic ${item.topic}`);
    }

    const xBody = parsed.xBody.trim();
    const xPrivacy = checkCareerPrivacy(xBody);
    const xFactuality = checkCareerFactuality(xBody);

    const xPost: CareerPost = {
      id: careerId("career_post"),
      divisionId: CAREER_DIVISION_ID,
      batchId,
      knowledgeItemId: item.id,
      platform: "x",
      scheduledAt: schedule.toISOString(),
      title: `${item.topic}の実践ノウハウ`,
      body: xBody,
      caption: "",
      slides: [],
      status: xPrivacy.risk === "clear" && xFactuality === "clear" ? "draft" : "review",
      anonymityCheck: xPrivacy.risk,
      factualityCheck: xFactuality,
      sponsorshipFlag: false,
      approvedBy: null,
      approvedAt: null,
      contentHash: careerHash(xBody),
      createdAt: at,
      updatedAt: at,
    };
    posts.push(xPost);

    const igSlides: CareerSlide[] = parsed.slides.map((s, idx) => ({
      position: idx + 1,
      headline: s.headline.slice(0, 40),
      body: s.body.slice(0, 300),
    }));

    const igContent = `${parsed.instagramCaption}\n${igSlides.map((s) => `${s.headline}\n${s.body}`).join("\n")}`;
    const igPrivacy = checkCareerPrivacy(igContent);
    const igFactuality = checkCareerFactuality(igContent);

    const igPost: CareerPost = {
      id: careerId("career_post"),
      divisionId: CAREER_DIVISION_ID,
      batchId,
      knowledgeItemId: item.id,
      platform: "instagram",
      scheduledAt: schedule.toISOString(),
      title: parsed.instagramTitle.slice(0, 40) || `${item.topic}の基本`,
      body: "",
      caption: parsed.instagramCaption,
      slides: igSlides,
      status: igPrivacy.risk === "clear" && igFactuality === "clear" ? "draft" : "review",
      anonymityCheck: igPrivacy.risk,
      factualityCheck: igFactuality,
      sponsorshipFlag: false,
      approvedBy: null,
      approvedAt: null,
      contentHash: careerHash(igContent),
      createdAt: at,
      updatedAt: at,
    };
    posts.push(igPost);
  }

  const batch: CareerBatch = {
    id: batchId,
    divisionId: CAREER_DIVISION_ID,
    weekStartDate,
    timezone: "Asia/Tokyo",
    generationModel: "local-template-v1", // Batch type allows "local-template-v1"
    promptVersion: "career-v1",
    status: posts.some((p) => p.anonymityCheck !== "clear" || p.factualityCheck !== "clear") ? "review" : "draft",
    generatedAt: at,
    approvedAt: null,
    postIds: posts.map((p) => p.id),
  };

  return { batch, posts };
}
