/**
 * Pattern Analyzer — v3.1 Phase 3 §1 / §3
 *
 * 登録された検出器を順に走らせ、観測結果（Pattern）を集める。
 * 組織は変更しない。提案も作らない（それは Proposal Engine の仕事）。
 *
 * Shadow Mode（§1）:
 *   実運用イベントが溜まっていない段階では、「何もない＝異常なし」と
 *   断定してはいけない。イベントが最低数に満たなければ INSUFFICIENT_DATA を
 *   返し、検出器を走らせない。データ不足を「健全」と読み替えないための仕組み。
 *
 * 1つの検出器が落ちても他は走らせる。
 * 検出は観測であって、1か所の不具合で全体を止める理由がない。
 */

import { buildOrganizationSnapshot, type OrganizationSnapshot } from "../organization";
import type { CompanyEvent } from "../events";
import { buildTaskSignature, SIGNATURE_VERSION, type TaskSignature } from "./signature";
import { defaultThresholds, type EvolutionThresholds } from "./thresholds";
import { DETECTORS } from "./detection";
import type { Detector, Pattern } from "./detection/types";

export type AnalysisStatus = "OK" | "INSUFFICIENT_DATA";

export type PatternAnalysis = {
  status: AnalysisStatus;
  /** INSUFFICIENT_DATA のときの理由 */
  reason?: string;
  signatureVersion: string;
  windowDays: number;
  eventsAnalyzed: number;
  patterns: Pattern[];
  /** 落ちた検出器（他は走っている） */
  detectorErrors: { detectorId: string; error: string }[];
  analyzedAt: string;
};

export type AnalyzeOptions = {
  thresholds?: EvolutionThresholds;
  organization?: OrganizationSnapshot;
  detectors?: Detector[];
  now?: Date;
};

/** イベントごとの signature を先に作る（検出器が何度も作り直さないため） */
export function buildSignatureIndex(events: CompanyEvent[]): Map<string, TaskSignature> {
  return new Map(events.map((event) => [event.id, buildTaskSignature(event)]));
}

export function analyzePatterns(
  events: CompanyEvent[],
  options: AnalyzeOptions = {}
): PatternAnalysis {
  const now = options.now ?? new Date();
  const thresholds = options.thresholds ?? defaultThresholds();
  const analyzedAt = now.toISOString();

  // Shadow Mode: データ不足を「異常なし」と読み替えない
  if (events.length < thresholds.minimumEventsForAnalysis) {
    return {
      status: "INSUFFICIENT_DATA",
      reason: `イベントが${events.length}件しかありません（分析には${thresholds.minimumEventsForAnalysis}件必要）`,
      signatureVersion: SIGNATURE_VERSION,
      windowDays: thresholds.windowDays,
      eventsAnalyzed: events.length,
      patterns: [],
      detectorErrors: [],
      analyzedAt,
    };
  }

  const context = {
    events,
    signatures: buildSignatureIndex(events),
    organization: options.organization ?? buildOrganizationSnapshot(now),
    thresholds,
    now,
  };

  const patterns: Pattern[] = [];
  const detectorErrors: { detectorId: string; error: string }[] = [];

  for (const detector of options.detectors ?? DETECTORS) {
    try {
      patterns.push(...detector.run(context));
    } catch (error) {
      // 1つ落ちても他の観測は続ける
      detectorErrors.push({
        detectorId: detector.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: "OK",
    signatureVersion: SIGNATURE_VERSION,
    windowDays: thresholds.windowDays,
    eventsAnalyzed: events.length,
    patterns: patterns.sort((a, b) => b.sampleSize - a.sampleSize),
    detectorErrors,
    analyzedAt,
  };
}
