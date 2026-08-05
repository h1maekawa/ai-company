import { redisSafeGet, redisSafeSet } from "../../utils/redis";

export type EditorialStatus =
  | "researching"
  | "brief-ready"
  | "awaiting-topic-selection"
  | "awaiting-research-refinement"
  | "awaiting-viewpoint"
  | "viewpoint-captured"
  | "awaiting-viewpoint-confirmation"
  | "ready-to-generate"
  | "generating"
  | "draft-ready"
  | "approved"
  | "discarded";

export type EditorialQuestion = {
  id: string;
  category: "interest" | "reason" | "opinion" | "experience" | "uncertainty" | "future" | "investment";
  question: string;
  required: boolean;
};

export type EditorialAnswer = {
  questionId: string;
  rawText: string;
  answeredAt: string;
};

export type AuthorViewpoint = {
  rawText: string;
  mainOpinion?: string;
  reasons: string[];
  questions: string[];
  uncertainties: string[];
  experiences: string[];
  companiesToWatch: string[];
  confirmedByUser: boolean;
  createdAt: string;
};

export type EditorialNewsItem = {
  id: string;
  companyOrTopic: string;
  whatHappened: string;
  whyItMatters: string;
  unknowns: string[];
  discussionQuestion: string;
  sourceResearchItemIds: string[];
};

export type EditorialBrief = {
  id: string;
  topic: string;
  destination: "x" | "note" | "both";
  headline: string;
  overview: string;
  newsItems: EditorialNewsItem[];
  marketStructure?: string[];
  sourceResearchItemIds: string[];
  createdAt: string;
  expiresAt?: string;
};

export type SlackEditorialContext = {
  status: EditorialStatus;
  brief?: EditorialBrief;
  candidateIds: string[];
  selectedCandidateId?: string;
  selectedNewsItemId?: string;
  topic?: string;
  destination?: "x" | "note" | "both";
  questions: EditorialQuestion[];
  currentQuestionIndex: number;
  answers: EditorialAnswer[];
  authorViewpoint?: AuthorViewpoint;
  viewpointConfirmedAt?: string;
  savedAt: string;
  expiresAt: string;
};

const TTL_HOURS = 48;

export function editorialContextKey(channel: string, threadTs?: string): string {
  return `slack:editorial-context:${channel}:${threadTs ?? "root"}`;
}

export function newEditorialContext(
  values: Partial<SlackEditorialContext> = {}
): SlackEditorialContext {
  const now = new Date();
  return {
    status: "researching",
    candidateIds: [],
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_HOURS * 60 * 60 * 1000).toISOString(),
    ...values,
  };
}

export async function loadEditorialContext(
  channel: string,
  threadTs?: string
): Promise<SlackEditorialContext | null> {
  const exact = await redisSafeGet<SlackEditorialContext>(editorialContextKey(channel, threadTs));
  const context = exact || (threadTs
    ? await redisSafeGet<SlackEditorialContext>(editorialContextKey(channel))
    : null);
  if (!context) return null;
  return Date.parse(context.expiresAt) > Date.now() ? context : null;
}

export async function saveEditorialContext(
  channel: string,
  threadTs: string | undefined,
  context: SlackEditorialContext
): Promise<SlackEditorialContext> {
  const next = {
    ...context,
    savedAt: new Date().toISOString(),
  };
  await redisSafeSet(editorialContextKey(channel, threadTs), next);
  return next;
}

export function viewpointText(viewpoint: AuthorViewpoint): string {
  return [
    viewpoint.mainOpinion && `今の考え: ${viewpoint.mainOpinion}`,
    viewpoint.reasons.length > 0 && `理由: ${viewpoint.reasons.join(" / ")}`,
    viewpoint.uncertainties.length > 0 && `まだ分からないこと: ${viewpoint.uncertainties.join(" / ")}`,
    viewpoint.questions.length > 0 && `追いかけたい問い: ${viewpoint.questions.join(" / ")}`,
    viewpoint.experiences.length > 0 && `本人が述べた経験: ${viewpoint.experiences.join(" / ")}`,
  ].filter(Boolean).join("\n");
}
