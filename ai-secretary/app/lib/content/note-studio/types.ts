/**
 * Note Chat Studio — ArticleSessionのドメイン型。
 * Timeboxが完全にOFFでも、MATERIAL→...→PUBLISHEDまで単独で成立する。
 */

import type { ContentGoal } from "../../note/research/types";

export const ARTICLE_STAGES = [
  "MATERIAL",
  "ANGLE",
  "INTERVIEW",
  "VIEWPOINT",
  "EXPERIENCE",
  "OUTLINE",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
] as const;

export type ArticleStage = (typeof ARTICLE_STAGES)[number];

export function nextStage(stage: ArticleStage): ArticleStage {
  const index = ARTICLE_STAGES.indexOf(stage);
  return ARTICLE_STAGES[Math.min(index + 1, ARTICLE_STAGES.length - 1)];
}

export function canAdvanceTo(from: ArticleStage, to: ArticleStage): boolean {
  // Stageは基本的に前進のみ。Reviewでの差し戻し（DRAFTへ戻る）だけは例外的に許可する。
  if (from === "REVIEW" && to === "DRAFT") return true;
  return ARTICLE_STAGES.indexOf(to) >= ARTICLE_STAGES.indexOf(from);
}

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
};

export type ArticleAngle = {
  id: string;
  label: string;
  description: string;
  selected: boolean;
};

export type ArticleSession = {
  id: string;
  title: string;

  stage: ArticleStage;
  messages: ChatMessage[];

  materialIds: string[];
  researchIds: string[];
  viewpointIds: string[];
  experienceIds: string[];

  angles?: ArticleAngle[];
  angle?: string;
  outline?: string;
  draftId?: string;

  contentGoal?: ContentGoal;
  offerIds?: string[];
  ctaIds?: string[];

  createdAt: string;
  updatedAt: string;
};

export function createArticleSession(input: { title: string; materialIds?: string[] }): ArticleSession {
  const now = new Date().toISOString();
  return {
    id: `session_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    stage: "MATERIAL",
    messages: [],
    materialIds: input.materialIds ?? [],
    researchIds: [],
    viewpointIds: [],
    experienceIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function appendMessage(session: ArticleSession, role: ChatRole, text: string): ArticleSession {
  const message: ChatMessage = {
    id: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
  return { ...session, messages: [...session.messages, message], updatedAt: new Date().toISOString() };
}
