import type { ResearchChannel, ResearchDepth, ResearchIntent, ResearchRoutingResult } from "../types";
import { PLAYBOOK_BY_INTENT, RESEARCH_PLAYBOOKS } from "./playbooks";
import { detectChannel, detectCompany, normalizeTopicKey } from "./topicKey";

/**
 * Research & Intelligence の Layer 2 分類。LLM呼び出しは1回だけ（buildClassificationPrompt → classify）。
 * 以降の topicKey正規化・Playbook選択・depth・channel・部門は決定的ロジックで決める。
 */
export const CONFIDENCE_THRESHOLD = 0.7;
const INTENTS: ResearchIntent[] = ["company_research", "theme_research", "platform_research"];
const CHANNELS: ResearchChannel[] = ["x", "note", "instagram", "tiktok"];
const DETAIL = /詳しく|深く|徹底的|詳細に|くわしく|in[-\s]?depth|deep/iu;

export type RawClassification = { intent?: unknown; topicKey?: unknown; topic?: unknown; channel?: unknown; depth?: unknown; confidence?: unknown; assumption?: unknown; userHypothesis?: unknown };

export function buildClassificationPrompt(existingTopicKeys: string[]): string {
  return `あなたは Research & Intelligence の分類器です。ユーザーのResearch依頼を1つのJSONに分類してください。
投資の売買判断・投稿作成は既に別経路へ振り分け済みです。ここに来るのは調査依頼だけです。

intent:
- "company_research": 特定の会社を理解する（例: MUを分析して / マイクロンって何してる会社？）
- "theme_research": 市場・技術・産業テーマ（例: AI Agentが伸びると何が必要？ / HBMのValue Chain / 電力需要）
- "platform_research": SNS / 媒体上のトレンド（X / note / Instagram / TikTok）

topicKey の形式:
- company: "company:<TICKER>"（例 company:MU。tickerが分からなければ会社名）
- theme: "theme:<english-kebab-slug>"（例 theme:ai-agent, theme:power-demand, theme:hbm）
- platform: "platform:<channel>:<english-kebab-slug>"（例 platform:tiktok:ai）
既存の topicKey と同じトピックなら、必ずその既存キーをそのまま使ってください:
${JSON.stringify(existingTopicKeys.slice(0, 50))}

JSONだけを返してください:
{"intent":"...","topicKey":"...","topic":"人間可読な名前","channel":"x|note|instagram|tiktok|null","depth":"quick|standard","confidence":0.0-1.0,"assumption":"解釈の前提を1文","userHypothesis":"ユーザーの仮説があれば1文、無ければnull"}`;
}

export function parseClassification(text: string): RawClassification | null {
  const match = (text ?? "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as RawClassification; } catch { return null; }
}

const str = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * LLM出力（または null）から ResearchRoutingResult を決定的に組み立てる。
 * 自信が低い・不正な出力は、Human Gate に影響しない安全側（theme-research / shared）へ倒す。
 */
export function finalizeRouting(raw: RawClassification | null, message: string): ResearchRoutingResult {
  const confidence = typeof raw?.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0;
  const channel = (CHANNELS.includes(raw?.channel as ResearchChannel) ? raw!.channel as ResearchChannel : undefined) ?? detectChannel(message);
  let intent: ResearchIntent = INTENTS.includes(raw?.intent as ResearchIntent) ? raw!.intent as ResearchIntent : "theme_research";
  let rawTopicKey = str(raw?.topicKey);
  let topic = str(raw?.topic, 120);
  let assumption = str(raw?.assumption, 300);

  // 決定的な補正: 既知の会社名があれば company、SNS名があれば platform（LLMが揺れても同じ結果にする）
  const company = detectCompany(message);
  if (!raw || confidence < CONFIDENCE_THRESHOLD) {
    if (company && intent !== "platform_research") { intent = "company_research"; rawTopicKey = company; topic = topic || company; }
    else if (!(intent === "platform_research" && channel)) intent = "theme_research";
    assumption = assumption || "分類の確信度が低いため、テーマResearchとして安全側で実行";
  }
  if (intent === "platform_research" && !channel) intent = "theme_research";
  if (!rawTopicKey) rawTopicKey = intent === "company_research" && company ? company : topic || message;
  if (!topic) topic = rawTopicKey.replace(/^[a-z]+:(?:[a-z]+:)?/i, "");

  const playbook = PLAYBOOK_BY_INTENT[intent];
  const depth: ResearchDepth = DETAIL.test(message) ? "standard" : RESEARCH_PLAYBOOKS[playbook].defaultDepth;
  return {
    intent,
    topicKey: normalizeTopicKey(rawTopicKey, intent, intent === "platform_research" ? channel : undefined),
    topic,
    primaryDepartment: RESEARCH_PLAYBOOKS[playbook].department,
    playbook,
    ...(intent === "platform_research" ? { channel } : {}),
    depth,
    confidence,
    assumption: assumption || "依頼文どおりに解釈",
    ...(str(raw?.userHypothesis) && raw?.userHypothesis !== "null" ? { userHypothesis: str(raw?.userHypothesis, 300) } : {}),
  };
}

/** 1回のLLM分類 + 決定的補正。LLMが失敗しても例外にせず決定的fallbackで返す */
export async function classifyResearch(message: string, existingTopicKeys: string[], classify: (message: string, systemPrompt: string) => Promise<string>): Promise<ResearchRoutingResult> {
  let raw: RawClassification | null = null;
  try { raw = parseClassification(await classify(message, buildClassificationPrompt(existingTopicKeys))); } catch { raw = null; }
  return finalizeRouting(raw, message);
}
