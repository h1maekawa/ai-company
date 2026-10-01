import { getAutomationStatus } from "../note/automation/status";
import { loadIntelligenceToday } from "../investing/intelligence/store";
import { flowFinanceSummary } from "../finance/flowClient";

type Attention = { id: string; title: string; href: string; source: string; priority: "high" | "normal"; order: number };
const day = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), 5500); })]); }
  finally { clearTimeout(timer); }
}
export async function loadHomeAttention() {
  const now = new Date();
  const results = await Promise.allSettled([
    bounded(getAutomationStatus()), bounded(loadIntelligenceToday()), bounded(flowFinanceSummary(day(now).slice(0, 7))),
  ]);
  const attention: Attention[] = [];
  const unavailable: string[] = [];
  const [content, investment, finance] = results;
  if (content.status === "fulfilled") {
    const count = content.value.approvalQueue.length;
    if (count) attention.push({ id: "content-review", title: `X確認待ち ${count}件`, href: "/note?view=review", source: "コンテンツ", priority: "high", order: 3 });
  } else unavailable.push("コンテンツ");
  if (investment.status === "fulfilled" && investment.value) {
    const current = investment.value.opportunities.filter((item) => Number.isFinite(Date.parse(item.generatedAt)) && Date.parse(item.generatedAt) <= now.getTime() && day(new Date(item.generatedAt)) === day(now));
    if (!current.length) unavailable.push("投資");
    for (const item of current.filter((item) => item.gate === "GO_CANDIDATE").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)) {
      attention.push({ id: `investment:${item.id}`, title: `${item.ticker} Opportunity · Score ${item.score ?? "—"} · Coverage ${item.coverage}%`, href: `/investing/opportunities/${encodeURIComponent(item.id)}`, source: "投資", priority: "normal", order: 2 });
    }
  } else unavailable.push("投資");
  if (finance.status === "fulfilled" && !finance.value.stale && finance.value.data) {
    const review = finance.value.data.review;
    if (Number.isInteger(review?.unreviewed_transactions) && Number.isInteger(review?.unassigned_card_usage) && typeof review.negative_balance_risk === "boolean") {
      const labels = [review.unreviewed_transactions > 0 ? `使用カテゴリ 未分類 ${review.unreviewed_transactions}件` : null, review.unassigned_card_usage > 0 ? `カード割当待ち ${review.unassigned_card_usage}件` : null, review.negative_balance_risk ? "残高リスクあり" : null].filter(Boolean);
      if (labels.length) attention.push({ id: "finance-review", title: labels.join(" · "), href: review.unreviewed_transactions > 0 ? "/assets?tab=household" : "/assets?tab=cards", source: "資産", priority: "normal", order: 4 });
    } else unavailable.push("資産");
  } else unavailable.push("資産");
  return { attention, unavailable };
}
