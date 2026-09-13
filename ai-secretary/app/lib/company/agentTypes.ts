/**
 * AI社員（Employee Agent）の型 — AI Company OS v3.1 §24
 *
 * これまで「秘書（Secretary）」と呼んでいたものを、組織上の単位である
 * Employee Agent に統一する。Organization Architect（§5）が
 * 「社員AIが多すぎないか／少なすぎないか」を判断する対象はこれ1種類にする。
 *
 * I/Oを持たないのでクライアントからも読める。
 *
 * 重要な但し書き:
 *   permissions は現時点では「宣言」であって、実行時の強制ではない。
 *   §23 の Action Gateway による強制は後続フェーズ。
 *   宣言を先に必須化するのは、権限の分からないAI社員が増えるのを防ぐため。
 */

/** 管理職か担当者か。§5 の「Manager Agentが必要か」の判断対象 */
export type AgentKind = "manager" | "employee";

/**
 * リスク区分。§13 の目標値に対応する。
 *   R0 / R1 … 自律実行してよい（CEO介入 5%未満が目標）
 *   R2      … 自律実行するが監視を厚くする（15%未満）
 *   R3      … 実行前に必ず人の承認が要る（100% Approval）
 *   R4      … AIに実行させない
 */
export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  R0: "自律（監視不要）",
  R1: "自律",
  R2: "自律（要監視）",
  R3: "毎回承認",
  R4: "AI実行禁止",
};

/** §13 の目標介入率。指標の良し悪しを判断する基準になる */
export const RISK_INTERVENTION_TARGET: Record<RiskLevel, number | null> = {
  R0: 5,
  R1: 5,
  R2: 15,
  R3: 100,
  R4: null,
};

/**
 * AI社員の権限（§24）。
 * このアプリで実際に存在する操作だけを並べる。
 * 使わない権限を並べても、宣言が形骸化するだけなので入れない。
 */
export type AgentPermissions = {
  web: { search: boolean };
  github: { read: boolean; write: boolean };
  /** Vault（Markdown）への読み書き。memoryScope が読める範囲を別途絞る */
  vault: { read: boolean; write: boolean };
  /** 投稿系。publish は人の承認を経た後にしか立たない */
  publish: { draft: boolean; publish: boolean };
  /** 外部通知（Slack等） */
  notify: { slack: boolean };
};

/**
 * 既定は全拒否。
 * 新しいAI社員を足すときは、必要な権限だけを明示的に true にする。
 * 「とりあえず全部許可」を書きにくくするための既定値。
 */
export function denyAllPermissions(): AgentPermissions {
  return {
    web: { search: false },
    github: { read: false, write: false },
    vault: { read: false, write: false },
    publish: { draft: false, publish: false },
    notify: { slack: false },
  };
}

/** 部分指定から完全な権限オブジェクトを作る（未指定は拒否） */
export function permissions(partial: {
  web?: Partial<AgentPermissions["web"]>;
  github?: Partial<AgentPermissions["github"]>;
  vault?: Partial<AgentPermissions["vault"]>;
  publish?: Partial<AgentPermissions["publish"]>;
  notify?: Partial<AgentPermissions["notify"]>;
}): AgentPermissions {
  const base = denyAllPermissions();
  return {
    web: { ...base.web, ...partial.web },
    github: { ...base.github, ...partial.github },
    vault: { ...base.vault, ...partial.vault },
    publish: { ...base.publish, ...partial.publish },
    notify: { ...base.notify, ...partial.notify },
  };
}

/** 許可されている権限を "vault.write" の形で列挙する（UI・監査用） */
export function grantedPermissions(perms: AgentPermissions): string[] {
  const granted: string[] = [];
  for (const [group, actions] of Object.entries(perms)) {
    for (const [action, allowed] of Object.entries(actions as Record<string, boolean>)) {
      if (allowed) granted.push(`${group}.${action}`);
    }
  }
  return granted;
}

/**
 * 書き込み系の権限を持つか。
 * リスク区分との整合を検査するのに使う（書き込めるのに R0 はおかしい）。
 */
export function hasWriteAccess(perms: AgentPermissions): boolean {
  return (
    perms.github.write ||
    perms.vault.write ||
    perms.publish.draft ||
    perms.publish.publish ||
    perms.notify.slack
  );
}
