/**
 * 検出器の共通契約 — v3.1 Phase 3 §3
 *
 * 「巨大なif文1個にしない」ため、検出器をプラグインとして並べる。
 * 新しい Pattern Type を足すときは、この契約を満たす検出器を1つ追加して
 * registry へ登録するだけで済むようにしてある。
 *
 * 検出器は読み取り専用。イベントと組織情報を受け取り Pattern を返すだけで、
 * 保存も通知も組織変更も行わない（§25）。
 */

import type { CompanyEvent } from "../../events";
import type { OrganizationSnapshot } from "../../organization";
import type { TaskSignature } from "../signature";
import type { EvolutionThresholds } from "../thresholds";

export type PatternType =
  | "REPEATED_TASK"
  | "SKILL_CANDIDATE"
  | "WORKFLOW_CANDIDATE"
  | "NEW_AGENT_CANDIDATE"
  | "AGENT_SPLIT_CANDIDATE"
  | "AGENT_MERGE_CANDIDATE"
  | "NEW_DEPARTMENT_CANDIDATE"
  | "BOTTLENECK"
  | "HIGH_HUMAN_INTERVENTION"
  | "HIGH_FAILURE_RATE"
  | "HIGH_RETRY_RATE"
  | "HIGH_API_COST";

/** 根拠の1行。§11 Evidence First のため、必ず数字と出所を持たせる */
export type Evidence = {
  label: string;
  value: number;
  /** 単位（"件" "%" "秒" "USD"）。無単位は null */
  unit: string | null;
  /** どう数えたかの補足 */
  note?: string;
};

export type Pattern = {
  type: PatternType;
  /** 同じ観測を同一視するためのキー。Proposal の fingerprint の元になる */
  key: string;
  title: string;
  target: {
    departmentId?: string;
    agentId?: string;
    skillId?: string;
    operation?: string;
  };
  evidence: Evidence[];
  /** 観測件数。§14 confidence と表示可否の判断に使う */
  sampleSize: number;
  observationWindowDays: number;
  signature?: TaskSignature;
  detectedAt: string;
};

export type DetectorContext = {
  /** 窓で絞る前の全イベント。検出器側で必要な窓を切る */
  events: CompanyEvent[];
  /** イベントID → signature（毎回作り直さないよう事前計算して渡す） */
  signatures: Map<string, TaskSignature>;
  organization: OrganizationSnapshot;
  thresholds: EvolutionThresholds;
  now: Date;
};

export type Detector = {
  id: string;
  detects: PatternType[];
  run(context: DetectorContext): Pattern[];
};

/* ─── 検出器が共通で使う小道具 ───────────────────── */

export function withinWindow(
  events: CompanyEvent[],
  days: number,
  now: Date
): CompanyEvent[] {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return events.filter((event) => event.at >= cutoff);
}

/** 0除算を避けつつ率を出す。分母0は0を返す（NaNを外へ出さない） */
export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function evidence(
  label: string,
  value: number,
  unit: string | null = null,
  note?: string
): Evidence {
  return { label, value, unit, note };
}
