import { platformBrandPolicy } from "../../content/brandProfile";
import type {
  DailyResearchAgenda,
  DepartmentResearchPolicy,
  ResearchAgendaCategory,
  ResearchArtifact,
  ResearchItem as CompanyResearchItem,
} from "../../company/research/types";
import type { ContentPerformance, ExperienceEntry, SocialDraft } from "../research/types";

export type CreatorAgendaInput = {
  date: string;
  now: Date;
  policy: DepartmentResearchPolicy;
  recentResearch?: CompanyResearchItem[];
  researchArtifacts?: ResearchArtifact[];
  recentPosts?: SocialDraft[];
  performance?: ContentPerformance[];
  nightlyReviewRefs?: string[];
  winningTopicRefs?: string[];
  weakTopicRefs?: string[];
  recentlyUsedTopics?: string[];
  topicTitles?: Record<string, string>;
  experiences?: ExperienceEntry[];
  noteCandidateRefs?: string[];
};

const categoryOrder: ResearchAgendaCategory[] = [
  "breaking-current",
  "strategic-brand",
  "performance-follow-up",
  "knowledge-gap",
  "evergreen-educational",
  "experiment",
];

/** Creator adapter。入力の欠損を0件の実績とは解釈せずunknownsへ残す。 */
export function buildCreatorDailyResearchAgenda(input: CreatorAgendaInput): DailyResearchAgenda {
  if (input.policy.departmentId !== "creator") throw new Error("CREATOR_AGENDA_POLICY_REQUIRED");
  const brand = platformBrandPolicy("x");
  const evidenceRefs = new Set<string>();
  const unknowns: string[] = [];
  const intents: DailyResearchAgenda["queryIntents"] = [];
  const add = (category: ResearchAgendaCategory, query: string, reason: string, refs: string[] = []) => {
    if (!query.trim() || intents.some((intent) => intent.query === query)) return;
    refs.forEach((ref) => evidenceRefs.add(ref));
    intents.push({ category, query, reason, evidenceRefs: refs });
  };

  const fresh = (input.recentResearch ?? []).filter((item) => item.freshnessStatus === "FRESH");
  const latest = [...fresh].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
  if (latest) add("breaking-current", `${latest.topic} 最新動向 一次情報`, "freshな既存Researchの続きを確認", [latest.id]);
  else { unknowns.push("current external freshness is UNKNOWN"); add("breaking-current", `${brand.pillars[0]} 最新動向 一次情報`, "外部freshnessが未確認のため広く確認"); }

  add("strategic-brand", `${brand.pillars[1] ?? brand.pillars[0]} 20代男性 選び方`, "X Brand pillarの継続調査");

  const observed = (input.performance ?? []).filter((record) => record.platform === "x" && record.impressions !== undefined);
  const recentTopics = new Set(input.recentlyUsedTopics ?? []);
  const titleFor = (id?: string) => id && !recentTopics.has(id) ? input.topicTitles?.[id]?.trim() : undefined;
  const best = [...observed].filter((record) => titleFor(record.trendClusterId)).sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1))[0];
  if (best?.trendClusterId) add("performance-follow-up", `${titleFor(best.trendClusterId)} follow-up why it matters`, "観測済みPerformanceのfollow-up", [best.contentId]);
  else unknowns.push("X ContentPerformance is UNKNOWN; no zero-performance assumption was made");

  const winningTopic = input.winningTopicRefs?.find((id) => titleFor(id));
  if (winningTopic) add("performance-follow-up", `${titleFor(winningTopic)} latest evidence follow-up`, "Nightly Reviewの勝ち筋を追加検証", [winningTopic]);
  else unknowns.push("Nightly winning topics are UNKNOWN");

  const weakTopic = input.weakTopicRefs?.find((id) => titleFor(id));
  if (weakTopic) add("knowledge-gap", `${titleFor(weakTopic)} audience need evidence gap`, "弱いTopicを昇格せずResearch gapとして再検証", [weakTopic]);
  else unknowns.push("Nightly weak topics are UNKNOWN");

  const gapArtifact = (input.researchArtifacts ?? []).find((artifact) => artifact.intelligence?.unknowns.length);
  const gap = gapArtifact?.intelligence?.unknowns[0];
  if (gap) add("knowledge-gap", `${gap} 独立ソース 最新 evidence`, "未解決Research gapを追加調査", [gapArtifact.id]);
  else unknowns.push("unresolved Research gaps are UNKNOWN");

  add("evergreen-educational", `${brand.pillars[2] ?? brand.pillars[0]} 基礎 なぜ どう選ぶ`, "昼のtrust枠向けEvergreen調査");
  add("experiment", `${brand.pillars[0]} 比較 よくある誤解`, "既存Hot Scoreで評価する探索候補");

  const verifiedExperience = (input.experiences ?? []).find((experience) => experience.verifiedByUser && !experience.sensitive);
  if (verifiedExperience) add("performance-follow-up", `${verifiedExperience.title} 関連テーマ 追加根拠`, "確認済みPersonal Experienceを外部根拠で補強", [verifiedExperience.id]);
  else unknowns.push("available verified Personal Experience is UNKNOWN");

  const noteRef = input.noteCandidateRefs?.[0];
  if (noteRef) { evidenceRefs.add(noteRef); add("strategic-brand", `${brand.pillars[0]} 深掘り note candidate`, "夜のdepth候補を調査", [noteRef]); }
  else unknowns.push("Note candidates are UNKNOWN");

  if (input.recentPosts?.length) input.recentPosts.forEach((post) => evidenceRefs.add(post.id));
  else unknowns.push("recent X posts are UNKNOWN");
  (input.nightlyReviewRefs ?? []).forEach((ref) => evidenceRefs.add(ref));
  (input.recentlyUsedTopics ?? []).forEach((ref) => evidenceRefs.add(ref));

  // Policy budget is authoritative. Round-robin categories prevent one category from filling the run.
  const byCategory = new Map(categoryOrder.map((category) => [category, intents.filter((intent) => intent.category === category)]));
  const queryIntents: DailyResearchAgenda["queryIntents"] = [];
  for (let index = 0; queryIntents.length < input.policy.maxQueriesPerRun; index += 1) {
    let appended = false;
    for (const category of categoryOrder) {
      const intent = byCategory.get(category)?.[index];
      if (!intent) continue;
      queryIntents.push(intent);
      appended = true;
      if (queryIntents.length === input.policy.maxQueriesPerRun) break;
    }
    if (!appended) break;
  }
  return {
    date: input.date,
    department: "creator",
    goals: ["朝・昼・夜の安全なX候補に必要なfresh evidenceを集める", "未解決evidence gapを減らす"],
    researchQuestions: queryIntents.map((intent) => intent.query),
    queryIntents,
    targetPillars: [...brand.pillars],
    targetSlots: [
      { time: "07:30", role: "reach" },
      { time: "12:15", role: "trust" },
      { time: "20:30", role: "depth" },
    ],
    reason: "既存Research/Hot Scoreへ渡すCreator X daily planning artifact",
    evidenceRefs: [...evidenceRefs],
    unknowns,
    createdAt: input.now.toISOString(),
  };
}
