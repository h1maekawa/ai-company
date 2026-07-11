import { SkillImplementationOutput } from "./personalCapture";
import { jstDayOfWeek, todayJstDateString } from "./dateUtil";

export type PersonalTodayShowInput = {
  date?: string;
};

/**
 * personal-today-show — cc-secretaryの「今日のタスク」を参考にした表示枠生成Skill。
 * このPhaseではMemory読み込みは行わない（枠だけを返す）。実データ表示はPhase3B以降。
 */
export function runPersonalTodayShow(input: Record<string, unknown>): SkillImplementationOutput {
  const { date } = input as PersonalTodayShowInput;
  const targetDate = typeof date === "string" && date.trim() ? date.trim() : todayJstDateString();

  const markdown = `# 今日のタスク

Date: ${targetDate} (${jstDayOfWeek(targetDate)})

## 最優先
- [ ]

## 通常
- [ ]

## 余裕があれば
- [ ]

## 完了
- [x]
`;

  return {
    markdown,
    output: { date: targetDate },
  };
}
