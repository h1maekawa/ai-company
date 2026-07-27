"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiComment, PortfolioHealth } from "@/app/lib/investing/analysis";
import { NewsItem, Portfolio, ValuePoint } from "@/app/lib/investing/types";

type PortfolioResponse = Portfolio & { history: ValuePoint[]; error?: string };

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
