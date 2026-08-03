/**
 * リサーチ1回分の実行。
 *
 * note/X から集める → 型へ抽象化 → 重複を除く → クラスタ化 → 採点 → 保存。
 * どこかのソースが落ちても、取れたところまでで続行する。
 */

import { loadBrand } from "../store";
import { abstractItems } from "./abstract";
import { buildClusters, selectTopCandidates } from "./cluster";
import { researchNote } from "./sources/note";
import { researchX } from "./sources/x";
import {
  loadClusters,
  loadExperiences,
  loadReferences,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
  saveClusters,
  saveResearchInbox,
  saveResearchSettings,
} from "./store";
import { ResearchItem, TrendCluster } from "./types";

export type ResearchRunResult = {
  fetched: number;
  newItems: number;
  clusters: TrendCluster[];
  topCandidates: TrendCluster[];
  failures: { source: string; error: string }[];
  xSkippedReason?: string;
  estimatedCostUsd: number;
  ranAt: string;
};

export async function runResearch(options?: {
  focusTopic?: string;
  platform?: "x" | "note" | "both";
}): Promise<ResearchRunResult> {
  const ranAt = new Date().toISOString();

  const [settings, references, brandFile, experiences, existingItems, existingClusters, drafts] =
    await Promise.all([
      loadResearchSettings(),
      loadReferences(),
      loadBrand(),
      loadExperiences(),
      loadResearchInbox(),
      loadClusters(),
      loadSocialDrafts(),
    ]);

  const failures: { source: string; error: string }[] = [];

  // note と X を独立に走らせ、片方が落ちても続行する
  const platform = options?.platform ?? "both";
  const [noteResult, xResult] = await Promise.all([
    platform === "x"
      ? Promise.resolve({ items: [], failures: [] })
      : researchNote(references.noteCreators, settings.noteTags, {
          focusTopic: options?.focusTopic,
        }).catch((error) => {
          failures.push({ source: "note", error: String(error) });
          return { items: [], failures: [] };
        }),
    platform === "note"
      ? Promise.resolve({
          items: [],
          failures: [],
          estimatedCostUsd: 0,
          skippedReason: "note用リサーチのためX取得は実行していません",
        })
      : researchX(references.xAccounts, settings.x).catch((error) => {
          failures.push({ source: "x", error: String(error) });
          return { items: [], failures: [], estimatedCostUsd: 0, skippedReason: undefined };
        }),
  ]);

  failures.push(...noteResult.failures, ...xResult.failures);

  const fetched = [...noteResult.items, ...xResult.items];

  // 既に取り込み済みのURLは再登録しない
  const knownUrls = new Set(existingItems.map((i) => i.sourceUrl));
  const fresh = fetched.filter((i) => !knownUrls.has(i.sourceUrl));

  // 新しいものだけAIで型へ抽象化する（コストと時間の節約）
  // Slackの会話リサーチはVercelの制限時間内に必ず完了通知を返す。
  // 型分析のAI呼び出しは待たず、決定的なフォールバックで採点する。
  const abstracted =
    fresh.length > 0
      ? await abstractItems(fresh, { useAI: !options?.focusTopic })
      : [];

  const allItems: ResearchItem[] = [...abstracted, ...existingItems];
  const savedItems = await saveResearchInbox(allItems);

  // 採点に使う「過去に扱ったテーマ」
  const pastTitles = [
    ...existingClusters.filter((c) => c.status === "used").map((c) => c.title),
    ...drafts.map((d) => d.text.slice(0, 60)),
  ];

  const clusters = buildClusters(
    savedItems,
    { brand: brandFile.brand, experiences, pastTitles },
    existingClusters
  );
  const saved = await saveClusters(clusters);

  // X APIを使った分の推定コストを月次集計へ反映する
  if (xResult.estimatedCostUsd > 0) {
    await saveResearchSettings({
      ...settings,
      x: {
        ...settings.x,
        currentEstimatedSpendUsd:
          settings.x.currentEstimatedSpendUsd + xResult.estimatedCostUsd,
        lastRunAt: ranAt,
      },
    });
  } else {
    await saveResearchSettings({ ...settings, x: { ...settings.x, lastRunAt: ranAt } });
  }

  const topCandidates = selectTopCandidates(
    saved,
    savedItems,
    options?.focusTopic,
    fresh.map((item) => item.id),
    platform === "both" ? undefined : platform
  );

  return {
    fetched: fetched.length,
    newItems: fresh.length,
    clusters: saved,
    topCandidates,
    failures,
    xSkippedReason: xResult.skippedReason,
    estimatedCostUsd: xResult.estimatedCostUsd,
    ranAt,
  };
}
