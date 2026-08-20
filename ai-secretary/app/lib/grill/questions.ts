/**
 * Design Tree 生成 / 追加論点生成 / Shared Understanding 生成。
 *
 * 原則（docs/15 D7）: **生成のみLLM、遷移・判断はコード**。
 * - LLM出力は必ず validate.ts の Quality Gate を通してから採用する。
 * - LLMが失敗した場合は topic別 archetype（archetypes.ts）へフォールバックし、
 *   汎用Treeへ退化させない。fallback使用の有無は quality メタデータに記録する。
 * - never throw（呼び出し側の進行を止めない）。
 */

import { callAI, type AIProvider } from "../ai/client";
import { fallbackTreeForTopic } from "./archetypes";
import { rejectedToPromptBlock, type RejectedAlternative } from "./decisions";
import { validateAndSanitizeTree } from "./validate";
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

function answeredBlock(session: GrillSession): string {
  const answered = session.designTree.filter((n) => n.status === "answered");
  if (answered.length === 0) return "（まだ回答なし）";
  return answered.map((n) => `- ${n.title}: ${n.answer}`).join("\n");
}

/* ─── Design Tree 生成プロンプト ────────────────────────────── */

const TREE_RULES = `
## Design Tree の作り方（厳守）
あなたの仕事は「質問を作ること」ではなく、
**このテーマを完成させるためにユーザーが意思決定しなければならない論点を、依存関係付きのDesign Treeへ分解すること** です。

### テーマ固有であること（最重要）
- 「目的／対象／方法／スケジュール／その他」のような、どのテーマでも同じになる汎用的な分解は禁止。
- そのテーマの専門家なら必ず押さえる論点を、そのテーマの言葉で立てること。
  - 例: 営業の受注率 → 現状KPI / ボトルネック工程 / ヒアリング設計 / 温度感判定 / YES取得 / 提案設計 / クロージング / 時間配分 / 検証方法
  - 例: システム設計 → 目的とユーザー / 必須ユースケース / データモデル / 認証 / 状態管理 / API境界 / エラー処理 / デプロイ / 移行とロールバック

### 質問の作り方
- **Factsを質問にしない**。下に列挙された調査済み情報から分かることは絶対に聞かない。
- **意思決定に変換する**。「どうしますか？」ではなく「AとBのどちらを採るか」の形にする。
- 同じ意味の質問を複数作らない（言い換えただけの重複は禁止）。
- 抽象的すぎる質問、実装・行動に影響しない質問を作らない。
- 子ノードで決める内容を親ノードで重複して聞かない。
- 論点数は原則5〜12。小さいテーマなら3〜5でよい。複雑なら12を超えてもよい。**数合わせのために薄い論点を足さない。**

### 依存関係
- dependsOn には「それが決まらないとこの論点を判断できない」論点のIDだけを書く。
- 循環依存を作らない。前提が無い論点は dependsOn: []。

### 選択肢と推奨
- **原則すべての論点に選択肢を付ける**（2〜4個）。1番目を推奨案にする。
- 選択肢で表現できない論点（固有名詞・数値・自由記述が必要なもの）だけ options を省略してよい。
- recommendation は必須。recommendationReason には「なぜその案か」「どの制約に効くか」「他案と比べて何が良いか」を簡潔に含める。
- 推奨は下の調査済み情報・既存の制約・既に決まったことを踏まえたものにする。一般論を書かない。`;

const TREE_FORMAT = `
## 返答フォーマット（JSONのみ。説明・マークダウン・コードフェンス禁止）
{
  "nodes": [
    {
      "id": "n1",
      "title": "短い論点名（10字前後）",
      "question": "決めるべきことの質問文",
      "dependsOn": [],
      "recommendation": "推奨する回答（選択肢があるならそのlabelと一致させる）",
      "recommendationReason": "なぜその案か・どの制約に効くか・他案と比べて何が良いか",
      "options": [
        {"label": "推奨案", "description": "内容と、それを選ぶと何が良いか"},
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

function normalizeNodes(raw: RawNode[]): GrillNode[] {
  return raw
    .filter((n) => n && typeof n.question === "string")
    .map((n, i) => {
      const id = (typeof n.id === "string" && n.id.trim()) || `n${i + 1}`;
      const deps = Array.isArray(n.dependsOn) ? (n.dependsOn as unknown[]).map(String) : [];
      const rawOptions = Array.isArray(n.options) ? n.options : [];
      const options = rawOptions
        .filter((o) => o && typeof o.label === "string" && o.label.trim())
        .slice(0, 4)
        .map((o, idx) => ({
          index: idx + 1,
          label: String(o.label).trim(),
          description: String(o.description ?? "").trim(),
          isRecommended: idx === 0,
        }));
      return {
        id,
        title: String(n.title ?? `論点${i + 1}`).slice(0, 40),
        question: String(n.question ?? "").trim(),
        dependsOn: deps,
        status: "blocked" as const,
        options: options.length > 0 ? options : undefined,
        recommendation: String(n.recommendation ?? "").trim(),
        recommendationReason: String(n.recommendationReason ?? "").trim(),
        children: [],
      };
    });
}

export interface TreeGenerationResult {
  nodes: GrillNode[];
  source: "llm" | "fallback";
  archetype?: string;
  warnings: string[];
  duplicateQuestionsRemoved: number;
}

export async function generateDesignTree(
  topic: string,
  facts: GrillFact[],
  opts: { provider?: AIProvider } = {}
): Promise<TreeGenerationResult> {
  const warningsAll: string[] = [];
  try {
    const system = `あなたは設計・意思決定を詰める「Grilling（壁打ち）担当」です。${TREE_RULES}${TREE_FORMAT}`;
    const input = `テーマ: ${topic}

## 調査済みの前提情報（これらは質問にしないこと）
${factBlock(facts)}

このテーマ固有の論点だけでDesign Treeを作ってください。`;
    const raw = await callAI(input, system, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<{ nodes?: RawNode[] }>(raw);
    if (parsed?.nodes) {
      const normalized = normalizeNodes(parsed.nodes);
      const gate = validateAndSanitizeTree(normalized);
      warningsAll.push(...gate.warnings);
      if (!gate.rejected && gate.nodes.length >= 3) {
        return {
          nodes: gate.nodes,
          source: "llm",
          warnings: warningsAll,
          duplicateQuestionsRemoved: gate.duplicateQuestionsRemoved,
        };
      }
      warningsAll.push("Quality Gateを通過したノードが少なすぎるためfallbackを使用しました");
    } else {
      warningsAll.push("LLM応答をJSONとして解釈できませんでした");
    }
  } catch (e) {
    warningsAll.push(`Design Tree生成に失敗: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // topic別archetypeへフォールバック（汎用Treeへ退化させない）
  const { nodes, archetype } = fallbackTreeForTopic(topic);
  return {
    nodes,
    source: "fallback",
    archetype,
    warnings: warningsAll,
    duplicateQuestionsRemoved: 0,
  };
}

/* ─── 追加論点（再Grill / 未確定検出） ─────────────────────── */

export async function generateFollowUpNodes(
  session: GrillSession,
  request: string,
  rejected: RejectedAlternative[],
  opts: { provider?: AIProvider } = {}
): Promise<{ nodes: GrillNode[]; warnings: string[]; duplicateQuestionsRemoved: number }> {
  const answeredQuestions = session.designTree
    .filter((n) => n.status === "answered")
    .map((n) => n.question);

  try {
    const system = `あなたは設計・意思決定を詰める「Grilling（壁打ち）担当」です。${TREE_RULES}

### 追加論点を作るときの追加ルール
- 既に決まったことと**矛盾する質問を作らない**（例: additiveで進めると決めた後に「全面置換しますか？」は禁止）。
- 既に決まったこと・却下された案を再度聞かない。
- 追加は2〜4論点に絞る。${TREE_FORMAT}`;

    const input = `テーマ: ${session.topic}

## 調査済みの前提情報（質問にしない）
${factBlock(session.facts)}

## 既に決まったこと（再度聞かない・矛盾させない）
${answeredBlock(session)}

## 既に選ばれなかった案（再提案しない）
${rejectedToPromptBlock(rejected)}

## 追加で詰めたいこと
${request}`;

    const raw = await callAI(input, system, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<{ nodes?: RawNode[] }>(raw);
    if (parsed?.nodes) {
      const gate = validateAndSanitizeTree(
        normalizeNodes(parsed.nodes),
        session.designTree,
        answeredQuestions
      );
      if (!gate.rejected && gate.nodes.length > 0) {
        return {
          nodes: gate.nodes,
          warnings: gate.warnings,
          duplicateQuestionsRemoved: gate.duplicateQuestionsRemoved,
        };
      }
    }
  } catch (e) {
    console.warn("[grill/questions] 追加論点の生成に失敗:", e);
  }

  // フォールバック: ユーザーの要望をそのまま1論点として立てる（重複チェックは通す）
  const manual: GrillNode = {
    id: `f${session.round}-1`,
    title: request.slice(0, 20),
    question: `${request}について、どう決めますか。`,
    dependsOn: [],
    status: "blocked",
    recommendation: "この場で方針を1つに決める",
    recommendationReason: "未確定のまま実装へ進むと手戻りになるため、ここで明示的に決める。",
    children: [],
  };
  const gate = validateAndSanitizeTree([manual], session.designTree, answeredQuestions);
  return {
    nodes: gate.nodes,
    warnings: [...gate.warnings, "追加論点はフォールバックで生成しました"],
    duplicateQuestionsRemoved: gate.duplicateQuestionsRemoved,
  };
}

/* ─── 未確定・矛盾の検出（コードが最終判断する） ──────────────── */

export interface CompletenessCheck {
  /** 追加すべき論点（コード側がTreeへ追加してFrontierを復活させる） */
  proposedNodes: GrillNode[];
  notes: string[];
}

/**
 * Frontierが空になった時点で「本当に決め切れているか」を確認する。
 * LLMはあくまで**追加論点の候補を出すだけ**で、セッションの終了・延長を決めない（判断はコード）。
 */
export async function checkCompleteness(
  session: GrillSession,
  rejected: RejectedAlternative[],
  opts: { provider?: AIProvider } = {}
): Promise<CompletenessCheck> {
  const answeredQuestions = session.designTree
    .filter((n) => n.status === "answered")
    .map((n) => n.question);

  try {
    const system = `あなたは設計レビュアーです。以下のGrilling結果を読み、
**実装に着手すると詰まる重大な未確定事項・回答同士の矛盾**が残っていないか確認してください。

- 重箱の隅をつつかない。実装スコープに影響するものだけを挙げる。
- 既に決まったこと・却下された案を再度聞かない。
- 問題が無ければ nodes を空配列で返す（これが正常な結果です）。
- 追加が必要な場合のみ、2論点までに絞る。${TREE_FORMAT}`;

    const input = `テーマ: ${session.topic}

## 調査済みの前提情報
${factBlock(session.facts)}

## 決まったこと
${answeredBlock(session)}

## 選ばれなかった案
${rejectedToPromptBlock(rejected)}`;

    const raw = await callAI(input, system, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<{ nodes?: RawNode[] }>(raw);
    const rawNodes = parsed?.nodes ?? [];
    if (rawNodes.length === 0) return { proposedNodes: [], notes: [] };

    const gate = validateAndSanitizeTree(
      normalizeNodes(rawNodes).slice(0, 2),
      session.designTree,
      answeredQuestions
    );
    return {
      proposedNodes: gate.rejected ? [] : gate.nodes,
      notes: gate.warnings,
    };
  } catch (e) {
    // 検出に失敗しても進行を止めない（Shared Understandingへ進む）
    return { proposedNodes: [], notes: [`未確定チェックをスキップ: ${e instanceof Error ? e.message : "unknown"}`] };
  }
}

/* ─── Shared Understanding ─────────────────────────────────── */

const SU_PROMPT = `あなたは設計合意をまとめる担当です。
Grillingの結果から、**そのまま実装着手できるレベルの設計合意書**を作ります。

## 厳守
- Sessionで確認されていない内容を勝手に確定事項として書かない。
- 不明・未確認のものは remainingAssumptions に入れる。
- rejectedAlternatives は入力で与えられたものだけを使う（想像で作らない）。理由も与えられたものを尊重する。
- implementationScope は「何を作るか」を実行可能な粒度で書く。
- nonGoals には今回やらないことを明示する（スコープ膨張の防止）。
- acceptanceCriteria は「これが満たされたら完了」と判定できる形で書く。

## 返答フォーマット（JSONのみ）
{
  "summary": "全体像を3-6文で",
  "majorDecisions": [{"decision": "決めたこと", "reason": "理由"}],
  "risks": ["リスク"],
  "remainingAssumptions": ["未確定の前提"],
  "implementationScope": ["今回実装する範囲"],
  "nonGoals": ["今回やらないこと"],
  "constraints": ["守るべき制約"],
  "acceptanceCriteria": ["完了判定基準"]
}`;

function fallbackSharedUnderstanding(
  session: GrillSession,
  rejected: RejectedAlternative[]
): SharedUnderstanding {
  const answered = session.designTree.filter((n) => n.status === "answered");
  const unanswered = session.designTree.filter((n) => n.status !== "answered");
  return {
    summary: `「${session.topic}」について${answered.length}件の論点を確定しました。`,
    majorDecisions: answered.map((n) => ({
      decision: `${n.title}: ${n.answer ?? ""}`,
      reason: n.recommendationReason || "Grillingでの合意",
    })),
    rejectedAlternatives: rejected.map((r) => ({ alternative: r.alternative, reason: r.reason })),
    risks: [],
    remainingAssumptions: unanswered.map((n) => `${n.title} は未確定`),
    implementationScope: [],
    nonGoals: [],
    constraints: [],
    acceptanceCriteria: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateSharedUnderstanding(
  session: GrillSession,
  rejected: RejectedAlternative[],
  opts: { provider?: AIProvider } = {}
): Promise<SharedUnderstanding> {
  try {
    const qa = session.designTree
      .filter((n) => n.status === "answered")
      .map(
        (n) =>
          `- ${n.title}: ${n.question}\n  → 回答: ${n.answer}\n  （AI推奨だった案: ${n.recommendation}）`
      )
      .join("\n");

    const input = `テーマ: ${session.topic}

## 調査済み前提
${factBlock(session.facts)}

## 論点と回答
${qa}

## 選ばれなかった案（これをrejectedAlternativesの根拠にする。捏造しないこと）
${rejectedToPromptBlock(rejected)}`;

    const raw = await callAI(input, SU_PROMPT, { provider: opts.provider ?? "auto" });
    const parsed = tryParseJson<Partial<SharedUnderstanding>>(raw);
    if (parsed && typeof parsed.summary === "string" && parsed.summary.trim()) {
      const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
      return {
        summary: parsed.summary,
        majorDecisions: Array.isArray(parsed.majorDecisions) ? parsed.majorDecisions : [],
        // 却下案はSessionの実データを正とする（LLMの想像で置き換えない）
        rejectedAlternatives: rejected.map((r) => ({ alternative: r.alternative, reason: r.reason })),
        risks: strArr(parsed.risks),
        remainingAssumptions: strArr(parsed.remainingAssumptions),
        implementationScope: strArr(parsed.implementationScope),
        nonGoals: strArr(parsed.nonGoals),
        constraints: strArr(parsed.constraints),
        acceptanceCriteria: strArr(parsed.acceptanceCriteria),
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("[grill/questions] Shared Understanding生成に失敗、フォールバックを使用:", e);
  }
  return fallbackSharedUnderstanding(session, rejected);
}

/** Shared Understanding を Knowledge Capture 用のMarkdownへ整形（D9）。 */
export function sharedUnderstandingToMarkdown(
  session: GrillSession,
  su: SharedUnderstanding
): string {
  const list = (items?: string[]) =>
    items && items.length ? items.map((x) => `- ${x}`).join("\n") : "- （なし）";
  return `# ${session.topic}（Grilling合意）

## Summary

${su.summary}

## Major Decisions
${su.majorDecisions.length ? su.majorDecisions.map((d) => `- **${d.decision}**\n  - 理由: ${d.reason}`).join("\n") : "- （なし）"}

## Rejected Alternatives
${su.rejectedAlternatives.length ? su.rejectedAlternatives.map((r) => `- ${r.alternative}\n  - 理由: ${r.reason}`).join("\n") : "- （なし）"}

## Non-Goals
${list(su.nonGoals)}

## Constraints
${list(su.constraints)}

## Risks
${list(su.risks)}

## Remaining Assumptions
${list(su.remainingAssumptions)}

## Implementation Scope
${list(su.implementationScope)}

## Acceptance Criteria
${list(su.acceptanceCriteria)}
`;
}
