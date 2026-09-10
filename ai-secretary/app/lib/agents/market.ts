/**
 * Marketエージェントのデータ取り込み — 要件5
 *
 * 既存の3系統（市況・ニュース・保有）はすでに接続されているが、
 * 出口が「X投稿」と「投資ダッシュボード」の2つしか無く、
 * note記事のリサーチ経路（Research Inbox）には届いていなかった。
 * ここがその欠けている配線。
 *
 *   Portfolio + News → Investment Learning Brief（既存）
 *                    → ResearchItem（ここで追加）→ クラスタ → note候補
 *
 * 守ること:
 *   - 事実は Portfolio / News の SSOT からしか作らない。ここでAIに数値を作らせない
 *   - 総資産額・現金残高・保有数量・取得単価は書かない（learningBrief と同じ原則）
 *   - 同じ材料で重複生成しない（同日・同一briefは1回だけ取り込む）
 */

import { getOrCreateTodayLearningBrief } from "@/app/lib/note/investing/learningBrief";
import { loadResearchInbox, saveResearchInbox } from "@/app/lib/note/research/store";
import type { DataFreshness } from "@/app/lib/freshness";
import { briefToResearchItem, marketItemId } from "./marketMapping";

export { briefToResearchItem, marketItemId } from "./marketMapping";

export type MarketIntakeResult = {
  /** 取り込んだResearchItemの件数 */
  added: number;
  /** すでに取り込み済みでスキップした件数 */
  skipped: number;
  /** 材料が無くて生成しなかった場合の理由 */
  reason?: string;
  freshness: DataFreshness;
  ranAt: string;
};

/**
 * 市況データをリサーチ担当のインプットへ取り込む。
 * 新しい材料が無い日は何もしない（無理に記事ネタを作らない）。
 */
export async function runMarketIntake(now = new Date()): Promise<MarketIntakeResult> {
  const ranAt = now.toISOString();
  const brief = await getOrCreateTodayLearningBrief(now);

  if (!brief || !brief.hasContent) {
    return {
      added: 0,
      skipped: 0,
      reason: "新しい市況の材料がありません",
      freshness: {
        level: "none",
        asOf: null,
        source: "Portfolio + News",
        note: "本日は材料なし",
      },
      ranAt,
    };
  }

  const inbox = await loadResearchInbox();
  const itemId = marketItemId(brief.id);
  if (inbox.some((item) => item.id === itemId)) {
    return {
      added: 0,
      skipped: 1,
      reason: "同じ材料をすでに取り込み済みです",
      freshness: {
        level: "daily",
        asOf: brief.createdAt,
        source: "Portfolio + News",
        note: null,
      },
      ranAt,
    };
  }

  await saveResearchInbox([briefToResearchItem(brief, now), ...inbox]);

  return {
    added: 1,
    skipped: 0,
    freshness: {
      level: "daily",
      asOf: brief.createdAt,
      source: "Portfolio + News",
      note: null,
    },
    ranAt,
  };
}
