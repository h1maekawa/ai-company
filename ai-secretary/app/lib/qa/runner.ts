/**
 * QAゲートの実行 — 要件9
 *
 * 承認フィード（要件2）と自動承認（要件10）が呼ぶ唯一の入口。
 * ここが返す QaReport の passed が、そのまま自動承認の可否になる。
 *
 * 原則:
 *   - 決定論的（同じ入力なら同じ結果。AIを呼ばない）
 *   - 外部通信はドライランのみ。実投稿は絶対に行わない
 *   - データ不足は pass ではなく skipped。黙って通さない
 */

import type { Brand } from "@/app/lib/note/types";
import type {
  ExperienceEntry,
  NoteArticleDraft,
  ResearchItem,
  SocialDraft,
} from "@/app/lib/note/research/types";
import { runXSafetyGate } from "@/app/lib/note/operations";
import { dryRunPost, isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { checkNoteArticle, checkXDraft } from "./contentChecks";
import { checkForwardLookingClaims, checkNumbersAgainstSources } from "./factChecks";
import { QaCheck, QaReport, buildReport, check, skippedCheck } from "./types";

/** 紐づいたリサーチ抜粋を、数値突合の参照元として取り出す */
export function sourcesForDraft(
  draft: Pick<SocialDraft, "sourceResearchIds">,
  items: ResearchItem[]
): string[] {
  const ids = new Set(draft.sourceResearchIds ?? []);
  return items
    .filter((item) => ids.has(item.id))
    .map((item) => [item.title, item.textExcerpt].filter(Boolean).join(" "));
}

export function sourcesForArticle(
  article: Pick<NoteArticleDraft, "sourceResearchItemIds">,
  items: ResearchItem[]
): string[] {
  const ids = new Set(article.sourceResearchItemIds ?? []);
  return items
    .filter((item) => ids.has(item.id))
    .map((item) => [item.title, item.textExcerpt].filter(Boolean).join(" "));
}

/** 既存のSafety Gateを検査項目として取り込む（結果を承認フィードに出すため） */
function safetyCheck(
  draft: SocialDraft,
  brand: Brand,
  experiences: ExperienceEntry[]
): QaCheck {
  const gate = runXSafetyGate({ draft, brand, experiences });
  return check(
    "safety.gate",
    "Safety/Fact Gate",
    "blocking",
    gate.safe ? null : gate.reasons.join(" / ")
  );
}

export type XDraftQaInput = {
  draft: SocialDraft;
  brand: Brand;
  experiences: ExperienceEntry[];
  researchItems: ResearchItem[];
  /** true なら Buffer へのドライランも実行する（送信はしない） */
  includeDryRun?: boolean;
  now?: Date;
};

export async function runXDraftQa(input: XDraftQaInput): Promise<QaReport> {
  const checks: QaCheck[] = [
    ...checkXDraft(input.draft),
    safetyCheck(input.draft, input.brand, input.experiences),
    checkNumbersAgainstSources({
      text: input.draft.text ?? "",
      sources: sourcesForDraft(input.draft, input.researchItems),
    }),
    checkForwardLookingClaims(input.draft.text ?? ""),
  ];

  if (input.includeDryRun) {
    checks.push(await publishDryRunCheck(input));
  }

  return buildReport(input.draft.id, "x_draft", checks, input.now);
}

/**
 * 投稿フローのドライラン。
 * Buffer未設定の環境（ローカル・CI）では skipped にして、
 * 「設定していないから通った」と誤解されないようにする。
 */
async function publishDryRunCheck(input: XDraftQaInput): Promise<QaCheck> {
  if (!isBufferConfigured()) {
    return skippedCheck(
      "publish.dry_run",
      "投稿フローのドライラン",
      "warning",
      "Bufferが未設定のため検証していません"
    );
  }

  const result = await dryRunPost({
    draft: input.draft,
    safetyContext: { brand: input.brand, experiences: input.experiences },
    mode: "saveToDraft",
  });

  return check(
    "publish.dry_run",
    "投稿フローのドライラン",
    "blocking",
    result.ok ? null : `${result.error.kind}: ${result.error.message}`
  );
}

export type NoteArticleQaInput = {
  article: NoteArticleDraft;
  researchItems: ResearchItem[];
  now?: Date;
};

export function runNoteArticleQa(input: NoteArticleQaInput): QaReport {
  const body = [input.article.freeSection ?? "", input.article.paidSection ?? ""].join("\n");
  const checks: QaCheck[] = [
    ...checkNoteArticle(input.article),
    checkNumbersAgainstSources({
      text: body,
      sources: sourcesForArticle(input.article, input.researchItems),
    }),
    checkForwardLookingClaims(body),
  ];
  return buildReport(input.article.id, "note_article", checks, input.now);
}

/** 承認フィード用の1行サマリー */
export function summarizeReport(report: QaReport): string {
  if (report.passed && report.warnings === 0 && report.skipped === 0) {
    return "自動テスト通過";
  }
  const parts: string[] = [];
  if (report.blockingFailures > 0) parts.push(`要修正${report.blockingFailures}件`);
  if (report.warnings > 0) parts.push(`警告${report.warnings}件`);
  if (report.skipped > 0) parts.push(`未検証${report.skipped}件`);
  return parts.join(" / ");
}
