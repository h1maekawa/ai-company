/**
 * リサーチ工程（視点・体験・学び）の自動チェック — 要件9 + 要件10
 *
 * この工程を自動承認にする場合、検査が無いまま素通りするのが最大の危険。
 * 特に体験（ExperienceEntry）は runXSafetyGate が
 * 「本人確認済みの根拠がない体験表現」を止める前提になっているため、
 * ここで本人確認と数値の裏付けを機械的に見る。
 *
 * すべて決定論的。AIには判定させない。
 */

import type { Learning } from "@/app/lib/content/learning/types";
import type {
  ExperienceEntry,
  ViewpointLibraryEntry,
} from "@/app/lib/note/research/types";
import { checkForwardLookingClaims, extractNumbers } from "./factChecks";
import { QaCheck, QaReport, buildReport, check, skippedCheck } from "./types";

/** 数値を含むテキストか（裏付けの要否を判断する） */
function containsNumbers(text: string): boolean {
  return extractNumbers(text).some(
    (n) => !(Number.isInteger(n.value) && Math.abs(n.value) < 10 && !n.unit)
  );
}

/* ─── 視点 ───────────────────────────────────────── */

export function checkViewpoint(entry: ViewpointLibraryEntry): QaCheck[] {
  const opinion = entry.opinion ?? "";

  return [
    check(
      "viewpoint.required",
      "必須項目が揃っている",
      "blocking",
      [!entry.title && "title", !entry.topic && "topic", !opinion.trim() && "opinion"]
        .filter(Boolean).length > 0
        ? `未設定: ${[!entry.title && "title", !entry.topic && "topic", !opinion.trim() && "opinion"]
            .filter(Boolean)
            .join(", ")}`
        : null
    ),
    check(
      "viewpoint.reasons",
      "根拠が書かれている",
      "blocking",
      (entry.reasons?.length ?? 0) === 0 ? "reasons が空です" : null
    ),
    // 断定を避ける設計なので、不確実性が明示されているかを見る
    check(
      "viewpoint.uncertainties",
      "不確実な点が明示されている",
      "warning",
      (entry.uncertainties?.length ?? 0) === 0 ? "uncertainties が空です" : null
    ),
    checkForwardLookingClaims(opinion),
    check(
      "viewpoint.numbers_need_source",
      "数値を含む意見には出典がある",
      "blocking",
      containsNumbers(opinion) && (entry.sourceDraftIds?.length ?? 0) === 0 && !entry.sourceBriefId
        ? "数値を含むが、出典（sourceBriefId / sourceDraftIds）がありません"
        : null
    ),
  ];
}

/* ─── 体験 ───────────────────────────────────────── */

export function checkExperience(entry: ExperienceEntry): QaCheck[] {
  const body = [entry.summary, entry.whatHappened, entry.whatWasTried]
    .filter(Boolean)
    .join("\n");
  const facts = (entry.reusableFacts ?? []).join("\n");

  return [
    check(
      "experience.required",
      "必須項目が揃っている",
      "blocking",
      !entry.title || !entry.whatHappened?.trim()
        ? "title / whatHappened が未設定です"
        : null
    ),
    // 機微な体験は自動で流さない。人が見る
    check(
      "experience.sensitive",
      "機微な内容ではない",
      "blocking",
      entry.sensitive ? "機微な体験としてマークされています" : null
    ),
    /*
     * runXSafetyGate は「本人確認済みの根拠がない体験表現」を止める。
     * 体験を自動承認してしまうと、その前提（verifiedByUser）が
     * 人の確認を経ずに立つことになるため、ここで必ず止める。
     */
    check(
      "experience.verified",
      "本人が確認している",
      "blocking",
      entry.verifiedByUser ? null : "本人未確認の体験です（AIの推測のまま承認できません）"
    ),
    check(
      "experience.numbers_need_evidence",
      "数値を含む事実に裏付けがある",
      "blocking",
      containsNumbers(facts) && (entry.evidence?.length ?? 0) === 0
        ? "再利用可能な事実に数値が含まれますが、evidence がありません"
        : null
    ),
    checkForwardLookingClaims(body),
  ];
}

/* ─── 学び ───────────────────────────────────────── */

export function checkLearning(learning: Learning): QaCheck[] {
  return [
    check(
      "learning.required",
      "観測と解釈が揃っている",
      "blocking",
      !learning.observation?.trim() || !learning.interpretation?.trim()
        ? "observation / interpretation が未設定です"
        : null
    ),
    // 実績に紐づかない学びは、次の方針へ反映すると根拠のない最適化になる
    (learning.sourcePerformanceIds?.length ?? 0) > 0
      ? check("learning.sources", "実績に紐づいている", "blocking", null)
      : skippedCheck(
          "learning.sources",
          "実績に紐づいている",
          "blocking",
          "sourcePerformanceIds が空です（実績に基づかない学びです）"
        ),
    check(
      "learning.confidence",
      "確信度が設定されている",
      "warning",
      learning.confidence ? null : "confidence が未設定です"
    ),
    checkForwardLookingClaims(
      [learning.observation, learning.interpretation, learning.actionCandidate]
        .filter(Boolean)
        .join("\n")
    ),
  ];
}

/* ─── レポート化 ─────────────────────────────────── */

export function runViewpointQa(entry: ViewpointLibraryEntry, now?: Date): QaReport {
  return buildReport(entry.id, "viewpoint", checkViewpoint(entry), now);
}

export function runExperienceQa(entry: ExperienceEntry, now?: Date): QaReport {
  return buildReport(entry.id, "experience", checkExperience(entry), now);
}

export function runLearningQa(learning: Learning, now?: Date): QaReport {
  return buildReport(learning.id, "learning", checkLearning(learning), now);
}
