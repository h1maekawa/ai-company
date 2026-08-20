/**
 * Design Tree 生成 と Shared Understanding 生成（docs/15 D1/D8）。
 * **生成のみLLM**。遷移・Frontier計算は designTree.ts（コード）が担当する。
 * LLMが失敗しても決定論的フォールバックで必ず結果を返す（never throw）。
 */

import { callAI, type AIProvider } from "../ai/client";
import type { GrillFact, GrillNode, GrillSession, SharedUnderstanding } from "./types";

function tryParseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

function factBlock(facts: GrillFact[]): string {
  if (facts.length === 0) return "（調査済みの前提情報なし）";
  return facts.map((f) => `- ${f.statement}（出典: ${f.source}）`).join("\n");
}

const TREE_PROMPT = `あなたは設計・意思決定を詰める「Grilling（壁打ち）担当」です。
与えられたテーマを、意思決定が必要な論点へ分解し、依存関係を持つDesign Treeを作ります。

## 厳守
- **調査済みの前提情報（Facts）から分かることは質問にしない**。聞くのは「人が決めること」だけ。
- 各質問には必ずAIの推奨回答と、その理由を付ける。
- できる限り「選ぶだけ」で答えられる選択肢を付ける（1番目を推奨案にする）。
- 依存関係は dependsOn に論点IDで書く。前提が無い論点は dependsOn: []。
- 循環依存を作らない。論点は5〜9個。

## 返答フォーマット（JSONのみ。説明・マークダウン禁止）
{
  "nodes": [
    {
      "id": "n1",
      "title": "短い論点名",
      "question": "決めるべきことの質問文",
      "dependsOn": [],
      "recommendation": "AIの推奨回答",
      "recommendationReason": "なぜそれを推奨するか",
      "options": [
        {"label": "推奨案の見出し", "description": "内容と利点"},
        {"label": "別案", "description": "内容とトレードオフ"},
        {"label": "別案", "description": "内容とトレードオフ"}
      ]
    }
  ]
}`;

type RawNode = {
  id?: string;
  title?: string;
  question?: string;
  dependsOn?: unknown;
  recommendation?: string;
  recommendationReason?: string;
  options?: { label?: string; description?: string }[];
};

/** LLMが落ちても最低限Grillingを開始できる決定論的フォールバックTree。 */
function fallbackTree(topic: string): GrillNode[] {
  const mk = (
    id: string,
    title: string,
    question: string,
    dependsOn: string[],
    recommendation: string,
    reason: string
  ): GrillNode => ({
    id,
    title,
    question,
    dependsOn,
    status: "blocked",
    recommendation,
    recommendationReason: reason,
    children: [],
  });

  return [
    mk("n1", "目的", `「${topic}」で最終的に何を達成したいですか？`, [], "達成条件を1文で定義する", "目的が曖昧なまま進むと後続の判断がすべてブレるため。"),
    mk("n2", "成功基準", "何がどうなれば成功と判断できますか（測れる形で）？", ["n1"], "定量指標を1つに絞る", "指標が複数あると優先順位が決められなくなるため。"),
    mk("n3", "制約", "予算・時間・既存システムなどの制約は何ですか？", ["n1"], "既存構成を壊さない範囲に限定する", "本プロジェクトの原則（Evolution over Revolution）に沿うため。"),
    mk("n4", "選択肢", "取りうる手段の候補は何ですか？", ["n2", "n3"], "最小構成で始めて段階的に拡張する", "初期から作り込むと手戻りコストが大きいため。"),
    mk("n5", "スコープ", "今回やること / やらないことの線引きは？", ["n4"], "今回は最小スコープに限定し、残りは次フェーズへ", "一度に広げると検証が困難になるため。"),
  ];
}

function normalizeNodes(raw: RawNode[]): GrillNode[] {
  return raw
    .filter((n) => n && typeof n.question === "string" && n.question.trim())
    .map((n, i) => {
      const id = (typeof n.id === "string" && n.id.trim()) || `n${i + 1}`;
      const deps = Array.isArray(n.dependsOn) ? (n.dependsOn as unknown[]).map(String) : [];
      const options = Array.isArray(n.options)
        ? n.options
            .filter((o) => o && typeof o.label === "string")
            .slice(0, 4)
            .map((o, idx) => ({
              index: idx + 1,
              label: String(o.label),
              description: String(o.description ?? ""),
              isRecommended: idx === 0,
            }))
        : undefined;
      return {
        id,
        title: String(n.title ?? `論点${i + 1}`).slice(0, 40),
        question: String(n.question),
        dependsOn: deps,
        status: "blocked" as const,
        options: options && options.length > 0 ? options : undefined,
        recommendation: String(n.recommendation ?? "（推奨なし）"),
        recommendationReason: String(n.recommendationReason ?? ""),
        children: [],
      };
    });
}

export async function generateDesignTree(
  topic: string,
  facts: GrillFact[],
  opts: { provider?: AIProvider } = {}
): Promise<GrillNode[]> {
  try {
    const input = `テーマ: ${topic}\n\n## 調査済みの前提情報（これらは質問しないこと）\n${factBlock(facts)}`;
    const raw = await callAI(input, TREE_PROMPT, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<{ nodes?: RawNode[] }>(raw);
    const nodes = parsed?.nodes ? normalizeNodes(parsed.nodes) : [];
    if (nodes.length >= 2) return nodes;
  } catch (e) {
    console.warn("[grill/questions] Design Tree生成に失敗、フォールバックを使用:", e);
  }
  return fallbackTree(topic);
}

/** 「修正して再Grill」用: 既存の合意に対する追加論点を生成する。 */
export async function generateFollowUpNodes(
  session: GrillSession,
  request: string,
  opts: { provider?: AIProvider } = {}
): Promise<GrillNode[]> {
  const existingIds = new Set(session.designTree.map((n) => n.id));
  const prompt = `${TREE_PROMPT}\n\n既に決まっている論点は再度聞かないでください。追加で決めるべき論点だけを2〜4個返してください。`;
  try {
    const decided = session.designTree
      .filter((n) => n.status === "answered")
      .map((n) => `- ${n.title}: ${n.answer}`)
      .join("\n");
    const input = `テーマ: ${session.topic}\n\n## 既に決まったこと\n${decided || "（なし）"}\n\n## 追加で詰めたいこと\n${request}`;
    const raw = await callAI(input, prompt, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<{ nodes?: RawNode[] }>(raw);
    const nodes = parsed?.nodes ? normalizeNodes(parsed.nodes) : [];
    // ID衝突を避ける
    return nodes.map((n, i) => ({
      ...n,
      id: existingIds.has(n.id) ? `f${session.round}-${i + 1}` : n.id,
      dependsOn: n.dependsOn.filter((d) => existingIds.has(d)),
    }));
  } catch (e) {
    console.warn("[grill/questions] 追加論点の生成に失敗:", e);
    return [
      {
        id: `f${session.round}-1`,
        title: "追加論点",
        question: request,
        dependsOn: [],
        status: "blocked",
        recommendation: "（推奨なし）",
        recommendationReason: "",
        children: [],
      },
    ];
  }
}

/* ─── Shared Understanding ─────────────────────────────────────── */

const SU_PROMPT = `あなたは設計合意をまとめる担当です。
これまでのGrilling（論点と回答）から、実装着手前の「Shared Understanding」を作ります。

## 返答フォーマット（JSONのみ）
{
  "summary": "全体像を3-6文で",
  "majorDecisions": [{"decision": "決めたこと", "reason": "理由"}],
  "rejectedAlternatives": [{"alternative": "採用しなかった案", "reason": "理由"}],
  "risks": ["リスク"],
  "remainingAssumptions": ["未確定の前提"],
  "implementationScope": ["今回実装する範囲"]
}`;

function fallbackSharedUnderstanding(session: GrillSession): SharedUnderstanding {
  const answered = session.designTree.filter((n) => n.status === "answered");
  return {
    summary: `「${session.topic}」について${answered.length}件の論点を確定しました。`,
    majorDecisions: answered.map((n) => ({
      decision: `${n.title}: ${n.answer ?? ""}`,
      reason: n.recommendationReason || "（Grillingでの合意）",
    })),
    rejectedAlternatives: [],
    risks: [],
    remainingAssumptions: session.designTree
      .filter((n) => n.status !== "answered")
      .map((n) => `${n.title} は未確定`),
    implementationScope: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateSharedUnderstanding(
  session: GrillSession,
  opts: { provider?: AIProvider } = {}
): Promise<SharedUnderstanding> {
  try {
    const qa = session.designTree
      .filter((n) => n.status === "answered")
      .map((n) => `- ${n.title}: ${n.question}\n  → 回答: ${n.answer}\n  （AI推奨だった案: ${n.recommendation}）`)
      .join("\n");
    const input = `テーマ: ${session.topic}\n\n## 調査済み前提\n${factBlock(session.facts)}\n\n## 論点と回答\n${qa}`;
    const raw = await callAI(input, SU_PROMPT, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<Partial<SharedUnderstanding>>(raw);
    if (parsed && typeof parsed.summary === "string" && parsed.summary.trim()) {
      return {
        summary: parsed.summary,
        majorDecisions: Array.isArray(parsed.majorDecisions) ? parsed.majorDecisions : [],
        rejectedAlternatives: Array.isArray(parsed.rejectedAlternatives) ? parsed.rejectedAlternatives : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
        remainingAssumptions: Array.isArray(parsed.remainingAssumptions)
          ? parsed.remainingAssumptions.map(String)
          : [],
        implementationScope: Array.isArray(parsed.implementationScope)
          ? parsed.implementationScope.map(String)
          : [],
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("[grill/questions] Shared Understanding生成に失敗、フォールバックを使用:", e);
  }
  return fallbackSharedUnderstanding(session);
}

/** Shared Understanding を Knowledge Capture 用のMarkdownへ整形（D9）。 */
export function sharedUnderstandingToMarkdown(session: GrillSession, su: SharedUnderstanding): string {
  const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join("\n") : "- （なし）");
  return `# ${session.topic}（Grilling合意）

${su.summary}

## 決定事項
${su.majorDecisions.length ? su.majorDecisions.map((d) => `- **${d.decision}**\n  - 理由: ${d.reason}`).join("\n") : "- （なし）"}

## 採用しなかった案と理由
${su.rejectedAlternatives.length ? su.rejectedAlternatives.map((r) => `- ${r.alternative}\n  - 理由: ${r.reason}`).join("\n") : "- （なし）"}

## リスク
${list(su.risks)}

## 未確定の前提
${list(su.remainingAssumptions)}

## 実装スコープ
${list(su.implementationScope)}
`;
}
