/**
 * Question Quality Gate。
 *
 * LLMが生成したDesign Treeをそのままユーザーへ出さない。
 * コード側で「壊れているもの」を拒否・sanitizeし、「品質が怪しいもの」を警告として記録する。
 *
 * 拒否・修復（sanitize）:
 *   重複NodeID / 存在しないdependsOn / 自己依存 / 循環依存 / 空question / 空recommendation /
 *   同一questionの重複
 * 警告（記録のみ・出題は継続）:
 *   質問文が短すぎる / タイトルと質問が完全重複 / 推奨理由が空 / 選択肢があるのに推奨案が無い
 */

import { detectCycles, sanitizeTree } from "./designTree";
import type { GrillNode } from "./types";

const MIN_QUESTION_LENGTH = 12;

/**
 * dependsOn の上限（Phase5.3）。
 * 実LLM Benchmarkで「関連しているだけの論点」まで dependsOn に入れる傾向が確認され、
 * 10論点で7ラウンド（平均1.4問/Round）まで直列化していた。
 * Frontier計算そのものは変更せず、**依存の付けすぎだけ**をここで機械的に是正する。
 */
const MAX_DEPENDS_ON = 2;

/**
 * 質問の指紋。表記ゆれを吸収して「実質同じ質問」を検出する。
 * Vector DBは使わない（正規化した文字列比較で十分・デバッグ可能）。
 */
export function questionFingerprint(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[。、．，,.:：;；!！?？\-—ー・（）()「」『』\[\]"'`]/g, "")
    // 語尾の丁寧表現の揺れ（〜ですか/〜ますか/〜でしょうか 等）を落として比較する
    .replace(/(でしょうか|ですか|ますか|しますか|ください|でしょう|します|です|ます)$/g, "")
    .replace(/(でしょうか|ですか|ますか|しますか|ください)/g, "")
    .trim();
}

export interface TreeValidationResult {
  nodes: GrillNode[];
  warnings: string[];
  duplicateQuestionsRemoved: number;
  /** 構造が壊れていて採用できない場合 true（呼び出し側はfallbackへ） */
  rejected: boolean;
}

/**
 * Design Tree を検証・修復する。
 * @param nodes LLM等が生成したノード
 * @param existing 既存ノード（追加生成時の重複判定に使う）
 * @param answeredQuestions 既に回答済みの質問文（再質問防止）
 */
export function validateAndSanitizeTree(
  nodes: GrillNode[],
  existing: GrillNode[] = [],
  answeredQuestions: string[] = []
): TreeValidationResult {
  const warnings: string[] = [];
  let duplicateQuestionsRemoved = 0;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodes: [], warnings: ["生成されたノードが空です"], duplicateQuestionsRemoved: 0, rejected: true };
  }

  const seenIds = new Set(existing.map((n) => n.id));
  const seenFingerprints = new Set<string>([
    ...existing.map((n) => questionFingerprint(n.question)),
    ...answeredQuestions.map((q) => questionFingerprint(q)),
  ]);

  const cleaned: GrillNode[] = [];

  for (const raw of nodes) {
    const question = (raw?.question ?? "").trim();
    const recommendation = (raw?.recommendation ?? "").trim();

    // ── 拒否条件 ──
    if (!question) {
      warnings.push(`空のquestionを除外しました (id=${raw?.id ?? "?"})`);
      continue;
    }
    if (!recommendation) {
      warnings.push(`推奨回答が無いノードを除外しました: ${question.slice(0, 24)}`);
      continue;
    }

    const fp = questionFingerprint(question);
    if (seenFingerprints.has(fp)) {
      duplicateQuestionsRemoved++;
      warnings.push(`重複・既回答と同じ質問を除外しました: ${question.slice(0, 24)}`);
      continue;
    }
    seenFingerprints.add(fp);

    // ID重複は捨てずに振り直す（内容は有用なことが多いため）
    let id = (raw.id ?? "").trim() || `n${cleaned.length + 1}`;
    if (seenIds.has(id)) {
      const newId = `${id}-${cleaned.length + 1}`;
      warnings.push(`NodeIDが重複したため振り直しました: ${id} → ${newId}`);
      id = newId;
    }
    seenIds.add(id);

    // ── 警告条件（出題は継続） ──
    if (question.length < MIN_QUESTION_LENGTH) {
      warnings.push(`質問文が短すぎます: ${question}`);
    }
    const title = (raw.title ?? "").trim();
    if (title && questionFingerprint(title) === fp) {
      warnings.push(`タイトルと質問が同一です: ${title}`);
    }
    if (!(raw.recommendationReason ?? "").trim()) {
      warnings.push(`推奨理由が空です: ${title || question.slice(0, 20)}`);
    }
    const options = Array.isArray(raw.options) ? raw.options : undefined;
    if (options && options.length > 0 && !options.some((o) => o.isRecommended)) {
      warnings.push(`選択肢はあるが推奨案が未指定です: ${title || question.slice(0, 20)}`);
    }

    cleaned.push({
      ...raw,
      id,
      title: title || question.slice(0, 20),
      question,
      recommendation,
      recommendationReason: (raw.recommendationReason ?? "").trim(),
      dependsOn: (() => {
        const deps = Array.isArray(raw.dependsOn) ? raw.dependsOn.filter((d) => d !== id) : [];
        if (deps.length > MAX_DEPENDS_ON) {
          warnings.push(
            `依存が多すぎるため${deps.length}→${MAX_DEPENDS_ON}件に削減: ${title || question.slice(0, 16)}`
          );
          return deps.slice(0, MAX_DEPENDS_ON);
        }
        return deps;
      })(),
      status: "blocked",
      children: [],
      options,
    });
  }

  if (cleaned.length === 0) {
    return { nodes: [], warnings: [...warnings, "有効なノードが残りませんでした"], duplicateQuestionsRemoved, rejected: true };
  }

  // 依存関係の修復（存在しない依存・自己依存・循環を除去）
  const all = [...existing, ...cleaned];
  const beforeCycles = detectCycles(all);
  if (beforeCycles.length > 0) {
    warnings.push(`循環依存を検出したため依存を解除しました: ${beforeCycles.join(", ")}`);
  }
  const sanitizedAll = sanitizeTree(all);
  const existingIds = new Set(existing.map((n) => n.id));
  const sanitizedNew = sanitizedAll.filter((n) => !existingIds.has(n.id));

  return { nodes: sanitizedNew, warnings, duplicateQuestionsRemoved, rejected: false };
}

/** 既に回答済みの内容を子ノードでそのまま聞いていないかの簡易チェック。 */
export function findRedundantAgainstAnswers(
  nodes: GrillNode[],
  answeredQuestions: string[]
): string[] {
  const answeredFps = answeredQuestions.map(questionFingerprint);
  return nodes
    .filter((n) => answeredFps.includes(questionFingerprint(n.question)))
    .map((n) => n.id);
}
