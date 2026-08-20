/**
 * Grilling Orchestrator（docs/15 D1/D7/D8/D9/D10）。
 *
 *   start → (answer × N) → Frontier空 → Shared Understanding → confirm/revise/cancel
 *
 * 責務境界:
 * - 遷移・Frontier計算は designTree.ts（決定論的・コード）
 * - 生成は questions.ts（LLM。失敗しても決定論的フォールバック）
 * - 永続化は store.ts（Redis=本番の唯一の永続実体）
 * - confirmed 後の長期保存は **Phase4 Capture Flow 1本のみ**（Grilling独自のVault保存はしない）
 */

import { captureKnowledgeCandidate } from "../knowledge/captureService";
import { addNodes, applyAnswers, computeNodeStatuses, sanitizeTree, toSummary } from "./designTree";
import { resolveFacts } from "./facts";
import {
  generateDesignTree,
  generateFollowUpNodes,
  generateSharedUnderstanding,
  sharedUnderstandingToMarkdown,
} from "./questions";
import { grillSessionStore } from "./store";
import type {
  FactProviderId,
  GrillNode,
  GrillSession,
  GrillSessionSummary,
  PersistResult,
} from "./types";
import { VOLATILE_WARNING } from "./types";

const DEFAULT_SECRETARY = "executive-assistant";

function nowIso(): string {
  return new Date().toISOString();
}

function newSessionId(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `gr-${stamp}-${rand}`;
}

/** 保存し、durability を session に反映して返す（D3）。 */
async function persist(session: GrillSession): Promise<{ session: GrillSession; persist: PersistResult }> {
  const result = await grillSessionStore.save(session);
  const withDurability: GrillSession = { ...session, durability: result.durability };
  return { session: withDurability, persist: result };
}

export interface GrillView {
  session: GrillSession;
  /** 今回のRoundで答えるべきノード（Frontier） */
  currentQuestions: GrillNode[];
  persist: PersistResult;
  /** volatile のとき UI に出す警告 */
  durabilityWarning?: string;
  factProvidersUsed?: FactProviderId[];
}

function buildView(
  session: GrillSession,
  persistResult: PersistResult,
  used?: FactProviderId[]
): GrillView {
  const questions = session.designTree.filter((n) => session.currentFrontier.includes(n.id));
  return {
    session,
    currentQuestions: questions,
    persist: persistResult,
    durabilityWarning:
      persistResult.durability === "volatile"
        ? `${VOLATILE_WARNING}${persistResult.warning ? `（${persistResult.warning}）` : ""}`
        : undefined,
    factProvidersUsed: used,
  };
}

/* ─── start ─────────────────────────────────────────────────────── */

export async function startGrilling(input: {
  topic: string;
  secretaryId?: string;
}): Promise<GrillView> {
  const topic = input.topic.trim();
  if (!topic) throw new Error("topic は必須です。");

  // D4: topicに応じて必要なProviderだけ実行
  const { facts, used } = await resolveFacts(topic);

  const rawTree = await generateDesignTree(topic, facts);
  const tree = computeNodeStatuses(sanitizeTree(rawTree));
  const frontier = tree.filter((n) => n.status === "frontier").map((n) => n.id);

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

  // Frontierが空になったら Shared Understanding を生成（AIの判断で途中終了しない・D8）
  if (next.status === "ready_for_confirmation" && !next.sharedUnderstanding) {
    const su = await generateSharedUnderstanding(next);
    next = { ...next, sharedUnderstanding: su };
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

  // D9/D10: confirmed の瞬間のみ Phase4 Capture Flow へ渡す。
  // Grilling独自の正式Knowledge保存・Vault要約保存は行わない（二重保存の禁止）。
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

  const newNodes: GrillNode[] = await generateFollowUpNodes(session, input.request);
  const next = addNodes({ ...session, sharedUnderstanding: undefined }, newNodes, nowIso());
  const saved = await persist(next);
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

/* ─── 取得・一覧 ────────────────────────────────────────────────── */

export async function getGrilling(sessionId: string): Promise<GrillView | null> {
  const session = await grillSessionStore.load(sessionId);
  if (!session) return null;
  return buildView(session, { durability: session.durability, backend: "redis" });
}

export async function listGrillingSessions(): Promise<GrillSessionSummary[]> {
  return grillSessionStore.listActive();
}

export { toSummary };
