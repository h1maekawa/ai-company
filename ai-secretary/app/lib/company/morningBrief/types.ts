export type MorningBriefArea = "BUSINESS" | "INVESTMENT" | "CONTENT" | "AI COMPANY" | "ENGINEERING" | "FINANCE";
export type MorningBriefItem = { id: string; fingerprint: string; area: MorningBriefArea; title: string; summary: string; deepLink: string; priority: "ACTION_REQUIRED" | "CRITICAL"; sourceAlreadyNotified: boolean };
export type MorningBriefInsight = { id: string; area: "CONTENT"; title: string; summary: string; deepLink?: string; freshness: "fresh" | "stale" | "insufficient"; confidence?: "low" | "medium" | "high" };
export type MorningBrief = { day: string; generatedAt: string; items: MorningBriefItem[]; insights: MorningBriefInsight[]; unavailable: string[]; xPublishedYesterday?: number };
