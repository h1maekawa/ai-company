/**
 * Action Gateway — Phase 6 §14 / §22 / §23 / §24 / §68
 *
 * Agentは外部Actionを直接実行できない。必ずここを通す。
 *
 *   Agent → ActionRequest → Gateway → Policy → Permission → Approval → Executor
 *
 * 設計上ゆずれない点:
 *   - Default Deny（§22）。判断できないものは BLOCKED
 *   - R4 は承認があっても実行しない（§21 / Test D）
 *   - R3 は自動実行しない（§20 / Test C）
 *   - 権限が無ければ Policy 以前に BLOCK（§23 / Test E）
 *   - 外部文書から直接 ActionRequest を作らせない（§33 / Test I）
 *
 * §24 のとおり、Phase 2 の permissions を「宣言」から「実行時強制」へ変えるのは
 * このGateway経由のActionに限る。既存機能を一斉に移行しない。
 */

import type { AgentSummary } from "../organization";
import { grantedPermissions } from "../agentTypes";
import type { RiskLevel } from "../agentTypes";
import {
  isKnownAction,
  permissionsFor,
  riskOf,
  type ActionType,
  type Permission,
} from "./actionTypes";

export type ActionRequestStatus =
  | "REQUESTED"
  | "AUTO_APPROVED"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED"
  | "BLOCKED";

/**
 * Actionの依頼元。
 * 外部文書（Web/メール/PDF）を読んだ結果として生まれたものは "external_content"。
 * この出所からのActionは §33 により一切通さない。
 */
export type ActionOrigin = "agent" | "human" | "external_content";

export type ActionRequest = {
  id: string;
  missionId: string;
  traceId: string;
  requestedByAgentId: string;
  /** どこから生まれた依頼か（§33） */
  origin: ActionOrigin;

  actionType: ActionType | string;
  /** 中身の要約。生データ（本文全文・宛先一覧）は載せない */
  payloadSummary: string;
  target?: string;

  riskLevel: RiskLevel;
  requiredPermissions: Permission[];

  status: ActionRequestStatus;
  /** BLOCKED / REJECTED の理由。必ず入れる */
  reason?: string;
  /** 紐づく承認依頼 */
  approvalId?: string;

  createdAt: string;
  updatedAt: string;
};

export type GatewayDecision = {
  request: ActionRequest;
  /** 承認待ちに回すべきか */
  needsApproval: boolean;
  /** そのまま実行してよいか */
  executable: boolean;
};

export type GatewayInput = {
  missionId: string;
  traceId: string;
  agent: AgentSummary | null;
  actionType: string;
  payloadSummary: string;
  target?: string;
  origin?: ActionOrigin;
  now?: Date;
};

function makeRequest(input: GatewayInput, now: Date): ActionRequest {
  return {
    id: `act_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    missionId: input.missionId,
    traceId: input.traceId,
    requestedByAgentId: input.agent?.id ?? "unknown",
    origin: input.origin ?? "agent",
    actionType: input.actionType,
    payloadSummary: input.payloadSummary,
    target: input.target,
    riskLevel: riskOf(input.actionType),
    requiredPermissions: permissionsFor(input.actionType),
    status: "REQUESTED",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

const blocked = (request: ActionRequest, reason: string, now: Date): GatewayDecision => ({
  request: { ...request, status: "BLOCKED", reason, updatedAt: now.toISOString() },
  needsApproval: false,
  executable: false,
});

/**
 * ActionRequest を審査する。
 *
 * 評価順序が安全性を決める。上から順に、
 * 「そもそも通してはいけないもの」を先に落とす。
 */
export function reviewActionRequest(input: GatewayInput): GatewayDecision {
  const now = input.now ?? new Date();
  const request = makeRequest(input, now);

  /* 1. 外部文書由来のActionは一切通さない（§33 / Test I） */
  if (request.origin === "external_content") {
    return blocked(
      request,
      "外部文書の内容からActionを作ることはできません（指示として解釈しません）",
      now
    );
  }

  /* 2. 未知のActionは Default Deny（§22） */
  if (!isKnownAction(request.actionType)) {
    return blocked(request, `未登録のActionです: ${request.actionType}`, now);
  }

  /* 3. R4 は承認があっても実行しない（§21 / Test D） */
  if (request.riskLevel === "R4") {
    return blocked(
      request,
      "R4のActionはAIが実行できません（提案としてのみ扱えます）",
      now
    );
  }

  /* 4. Agentが特定できなければ実行させない */
  if (!input.agent) {
    return blocked(request, "実行するAI社員を特定できません", now);
  }

  /*
   * 5. 権限チェック（§23 / Test E）。
   *    Policy判断より先に見る。権限が無いものは、
   *    どんなポリシーでも通らないため。
   */
  const granted = new Set(grantedPermissions(agentPermissions(input.agent)));
  const missing = request.requiredPermissions.filter((p) => !granted.has(p));
  if (missing.length > 0) {
    return blocked(
      request,
      `権限がありません: ${missing.join(", ")}（${input.agent.id}）`,
      now
    );
  }

  /*
   * 6. AI社員自身のリスク区分による上限。
   *    R3のAI社員が R0 の作業をするのは構わないが、
   *    R1のAI社員が R3 のActionを出すのは越権。
   */
  if (exceedsAgentRisk(request.riskLevel, input.agent.riskLevel)) {
    return blocked(
      request,
      `${input.agent.id}（${input.agent.riskLevel}）には ${request.riskLevel} のActionを出す権限がありません`,
      now
    );
  }

  /* 7. R3 は必ず承認へ（§20 / Test C） */
  if (request.riskLevel === "R3") {
    return {
      request: { ...request, status: "WAITING_APPROVAL", updatedAt: now.toISOString() },
      needsApproval: true,
      executable: false,
    };
  }

  /* 8. R2 は原則CEO確認（§19）。下書きは作れるが送信はしない */
  if (request.riskLevel === "R2") {
    return {
      request: { ...request, status: "WAITING_APPROVAL", updatedAt: now.toISOString() },
      needsApproval: true,
      executable: false,
    };
  }

  /* 9. R0 / R1 は自動承認（§17 / §18 / Test B） */
  return {
    request: { ...request, status: "AUTO_APPROVED", updatedAt: now.toISOString() },
    needsApproval: false,
    executable: true,
  };
}

/**
 * AgentSummary から権限オブジェクトを復元する。
 * granted は "group.action" の配列なので、照合用に同じ形へ戻す。
 */
function agentPermissions(agent: AgentSummary) {
  // AgentSummary は granted（文字列配列）しか持たないため、
  // grantedPermissions と同じ形式で比較できるようラップする
  return {
    web: { search: agent.granted.includes("web.search") },
    github: {
      read: agent.granted.includes("github.read"),
      write: agent.granted.includes("github.write"),
    },
    vault: {
      read: agent.granted.includes("vault.read"),
      write: agent.granted.includes("vault.write"),
    },
    publish: {
      draft: agent.granted.includes("publish.draft"),
      publish: agent.granted.includes("publish.publish"),
    },
    notify: { slack: agent.granted.includes("notify.slack") },
  };
}

const RISK_ORDER: Record<RiskLevel, number> = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 };

/**
 * AI社員のリスク区分を超えるActionか。
 *
 * R3 は「毎回承認が要る」という意味で、上限としては高い。
 * R4 のAI社員はそもそも実行しないので、すべて越権になる。
 */
export function exceedsAgentRisk(actionRisk: RiskLevel, agentRisk: RiskLevel): boolean {
  if (agentRisk === "R4") return true;
  return RISK_ORDER[actionRisk] > RISK_ORDER[agentRisk];
}

/**
 * 承認後の実行可否。
 *
 * 承認されていても、以下は実行しない:
 *   - R4（そもそも承認対象にならないが、二重の歯止め）
 *   - 期限切れ
 *   - 却下済み
 */
export function canExecuteAfterApproval(
  request: ActionRequest,
  options: { approved: boolean; expiresAt?: string; now?: Date } = { approved: false }
): { executable: boolean; reason?: string } {
  const now = options.now ?? new Date();

  if (request.riskLevel === "R4") {
    return { executable: false, reason: "R4のActionは承認されても実行しません" };
  }
  if (request.status === "REJECTED") {
    return { executable: false, reason: "却下されたActionは実行できません" };
  }
  if (request.status === "BLOCKED") {
    return { executable: false, reason: "ブロックされたActionは実行できません" };
  }
  if (!options.approved) {
    return { executable: false, reason: "承認されていません" };
  }
  if (options.expiresAt && new Date(options.expiresAt).getTime() < now.getTime()) {
    return { executable: false, reason: "承認の有効期限が切れています" };
  }
  return { executable: true };
}
