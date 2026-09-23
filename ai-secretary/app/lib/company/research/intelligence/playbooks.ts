import type { ResearchChannel, ResearchDepth, ResearchIntent, ResearchPlaybookId, ResearchPrimaryDepartment } from "../types";

/**
 * Research & Intelligence は「1 Research Engine + Playbook設定」。
 * 対象（会社・テーマ・SNS）ごとにResearcher Agentを増やさない。MVPは3 Playbookだけ。
 */
export type ResearchPlaybook = {
  id: ResearchPlaybookId;
  intent: ResearchIntent;
  department: ResearchPrimaryDepartment;
  /** step名と、そのstepで使う検索語（{topic} / {channel} を置換） */
  steps: Array<{ id: string; query: string; question?: string }>;
  ttlHours: number;
  defaultDepth: ResearchDepth;
};

export const RESEARCH_PLAYBOOKS: Record<ResearchPlaybookId, ResearchPlaybook> = {
  // 企業を理解するためのResearch。BUY / SELL 等の最終判断はしない（Fund Manager / Human の仕事）
  "company-research": {
    id: "company-research", intent: "company_research", department: "investment", ttlHours: 24, defaultDepth: "quick",
    steps: [
      { id: "overview", query: "{topic} company overview investor relations" },
      { id: "earnings", query: "{topic} latest quarterly earnings results revenue margin" },
      { id: "risk", query: "{topic} key risks 10-K risk factors" },
      { id: "business", query: "{topic} business segments revenue drivers" },
      { id: "growth", query: "{topic} growth drivers outlook" },
      { id: "valuation", query: "{topic} valuation inputs guidance capex" },
      { id: "thesis_inputs", query: "{topic} catalysts competitive position" },
    ],
  },
  // 前川のInvestment Research思考: 何が伸びる → 何が不足する → 誰が恩恵を受ける → 何が仮説を壊す
  "theme-research": {
    id: "theme-research", intent: "theme_research", department: "shared", ttlHours: 336, defaultDepth: "standard",
    steps: [
      { id: "growth_drivers", query: "{topic} market growth drivers forecast", question: "Q1 何が伸びるか / Q2 なぜ伸びるか" },
      { id: "demand_chain", query: "{topic} what is required demand", question: "Q3 成長に何が必要か" },
      { id: "dependencies", query: "{topic} dependencies inputs infrastructure" },
      { id: "value_chain", query: "{topic} value chain supply chain" },
      { id: "bottlenecks", query: "{topic} bottleneck shortage supply constraint lead time capacity", question: "Q4 何が不足するか / Q5 どこがボトルネックか" },
      { id: "beneficiary_industries", query: "{topic} suppliers beneficiary industries", question: "Q6 供給している産業" },
      { id: "companies", query: "{topic} key companies market share suppliers", question: "Q7 恩恵を受ける企業" },
      { id: "substitutability", query: "{topic} alternative suppliers substitutes switching cost", question: "Q8 代替可能か" },
      { id: "pricing_power", query: "{topic} pricing power prices", question: "Q9 Pricing Powerはあるか" },
      { id: "durability", query: "{topic} structural or cyclical demand", question: "Q10 利益は一時的か構造的か" },
      { id: "thesis_breakers", query: "{topic} risks slowdown oversupply", question: "Q11 何が仮説を壊すか" },
      { id: "risks", query: "{topic} risks" },
      { id: "unknowns", query: "{topic} uncertainty" },
    ],
  },
  // SNSごとのAgentは作らない。channel引数で扱う
  "platform-research": {
    id: "platform-research", intent: "platform_research", department: "creator", ttlHours: 24, defaultDepth: "quick",
    steps: [
      { id: "current_topics", query: "{channel} {topic} trending" },
      { id: "audience_interest", query: "{channel} {topic} popular posts audience" },
      { id: "competing_content", query: "{channel} {topic} top creators" },
      { id: "format_patterns", query: "{channel} {topic} post format" },
      { id: "hooks", query: "{channel} {topic} viral hooks" },
      { id: "content_opportunities", query: "{channel} {topic} content ideas" },
    ],
  },
};

export const PLAYBOOK_BY_INTENT: Record<ResearchIntent, ResearchPlaybookId> = {
  company_research: "company-research",
  theme_research: "theme-research",
  platform_research: "platform-research",
};

export const DEPTH_BUDGETS: Record<ResearchDepth, { maxQueries: number; maxItems: number; maxRuntimeMs: number }> = {
  quick: { maxQueries: 3, maxItems: 10, maxRuntimeMs: 15_000 },
  standard: { maxQueries: 8, maxItems: 30, maxRuntimeMs: 45_000 },
};

export const DEPTH_ORDER: Record<ResearchDepth, number> = { quick: 0, standard: 1 };

const CHANNEL_SITE: Record<ResearchChannel, string> = { x: "site:x.com", note: "site:note.com", instagram: "site:instagram.com", tiktok: "site:tiktok.com" };

/** depth の予算内で step ごとの検索語を作る。stepの並びが優先順位 */
export function playbookQueries(playbook: ResearchPlaybook, topic: string, depth: ResearchDepth, channel?: ResearchChannel): Array<{ step: string; query: string }> {
  const budget = DEPTH_BUDGETS[depth];
  return playbook.steps.slice(0, budget.maxQueries).map((step) => ({
    step: step.id,
    query: step.query.replace("{topic}", topic).replace("{channel}", channel ? CHANNEL_SITE[channel] : "").replace(/\s+/g, " ").trim(),
  }));
}
