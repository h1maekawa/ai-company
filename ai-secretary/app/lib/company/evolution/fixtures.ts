/**
 * 検証用の合成イベント — v3.1 Phase 3 §21
 *
 * 実データが溜まる前にPhase 3を検証するための材料。
 * 本番コードからは参照しない（テストとローカル確認専用）。
 *
 * 各Fixtureは「何を期待するか」を名前とコメントで明示する。
 * 期待が変わったらFixtureも直すこと。
 */

import { createCompanyEvent, type CompanyEvent, type CreateEventInput } from "../events";

const BASE = new Date("2026-09-13T09:00:00Z");

export const FIXTURE_NOW = BASE;

function at(daysAgo: number, hour = 9): Date {
  return new Date(BASE.getTime() - daysAgo * 86_400_000 + hour * 3_600_000);
}

function event(input: Partial<CreateEventInput> & { action: string }, when: Date): CompanyEvent {
  return createCompanyEvent({
    kind: "task.completed",
    department: "sales",
    actor: "sales-agent",
    outcome: "success",
    ...input,
    now: when,
  } as CreateEventInput);
}

/**
 * Fixture A: 商談後フォローメールが14日間で8回。
 * 期待: SKILL_CANDIDATE が出る（毎回手作業でメールを書いている）。
 */
export function fixtureA(): CompanyEvent[] {
  const names = ["山田様", "佐藤様", "田中さん", "鈴木様", "高橋さん", "伊藤様", "渡辺様", "中村さん"];
  return names.map((name, index) =>
    event(
      {
        action: `${name}への商談後フォローメールを作って`,
        tools: ["gmail"],
      },
      at(index + 1)
    )
  );
}

/**
 * Fixture B: research → proposal → email draft が5回。
 * 期待: WORKFLOW_CANDIDATE が出る（同じ手順の繰り返し）。
 */
export function fixtureB(): CompanyEvent[] {
  const events: CompanyEvent[] = [];
  for (let run = 0; run < 5; run++) {
    const traceId = `trace-b-${run}`;
    const day = at(run + 1);
    events.push(
      event({ action: "市場を調査して", traceId }, new Date(day.getTime())),
      event({ action: "提案書を作成して", traceId }, new Date(day.getTime() + 600_000)),
      event({ action: "メールの下書きを作って", traceId }, new Date(day.getTime() + 1_200_000))
    );
  }
  return events;
}

/**
 * Fixture C: Strategy Agent の40タスク中18タスクが医療市場調査。
 * 期待: NEW_AGENT_CANDIDATE または AGENT_SPLIT_CANDIDATE。
 */
export function fixtureC(): CompanyEvent[] {
  const events: CompanyEvent[] = [];
  for (let i = 0; i < 18; i++) {
    events.push(
      event(
        {
          department: "strategy",
          actor: "strategy-agent",
          action: "医療市場の調査をして",
          latencyMs: 183_000,
          humanIntervention: i < 4,
        },
        at((i % 13) + 1, i % 12)
      )
    );
  }
  for (let i = 0; i < 22; i++) {
    events.push(
      event(
        {
          department: "strategy",
          actor: "strategy-agent",
          action: i % 2 === 0 ? "競合の調査をして" : "提案書を作成して",
          latencyMs: 109_000,
          humanIntervention: i < 1,
        },
        at((i % 13) + 1, (i % 12) + 1)
      )
    );
  }
  return events;
}

/**
 * Fixture D: 医療関連業務が複数Agentで25タスク / 30日。
 * 期待: NEW_DEPARTMENT_CANDIDATE。
 */
export function fixtureD(): CompanyEvent[] {
  const actors = ["strategy-agent", "sales-agent", "research-agent"];
  return Array.from({ length: 25 }, (_, i) =>
    event(
      {
        department: "strategy",
        actor: actors[i % actors.length],
        action: i % 2 === 0 ? "医療制度の調査をして" : "病院の競合調査をして",
      },
      at((i % 28) + 1, i % 12)
    )
  );
}

/**
 * Fixture E: 1回しか発生していない特殊タスク。
 * 期待: Proposalが出ない。
 */
export function fixtureE(): CompanyEvent[] {
  return [event({ action: "年次の法務レビュー資料をまとめて" }, at(3))];
}

/**
 * Fixture F: R3のAI社員が100%人間承認を受けている。
 * 期待: HIGH_HUMAN_INTERVENTION として誤検知しない。
 *
 * humanIntervention を true にしてあるのは、
 * 「承認由来の関与を除外できているか」を確かめるため。
 * 除外が効いていなければ、この Fixture で誤検知が出る。
 */
export function fixtureF(actorId: string): CompanyEvent[] {
  return Array.from({ length: 10 }, (_, i) =>
    event(
      {
        kind: "approval.approved",
        department: "note",
        actor: actorId,
        action: "投稿の承認",
        humanIntervention: true,
      },
      at(i + 1)
    )
  );
}

/** 分析に必要な最低イベント数を満たすための埋め草（種類はバラバラにする） */
export function filler(count: number): CompanyEvent[] {
  return Array.from({ length: count }, (_, i) =>
    event(
      {
        department: "misc",
        actor: `misc-agent-${i % 4}`,
        action: `雑務${i}の処理`,
      },
      at((i % 13) + 1, i % 20)
    )
  );
}

/** すべてのFixtureを合わせたもの */
export function allFixtures(r3AgentId = "personal-note"): CompanyEvent[] {
  return [
    ...fixtureA(),
    ...fixtureB(),
    ...fixtureC(),
    ...fixtureD(),
    ...fixtureE(),
    ...fixtureF(r3AgentId),
  ];
}
