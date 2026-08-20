import { getSkillById } from "./registry";
import { SkillExecutionInput, SkillExecutionResult } from "./types";
import { runPersonalCapture } from "./implementations/personalCapture";
import { runPersonalTodoAdd } from "./implementations/personalTodoAdd";
import { runPersonalTodayShow } from "./implementations/personalTodayShow";
import { runNoteDraftFormat } from "./implementations/noteDraftFormat";
import { runFundLogFormat } from "./implementations/fundLogFormat";
import { captureKnowledgeCandidate } from "../knowledge/captureService";

/**
 * Phase4 修正4: 出力が「再利用可能な学び」になりうるSkillだけをCapture対象にする。
 * 全Skill実行を無条件保存しない。input.captureToKnowledge === true でも明示的にCaptureできる。
 */
const CAPTURE_WORTHY_SKILLS = new Set<string>(["personal-capture"]);

type SkillHandler = (input: Record<string, unknown>) => {
  markdown: string;
  output?: Record<string, unknown>;
  warnings?: string[];
};

/**
 * skillId → 実処理のマッピング。
 * ここに存在しない、または registry.ts 側で status !== "implemented" の場合は
 * executeSkill() が "not implemented" を返す。
 */
const HANDLERS: Record<string, SkillHandler> = {
  "personal-capture": runPersonalCapture,
  "personal-todo-add": runPersonalTodoAdd,
  "personal-today-show": runPersonalTodayShow,
  "note-draft-format": runNoteDraftFormat,
  "fund-log-format": runFundLogFormat,
};

/**
 * Phase3A Skill Executor.
 *
 * 必須仕様（要件通り）:
 * - skillIdが存在しない場合は ok:false
 * - secretaryIdがallowedSecretariesに含まれない場合は ok:false
 * - 未実装Skillは "not implemented" を返す
 * - 例外でAPI全体を落とさない（必ずtry/catchでSkillExecutionResultを返す）
 * - このPhaseではMemory保存しない（呼び出し元にmarkdown/outputを返すだけ）
 */
export async function executeSkill(
  params: SkillExecutionInput
): Promise<SkillExecutionResult> {
  const { skillId, secretaryId, input } = params;

  try {
    const definition = getSkillById(skillId);
    if (!definition) {
      return {
        skillId,
        secretaryId,
        ok: false,
        error: `Unknown skillId: "${skillId}"`,
      };
    }

    if (!definition.allowedSecretaries.includes(secretaryId)) {
      return {
        skillId,
        secretaryId,
        ok: false,
        error: `secretaryId "${secretaryId}" is not permitted to use skill "${skillId}"`,
      };
    }

    const handler = HANDLERS[skillId];
    if (!handler || definition.status !== "implemented") {
      return {
        skillId,
        secretaryId,
        ok: false,
        error: "not implemented",
      };
    }

    const result = handler(input ?? {});

    // 学び候補のCapture（非致命。失敗してもSkill結果は返す）
    const wantCapture =
      CAPTURE_WORTHY_SKILLS.has(skillId) || (input as Record<string, unknown>)?.captureToKnowledge === true;
    if (wantCapture && result.markdown) {
      try {
        await captureKnowledgeCandidate({
          content: result.markdown,
          source: "skill",
          title: skillId,
        });
      } catch (captureErr) {
        console.error("[skills] Knowledge Capture failed (non-fatal):", captureErr);
      }
    }

    return {
      skillId,
      secretaryId,
      ok: true,
      markdown: result.markdown,
      output: result.output,
      warnings: result.warnings,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      skillId,
      secretaryId,
      ok: false,
      error: message,
    };
  }
}
