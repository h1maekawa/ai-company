/**
 * Grilling Orchestrator（docs/15 D1/D7/D8/D9/D10）。
 *
 *   start → (answer × N) → Frontier空 → 未確定チェック → Shared Understanding → confirm/revise/cancel
 *
 * 責務境界:
 * - 遷移・Frontier計算・表示件数の決定は **コード**（designTree.ts / ここ）
 * - 生成は questions.ts（LLM。失敗時は topic別archetypeへフォールバック）
 * - 永続化は store.ts（Redis=本番の唯一の永続実体）
 * - confirmed 後の長期保存は **Phase4 Capture Flow 1本のみ**
 */

import { captureKnowledgeCandidate } from "../knowledge/captureService";
import {
  addNodes,
  applyAnswers,
  computeFrontierStats,
  computeNodeStatuses,
  sanitizeTree,
  toSummary,
} from "./designTree";
import {
  buildWithdrawnAlternative,
  deriveRejectedAlternatives,
  type RejectedAlternative,
} from "./decisions";
import { resolveFacts } from "./facts";
import {
  checkCompleteness,
  generateDesignTree,
  generateFollowUpNodes,
  generateSharedUnderstanding,
  sharedUnderstandingToMarkdown,
} from "./questions";
import { grillSessionStore } from "./store";
import type {
  FactProviderId,
  GrillFeedback,
  GrillNode,
  GrillQuality,
  GrillSession,
  GrillSessionSummary,
  PersistResult,
} from "./types";
import { MAX_QUESTIONS_PER_ROUND, VOLATILE_WARNING } from "./types";

const DEFAULT_SECRETARY = "executive-assistant";
/** 未確定検出による追加Roundの上限（LLMがセッションを無限に延ばさないための歯止め） */
const MAX_COMPLETENESS_ROUNDS = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function newSessionId(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `gr-${stamp}-${rand}`;
}

async function persist(session: GrillSession): Promise<{ session: GrillSession; persist: PersistResult }> {
  const result = await grillSessionStore.save(session);
  return { session: { ...session, durability: result.durability }, persist: result };
}

/**
 * 今Roundで画面に出す質問を決める（Frontier自体は縮めない）。
 * 依存の浅い（前提に近い）論点から順に、上限件数まで。
 */
export function selectVisibleQuestions(
  session: GrillSession,
  max: number = MAX_QUESTIONS_PER_ROUND
): GrillNode[] {
  const byId = new Map(session.designTree.map((n) => [n.id, n]));
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = byId.get(id);
    if (!node || node.dependsOn.length === 0) return 0;
    return 1 + Math.max(...node.dependsOn.map((d) => depth(d, seen)));
  };
  const order = new Map(session.designTree.map((n, i) => [n.id, i]));

  return session.currentFrontier
    .map((id) => byId.get(id))
    .filter((n): n is GrillNode => Boolean(n))
    .sort((a, b) => depth(a.id) - depth(b.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, max);
}

export interface GrillView {
  session: GrillSession;
  /** 今Roundで表示する質問（上限あり） */
  visibleQuestions: GrillNode[];
  /** 後方互換: visibleQuestions と同じ */
  currentQuestions: GrillNode[];
  /** 現在回答可能な論点の総数（Design Tree上のFrontier全体） */
  frontierCount: number;
  persist: PersistResult;
  durabilityWarning?: string;
  factProvidersUsed?: FactProviderId[];
}

function buildView(
  session: GrillSession,
  persistResult: PersistResult,
  used?: FactProviderId[]
): GrillView {
  const visible = selectVisibleQuestions(session);
  return {
    session,
    visibleQuestions: visible,
    currentQuestions: visible,
    frontierCount: session.currentFrontier.length,
    persist: persistResult,
    durabilityWarning:
      persistResult.durability === "volatile"
        ? `${VOLATILE_WARNING}${persistResult.warning ? `（${persistResult.warning}）` : ""}`
        : undefined,
    factProvidersUsed: used ?? session.quality?.providerIds,
  };
}

/* ─── start ─────────────────────────────────────────────────────── */

export async function startGrilling(input: {
  topic: string;
  secretaryId?: string;
}): Promise<GrillView> {
  const topic = input.topic.trim();
  if (!topic) throw new Error("topic は必須です。");

  const { facts, used } = await resolveFacts(topic);
  const gen = await generateDesignTree(topic, facts);
  const tree = computeNodeStatuses(sanitizeTree(gen.nodes));
  const frontier = tree.filter((n) => n.status === "frontier").map((n) => n.id);

  const quality: GrillQuality = {
    designTreeSource: gen.source,
    fallbackUsed: gen.source === "fallback",
    providerIds: used,
    generatedNodeCount: tree.length,
    duplicateQuestionsRemoved: gen.duplicateQuestionsRemoved,
    validationWarnings: gen.warnings,
    archetype: gen.archetype,
    completenessRounds: 0,
    frontierStats: computeFrontierStats(tree, MAX_QUESTIONS_PER_ROUND),
    generation: gen.generation,
  };

  const session: GrillSession = {
    id: newSessionId(),
    topic,
    status: frontier.length === 0 ? "ready_for_confirmation" : "active",
    designTree: tree,
    answers: {},
    currentFrontier: frontier,
    round: 1,
    facts,
    secretaryId: input.secretaryId || DEFAULT_SECRETARY,
    durability: "volatile",
    quality,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const saved = await persist(session);
  return buildView(saved.session, saved.persist, used);
}

/* ─── answer ────────────────────────────────────────────────────── */

export async function answerGrilling(input: {
  sessionId: string;
  answers: Record<string, string>;
}): Promise<GrillView> {
  const session = await grillSessionStore.load(input.sessionId);
  if (!session) throw new Error(`セッションが見つかりません: ${input.sessionId}`);
  if (session.status === "confirmed" || session.status === "cancelled") {
    throw new Error(`このセッションは ${session.status} のため回答できません。`);
  }

  let next = applyAnswers(session, input.answers, nowIso());

  // Frontierが空 = これ以上聞くことがない → 未確定・矛盾を確認してから合意形成へ
  if (next.status === "ready_for_confirmation" && !next.sharedUnderstanding) {
    const rejected = deriveRejectedAlternatives(next);
    const doneRounds = next.quality?.completenessRounds ?? 0;

    if (doneRounds < MAX_COMPLETENESS_ROUNDS) {
      const check = await checkCompleteness(next, rejected);
      // 追加するかどうかを決めるのはコード側（LLMはあくまで候補を出すだけ）
      if (check.proposedNodes.length > 0) {
        next = addNodes(next, check.proposedNodes, nowIso());
        next = {
          ...next,
          quality: {
            ...(next.quality as GrillQuality),
            completenessRounds: doneRounds + 1,
            validationWarnings: [
              ...(next.quality?.validationWarnings ?? []),
              `未確定検出により${check.proposedNodes.length}論点を追加しました`,
              ...check.notes,
            ],
          },
        };
        const savedMore = await persist(next);
        return buildView(savedMore.session, savedMore.persist);
      }
      next = {
        ...next,
        quality: { ...(next.quality as GrillQuality), completenessRounds: doneRounds + 1 },
      };
    }

    const suResult = await generateSharedUnderstanding(next, rejected);
    next = {
      ...next,
      sharedUnderstanding: suResult.su,
      quality: {
        ...(next.quality as GrillQuality),
        sharedUnderstandingWarnings: suResult.warnings,
        generation: {
          ...(next.quality?.generation ?? {}),
          attempts: suResult.attempts,
        },
      },
    };
  }

  const saved = await persist(next);
  return buildView(saved.session, saved.persist);
}

/* ─── confirm（D8/D9: ここだけが長期保存へ渡す） ─────────────────── */

export interface ConfirmResult extends GrillView {
  captured: { ok: boolean; path?: string; status?: string; error?: string };
}

export async function confirmGrilling(sessionId: string): Promise<ConfirmResult> {
  const session = await grillSessionStore.load(sessionId);
  if (!session) throw new Error(`セッションが見つかりません: ${sessionId}`);
  if (session.status !== "ready_for_confirmation") {
    throw new Error("Shared Understanding が未生成のため承認できません（Frontierが残っています）。");
  }
  const su = session.sharedUnderstanding;
  if (!su) throw new Error("Shared Understanding が存在しません。");

  const confirmed: GrillSession = { ...session, status: "confirmed", updatedAt: nowIso() };
  const saved = await persist(confirmed);

  // confirmed の瞬間のみ Phase4 Capture Flow へ渡す（Grilling独自のVault保存はしない）
  const markdown = sharedUnderstandingToMarkdown(saved.session, su);
  const captured = await captureKnowledgeCandidate({
    content: markdown,
    source: "grilling",
    title: saved.session.topic,
  });

  return {
    ...buildView(saved.session, saved.persist),
    captured: {
      ok: captured.ok,
      path: captured.path,
      status: captured.status,
      error: captured.error,
    },
  };
}

/* ─── revise（修正して再Grill・D8） ─────────────────────────────── */

export async function reviseGrilling(input: {
  sessionId: string;
  request: string;
}): Promise<GrillView> {
  const session = await grillSessionStore.load(input.sessionId);
  if (!session) throw new Error(`セッションが見つかりません: ${input.sessionId}`);
  if (session.status === "confirmed" || session.status === "cancelled") {
    throw new Error(`このセッションは ${session.status} のため再Grillできません。`);
  }

  const rejected = deriveRejectedAlternatives(session);
  const gen = await generateFollowUpNodes(session, input.request, rejected);
  const next = addNodes({ ...session, sharedUnderstanding: undefined }, gen.nodes, nowIso());

  const withQuality: GrillSession = {
    ...next,
    quality: {
      ...(next.quality as GrillQuality),
      generatedNodeCount: next.designTree.length,
      duplicateQuestionsRemoved:
        (next.quality?.duplicateQuestionsRemoved ?? 0) + gen.duplicateQuestionsRemoved,
      validationWarnings: [...(next.quality?.validationWarnings ?? []), ...gen.warnings],
      frontierStats: computeFrontierStats(next.designTree, MAX_QUESTIONS_PER_ROUND),
    },
  };

  const saved = await persist(withQuality);
  return buildView(saved.session, saved.persist);
}

/* ─── cancel ────────────────────────────────────────────────────── */

export async function cancelGrilling(sessionId: string): Promise<GrillView> {
  const session = await grillSessionStore.load(sessionId);
  if (!session) throw new Error(`セッションが見つかりません: ${sessionId}`);
  const next: GrillSession = { ...session, status: "cancelled", updatedAt: nowIso() };
  const saved = await persist(next);
  return buildView(saved.session, saved.persist);
}

/* ─── feedback（品質改善用。Knowledgeには入れない） ───────────────── */

export async function submitGrillFeedback(input: {
  sessionId: string;
  rating: GrillFeedback["rating"];
  comment?: string;
}): Promise<GrillView> {
  const session = await grillSessionStore.load(input.sessionId);
  if (!session) throw new Error(`セッションが見つかりません: ${input.sessionId}`);

  const next: GrillSession = {
    ...session,
    feedback: {
      rating: input.rating,
      comment: input.comment?.trim() || undefined,
      submittedAt: nowIso(),
    },
    updatedAt: nowIso(),
  };
  const saved = await persist(next);
  return buildView(saved.session, saved.persist);
}

/* ─── 取得・一覧 ────────────────────────────────────────────────── */

export async function getGrilling(sessionId: string): Promise<GrillView | null> {
  const session = await grillSessionStore.load(sessionId);
  if (!session) return null;
  return buildView(session, { durability: session.durability, backend: "redis" });
}

export async function listGrillingSessions(): Promise<GrillSessionSummary[]> {
  return grillSessionStore.listActive();
}

export { toSummary, deriveRejectedAlternatives, buildWithdrawnAlternative };
export type { RejectedAlternative };
