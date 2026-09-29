import type { NewsImpact, NewsTrustTier } from "./types";

const DEMAND_WORDS = ["capex", "capital expenditure", "investment", "demand", "shipment", "market size", "supply constraint", "guidance", "long-term contract"];
const CATALYST_WORDS = ["earnings", "launch", "regulation", "contract", "customer", "guidance", "acquisition", "policy"];
const POSITIVE_WORDS = ["increase", "growth", "grew", "raise", "raised", "expand", "strong", "record", "beat", "accelerat", "surge"];
const NEGATIVE_WORDS = ["decrease", "decline", "cut", "lower", "weak", "miss", "slowdown", "cancel", "delay", "fall"];

export function newsTrustTier(sourceUrl: string): NewsTrustTier {
  const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname.endsWith(".gov") || ["federalreserve.gov", "sec.gov"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) || /(^|\.)(investor|ir)\./.test(hostname)) return "TIER_1";
  if (["reuters.com", "bloomberg.com", "wsj.com", "apnews.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return "TIER_2";
  return "TIER_3";
}

export function classifyNewsDirection(text: string): NewsImpact["direction"] {
  const normalized = text.toLowerCase();
  const hasPositive = POSITIVE_WORDS.some((word) => normalized.includes(word));
  const hasNegative = NEGATIVE_WORDS.some((word) => normalized.includes(word));
  return hasPositive === hasNegative ? "unknown" : hasPositive ? "positive" : "negative";
}

export function classifyNewsImpacts(input: { id: string; title: string; summary: string; themes: string[]; trustTier: NewsTrustTier }): NewsImpact[] {
  const text = `${input.title} ${input.summary}`.toLowerCase();
  const direction = classifyNewsDirection(text);
  if (direction === "unknown" || input.trustTier === "TIER_3") return [];
  const roles: NewsImpact["role"][] = [];
  if (DEMAND_WORDS.some((word) => text.includes(word))) roles.push("future_demand");
  if (CATALYST_WORDS.some((word) => text.includes(word))) roles.push("catalyst");
  const confidence = input.trustTier === "TIER_1" ? 0.9 : 0.75;
  return input.themes.flatMap((theme) => roles.map((role) => ({ targetType: "theme" as const, targetId: theme, direction, confidence, rationale: `${theme}に関する${role === "future_demand" ? "需要" : "材料"}の明示語を確認`, evidenceIds: [input.id], role })));
}
