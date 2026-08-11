/**
 * AI Interview — 本人に1〜2問ずつ質問し、考えを引き出す。
 * 「AI一括記事生成」を中心にしない。AIが作れるのは Candidate までで、
 * Viewpoint/Experienceの正式承認は app/lib/content/core/approval.ts の関数だけが行う。
 *
 * すべての関数は callAI 実装を差し替え可能にしてある（テストではAPIキー無しで
 * 決定的なフェイク実装を注入できる）。
 */

import { callAI as defaultCallAI } from "../../ai/client";
import { ArticleSession, ChatMessage } from "./types";

export type AICaller = (message: string, systemPrompt: string) => Promise<string>;

const DEFAULT_DEPS = { callAI: (m: string, s: string) => defaultCallAI(m, s, { provider: "auto" }) };

function historyText(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role === "user" ? "本人" : "AI"}: ${m.text}`).join("\n");
}

const INTERVIEW_SYSTEM_PROMPT = `あなたは編集者として、本人の考えを引き出すインタビューをします。
一度に1〜2問だけ、短く聞いてください。まとめて記事を書かないでください。
本人が話していないことを推測して断定しないでください。
出力は質問文だけ（前置き不要）。`;

/**
 * 会話履歴から次の質問を1つ生成する。Timebox・外部データには依存しない
 * （Material本文と会話だけを根拠にする）。
 */
export async function nextInterviewQuestion(
  session: Pick<ArticleSession, "title" | "messages">,
  materialSummaries: string[] = [],
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<string> {
  const message = [
    `テーマ: ${session.title}`,
    materialSummaries.length ? `材料の要約:\n${materialSummaries.join("\n")}` : "",
    `これまでの会話:\n${historyText(session.messages) || "（まだありません）"}`,
    "次に聞くべき質問を1つだけ返してください。",
  ]
    .filter(Boolean)
    .join("\n\n");
  return (await deps.callAI(message, INTERVIEW_SYSTEM_PROMPT)).trim();
}

const ANGLE_SYSTEM_PROMPT = `会話と材料から、同じ題材に対する複数の切り口（Angle）を提案してください。
本人が話していない体験や数字を作らないでください。
出力はJSONのみ: {"angles":[{"label":"短いラベル","description":"どう切り取るかの説明"}]}
3〜5個返してください。`;

export type AngleSuggestion = { label: string; description: string };

export async function suggestAngles(
  session: Pick<ArticleSession, "title" | "messages">,
  materialSummaries: string[] = [],
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<AngleSuggestion[]> {
  const message = [
    `テーマ: ${session.title}`,
    materialSummaries.length ? `材料:\n${materialSummaries.join("\n")}` : "",
    `会話:\n${historyText(session.messages) || "（まだありません）"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const response = await deps.callAI(message, ANGLE_SYSTEM_PROMPT);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { angles?: AngleSuggestion[] };
    return (parsed.angles ?? []).filter((a) => a.label && a.description);
  } catch (error) {
    console.error("[note-studio/interview] Angle提案に失敗:", error);
    return [];
  }
}

const VIEWPOINT_SYSTEM_PROMPT = `ここまでの会話から、今回の記事の主張（Viewpoint）を1つ推測してください。
本人がまだ確認していない段階なので、断定は禁止です。
出力はJSONのみ: {"title":"短い見出し","opinion":"本人の主張の要約文","reasons":["理由1","理由2"],"uncertainties":["まだ曖昧な点があれば"]}
会話から根拠が読み取れない場合は {"title":"","opinion":"","reasons":[],"uncertainties":[]} を返してください。`;

export type ViewpointDraft = { title: string; opinion: string; reasons: string[]; uncertainties: string[] };

/** 会話からViewpoint候補を抽出する。戻り値は常にcandidate相当（本人承認は別関数） */
export async function extractViewpointCandidate(
  session: Pick<ArticleSession, "title" | "messages">,
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<ViewpointDraft | null> {
  const message = `テーマ: ${session.title}\n\n会話:\n${historyText(session.messages)}`;
  try {
    const response = await deps.callAI(message, VIEWPOINT_SYSTEM_PROMPT);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<ViewpointDraft>;
    if (!parsed.opinion) return null;
    return {
      title: parsed.title ?? session.title,
      opinion: parsed.opinion,
      reasons: parsed.reasons ?? [],
      uncertainties: parsed.uncertainties ?? [],
    };
  } catch (error) {
    console.error("[note-studio/interview] Viewpoint抽出に失敗:", error);
    return null;
  }
}

const EXPERIENCE_SYSTEM_PROMPT = `ここまでの会話の中で、本人が実際に語った体験だけを抜き出してください。
本人が言っていない体験・数字・結果を作らないでください。会話に無ければ何も返さないでください。
出力はJSONのみ: {"title":"短い見出し","whatHappened":"本人が語った内容の要約","whatWasTried":"試したこと（会話内のみ）"}
該当なしなら {"title":"","whatHappened":"","whatWasTried":""} を返してください。`;

export type ExperienceDraft = { title: string; whatHappened: string; whatWasTried: string };

export async function extractExperienceCandidate(
  session: Pick<ArticleSession, "title" | "messages">,
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<ExperienceDraft | null> {
  const message = `テーマ: ${session.title}\n\n会話:\n${historyText(session.messages)}`;
  try {
    const response = await deps.callAI(message, EXPERIENCE_SYSTEM_PROMPT);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<ExperienceDraft>;
    if (!parsed.whatHappened) return null;
    return {
      title: parsed.title ?? session.title,
      whatHappened: parsed.whatHappened,
      whatWasTried: parsed.whatWasTried ?? "",
    };
  } catch (error) {
    console.error("[note-studio/interview] Experience抽出に失敗:", error);
    return null;
  }
}

const OUTLINE_SYSTEM_PROMPT = `確定したAngle・会話・体験・視点から、記事の見出し構成（Outline）を作ってください。
本文は書かず、見出しと各見出しで書く内容の1行要約だけにしてください。
出力はMarkdownの見出しリストのみ。`;

export async function generateOutline(
  session: Pick<ArticleSession, "title" | "angle" | "messages">,
  contextSummaries: string[] = [],
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<string> {
  const message = [
    `テーマ: ${session.title}`,
    session.angle ? `Angle: ${session.angle}` : "",
    contextSummaries.length ? `参照材料:\n${contextSummaries.join("\n")}` : "",
    `会話:\n${historyText(session.messages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return (await deps.callAI(message, OUTLINE_SYSTEM_PROMPT)).trim();
}

const DRAFT_SYSTEM_PROMPT = `承認済みのOutlineに沿って、記事本文の下書きを書いてください。
会話・体験・視点に無い事実・数字・成果を作らないでください。
本文はそのままnoteに公開できる完成形ではなく、本人が編集する前提の「下書き」です。
出力は本文のみ（タイトル行は含めない）。`;

export async function generateDraftBody(
  session: Pick<ArticleSession, "title" | "angle" | "outline" | "messages">,
  contextSummaries: string[] = [],
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<string> {
  const message = [
    `テーマ: ${session.title}`,
    session.angle ? `Angle: ${session.angle}` : "",
    session.outline ? `Outline:\n${session.outline}` : "",
    contextSummaries.length ? `参照材料:\n${contextSummaries.join("\n")}` : "",
    `会話:\n${historyText(session.messages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return (await deps.callAI(message, DRAFT_SYSTEM_PROMPT)).trim();
}
