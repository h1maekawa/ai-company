"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiComment, PortfolioHealth } from "@/app/lib/investing/analysis";
import type { Capacity, CapacityFailure } from "@/app/lib/investing/capacity";
import { NewsItem, Portfolio, ValuePoint } from "@/app/lib/investing/types";
import type { InvestmentLearningBrief } from "@/app/lib/note/investing/learningBrief";

type PortfolioResponse = Portfolio & {
  history: ValuePoint[];
  capacity?: Capacity | null;
  error?: string;
};

/** 家計簿から取り込む「今月使えるお金」 */
export function useCapacity() {
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [configured, setConfigured] = useState(false);
  const [failure, setFailure] = useState<CapacityFailure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/investing/capacity")
      .then((r) => r.json())
      .then(
        (json: {
          capacity?: Capacity | null;
          configured?: boolean;
          failure?: CapacityFailure | null;
        }) => {
          setCapacity(json.capacity ?? null);
          setConfigured(Boolean(json.configured));
          setFailure(json.failure ?? null);
        }
      )
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return { capacity, configured, failure, loading };
}

/** ポートフォリオ本体（最優先で表示したいデータ） */
export function usePortfolio() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/investing/portfolio")
      .then((r) => r.json())
      .then((json: PortfolioResponse) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("ポートフォリオの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  return { data, loading, error, reload };
}

/** Investment Learning Brief（AI生成のため遅い。ポートフォリオとは別に読み込む） */
export function useLearningBrief() {
  const [brief, setBrief] = useState<InvestmentLearningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/investing/learning")
      .then((r) => r.json())
      .then((json: { brief?: InvestmentLearningBrief | null; error?: string }) => {
        if (json.error) setError(json.error);
        setBrief(json.brief ?? null);
      })
      .catch(() => setError("Learning Briefの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  return { brief, loading, error };
}

/** AI分析はLLM待ちで遅いため、ポートフォリオとは別に読み込む */
export function useAnalysis() {
  const [health, setHealth] = useState<PortfolioHealth | null>(null);
  const [comment, setComment] = useState<AiComment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/investing/analysis")
      .then((r) => r.json())
      .then((json: { health?: PortfolioHealth; comment?: AiComment }) => {
        setHealth(json.health ?? null);
        setComment(json.comment ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return { health, comment, loading };
}

/** ニュースも外部フィード待ちのため独立して読み込む */
export function useNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/investing/news")
      .then((r) => r.json())
      .then((json: { items?: NewsItem[]; available?: boolean }) => {
        setItems(json.items ?? []);
        setAvailable(Boolean(json.available));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return { items, available, loading };
}

/** 取得できなかった場合は null（UIでは「未取得」）。0件と取得失敗を区別する。 */
export function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(reload, [reload]);

  return { data, loading, reload };
}

/** Policy Engineの提案ログ（/api/fund/recommendations）のうち画面で使う項目 */
export type FundRecommendationView = {
  id: string;
  ticker: string;
  horizon: "short" | "medium" | "long";
  decision: string;
  score: number;
  confidence: string;
  reasons: string[];
  counterarguments: string[];
  warnings: string[];
  missingData: string[];
  invalidation: string | null;
  dataAsOf: string;
  nextReviewAt: string;
  evaluatedAt: string;
  policyVersion: number;
};

/** 同じ銘柄・期間は最新の評価だけを採用する */
export function latestRecommendations(items: FundRecommendationView[] | null | undefined): FundRecommendationView[] {
  const latest = new Map<string, FundRecommendationView>();
  for (const item of items ?? []) {
    const key = `${item.ticker}:${item.horizon}`;
    const prior = latest.get(key);
    if (!prior || prior.evaluatedAt < item.evaluatedAt) latest.set(key, item);
  }
  return [...latest.values()].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
}
