/**
 * Design Tree と Frontier（docs/15 D7）。
 *
 * **遷移計算はコード（決定論的）、生成のみLLM** という原則に従う。
 * Fund Policy Engine（lib/fund/engine.ts）と同じ考え方で、
 * 「どのノードが今答えられるか」はここだけが決める。
 */

import type { GrillNode, GrillSession, GrillSessionSummary } from "./types";

/** dependsOn が全て answered なら frontier、それ以外は blocked。answered はそのまま。 */
export function computeNodeStatuses(nodes: GrillNode[]): GrillNode[] {
  const answered = new Set(nodes.filter((n) => n.status === "answered").map((n) => n.id));
  return nodes.map((n) => {
    if (n.status === "answered") return n;
    const ready = n.dependsOn.every((dep) => answered.has(dep));
    return { ...n, status: ready ? ("frontier" as const) : ("blocked" as const) };
  });
}

/** 現在の Frontier（回答可能なノードID）を返す。 */
export function computeFrontier(nodes: GrillNode[]): string[] {
  return computeNodeStatuses(nodes)
    .filter((n) => n.status === "frontier")
    .map((n) => n.id);
}

/** Frontier が空 = これ以上聞くことがない（Shared Understanding フェーズへ）。 */
export function isFrontierEmpty(nodes: GrillNode[]): boolean {
  return computeFrontier(nodes).length === 0;
}

/**
 * 循環依存の検出。LLMが生成したTreeが壊れていても無限ループしないための保険。
 * 循環に含まれるノードIDを返す（空なら健全）。
 */
export function detectCycles(nodes: GrillNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, "visiting" | "done">();
  const cyclic = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    const st = state.get(id);
    if (st === "done") return;
    if (st === "visiting") {
      // stack 上の該当箇所以降が循環
      const from = stack.indexOf(id);
      stack.slice(from >= 0 ? from : 0).forEach((x) => cyclic.add(x));
      return;
    }
    state.set(id, "visiting");
    const node = byId.get(id);
    if (node) {
      for (const dep of node.dependsOn) {
        if (byId.has(dep)) visit(dep, [...stack, id]);
      }
    }
    state.set(id, "done");
  };

  for (const n of nodes) visit(n.id, []);
  return [...cyclic];
}

/**
 * 存在しない dependsOn を取り除く（LLM生成の揺れに対する正規化）。
 * 循環がある場合は、循環を作っている依存だけを落として前進可能にする。
 */
export function sanitizeTree(nodes: GrillNode[]): GrillNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  let cleaned = nodes.map((n) => ({
    ...n,
    dependsOn: n.dependsOn.filter((d) => ids.has(d) && d !== n.id),
  }));

  const cyclic = detectCycles(cleaned);
  if (cyclic.length > 0) {
    const cyclicSet = new Set(cyclic);
    cleaned = cleaned.map((n) =>
      cyclicSet.has(n.id) ? { ...n, dependsOn: n.dependsOn.filter((d) => !cyclicSet.has(d)) } : n
    );
  }
  return cleaned;
}

/** 回答を適用し、status と frontier を再計算した新しい Session を返す（純関数）。 */
export function applyAnswers(
  session: GrillSession,
  answers: Record<string, string>,
  now: string
): GrillSession {
  const merged = { ...session.answers };
  let tree = session.designTree.map((n) => ({ ...n }));

  for (const [nodeId, answer] of Object.entries(answers)) {
    const text = (answer ?? "").trim();
    if (!text) continue;
    const node = tree.find((n) => n.id === nodeId);
    // frontier のノードにしか回答できない（blocked への先回り回答を防ぐ）
    if (!node) continue;
    const currentStatus = computeNodeStatuses(tree).find((n) => n.id === nodeId)?.status;
    if (currentStatus !== "frontier") continue;

    merged[nodeId] = text;
    node.status = "answered";
    node.answer = text;
    node.answeredAt = now;
  }

  tree = computeNodeStatuses(tree);
  const frontier = tree.filter((n) => n.status === "frontier").map((n) => n.id);

  return {
    ...session,
    designTree: tree,
    answers: merged,
    currentFrontier: frontier,
    round: session.round + 1,
    status: frontier.length === 0 ? "ready_for_confirmation" : "active",
    updatedAt: now,
  };
}

/** 「修正して再Grill」でノードを追加する（Frontierを復活させる・D8）。 */
export function addNodes(session: GrillSession, newNodes: GrillNode[], now: string): GrillSession {
  const tree = computeNodeStatuses(sanitizeTree([...session.designTree, ...newNodes]));
  const frontier = tree.filter((n) => n.status === "frontier").map((n) => n.id);
  return {
    ...session,
    designTree: tree,
    currentFrontier: frontier,
    status: frontier.length === 0 ? "ready_for_confirmation" : "active",
    updatedAt: now,
  };
}

export function toSummary(session: GrillSession): GrillSessionSummary {
  return {
    id: session.id,
    topic: session.topic,
    status: session.status,
    round: session.round,
    answeredCount: session.designTree.filter((n) => n.status === "answered").length,
    totalCount: session.designTree.length,
    updatedAt: session.updatedAt,
  };
}
