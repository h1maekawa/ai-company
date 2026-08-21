import { callAI } from "../../ai/client";
import { validateBrandRules } from "./brandRules";
import type {
  LocalAiReviewJob,
  LocalAiReviewResult,
  ReviewScore,
} from "./types";

function strengthLabel(strength: LocalAiReviewJob["input"]["strength"]) {
  if (strength === "light") return "誤字脱字と明らかな読みにくさだけを整える";
  if (strength === "structure") return "内容を増やさず、結論が伝わる順番へ構成を整理する";
  return "主張と事実を維持したまま、文章全体を読みやすく書き直す";
}

function parseScore(value: unknown): ReviewScore {
  const source = (value ?? {}) as Partial<ReviewScore>;
  const score: ReviewScore = {
    brandFit: Number(source.brandFit),
    usefulness: Number(source.usefulness),
    originality: Number(source.originality),
    readability: Number(source.readability),
    reliability: Number(source.reliability),
    total: Number(source.total),
  };
  return score;
}

export function buildLocalAiReviewPrompt(job: LocalAiReviewJob): {
  message: string;
  systemPrompt: string;
} {
  const rules = validateBrandRules(job.context.brandRules);
  const { input } = job;

  const systemPrompt = `あなたは「まえみち」の文章編集者です。
ユーザー本人が書いた原稿を中心に、内容を創作せず読みやすく整えてください。

## 最優先のブランド規則
${rules}

## 厳守事項
- 元原稿にない体験、収益、投資結果、読書経験、商品使用経験を追加しない
- 数値、URL、固有名詞を推測で追加・変更しない
- 本人確認済み体験は整合性確認にだけ使い、元原稿へ勝手に追加しない
- 事実が不足する場合は本文を補わず questions に確認事項として入れる
- 「残したい表現」は一字一句維持する
- 外部公開を前提にせず、下書きとして返す
- 25点評価は各項目0〜5の整数、totalは5項目の合計にする
- JSON以外を返さない

## 本人確認済み体験（照合専用）
${job.context.verifiedExperiences.length > 0 ? job.context.verifiedExperiences.map((value) => `- ${value}`).join("\n") : "（なし）"}

## 出力JSON
{
  "revisedText": "添削後本文",
  "xText": "X向けが必要な場合だけ",
  "noteText": "note向けが必要な場合だけ",
  "changes": ["主な修正点"],
  "questions": ["確認が必要な点"],
  "score": {
    "brandFit": 0,
    "usefulness": 0,
    "originality": 0,
    "readability": 0,
    "reliability": 0,
    "total": 0
  },
  "preservedExpressions": ["維持した表現"]
}`;

  const message = `【投稿先】${input.destination}
【記事の目的】${input.purpose}
【修正の強さ】${strengthLabel(input.strength)}

【元文章】
${input.originalText}

【残したい表現】
${input.keepExpressions.length > 0 ? input.keepExpressions.map((value) => `- ${value}`).join("\n") : "（なし）"}

【追加の事実情報】
${input.additionalFacts.length > 0 ? input.additionalFacts.map((value) => `- ${value}`).join("\n") : "（なし）"}`;

  return { message, systemPrompt };
}

export function parseLocalAiReviewResult(raw: string): LocalAiReviewResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Local AIの応答がJSONではありません");
  const parsed = JSON.parse(match[0]) as Partial<LocalAiReviewResult>;
  if (!parsed.revisedText || !Array.isArray(parsed.changes) || !Array.isArray(parsed.questions)) {
    throw new Error("Local AIの応答形式が不正です");
  }
  return {
    revisedText: String(parsed.revisedText),
    xText: parsed.xText ? String(parsed.xText) : undefined,
    noteText: parsed.noteText ? String(parsed.noteText) : undefined,
    changes: parsed.changes.map(String),
    questions: parsed.questions.map(String),
    score: parseScore(parsed.score),
    preservedExpressions: Array.isArray(parsed.preservedExpressions)
      ? parsed.preservedExpressions.map(String)
      : [],
  };
}

export async function reviewWithLocalAi(job: LocalAiReviewJob): Promise<LocalAiReviewResult> {
  const prompt = buildLocalAiReviewPrompt(job);
  const raw = await callAI(prompt.message, prompt.systemPrompt, { provider: "ollama" });
  return parseLocalAiReviewResult(raw);
}

