"use client";

import { useEffect, useState } from "react";

/**
 * ホームの「今日の状況」「最近の動き」を組み立てる読み取り専用フック。
 *
 * 既存APIをそのまま並列で読むだけで、Backendのロジックには一切触らない。
 * どれか1つが落ちても他の指標は表示できるよう、失敗は握りつぶして null にする。
 */

export type HomeStat = {
  id: string;
  label: string;
  /** 取得できていないときは null（0と区別する） */
  count: number | null;
  href: string;
  /** 0件でなければ注意を引きたい指標 */
  emphasize?: boolean;
};

export type HomeActivity = {
  id: string;
  label: string;
  at: string | null;
  href: string;
};

type PlanningResponse = { summary?: { remaining?: number } };
type QueueResponse = {
  articles?: { id: string; title?: string; status?: string; updatedAt?: string; createdAt?: string }[];
  socialDrafts?: { id: string; text?: string; status?: string; createdAt?: string }[];
};
type FundResponse = {
  recommendations?: { id: string; ticker?: string; decision?: string; evaluatedAt?: string }[];
};
type KnowledgeResponse = {
  count?: number;
  items?: { path: string; frontmatter?: { title?: string; id?: string; updated?: string; created?: string } }[];
};

const ATTENTION_DECISIONS = ["BUY_CANDIDATE", "ADD_CANDIDATE", "TRIM_CANDIDATE"];
const RECENT_DAYS = 7;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function isRecent(at: string | undefined | null): boolean {
  if (!at) return false;
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= RECENT_DAYS * 86_400_000;
}

function truncate(text: string, max = 28): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function useHomeStatus() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HomeStat[]>([]);
  const [activity, setActivity] = useState<HomeActivity[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [planning, queue, fund, knowledge] = await Promise.all([
        getJson<PlanningResponse>("/api/planning"),
        getJson<QueueResponse>("/api/note/publishing/queue"),
        getJson<FundResponse>("/api/fund/recommendations"),
        getJson<KnowledgeResponse>("/api/knowledge/candidates"),
      ]);
      if (!alive) return;

      const drafts = (queue?.socialDrafts ?? []).filter(
        (draft) => draft.status !== "published" && draft.status !== "discarded"
      );
      const articles = (queue?.articles ?? []).filter(
        (article) => article.status === "draft" || article.status === "approved"
      );
      const attention = (fund?.recommendations ?? []).filter(
        (rec) => ATTENTION_DECISIONS.includes(rec.decision ?? "") && isRecent(rec.evaluatedAt)
      );

      setStats([
        {
          id: "today",
          label: "今日やること",
          count: planning?.summary?.remaining ?? null,
          href: "/planning",
        },
        {
          id: "review",
          label: "確認待ちの投稿",
          count: queue ? drafts.length + articles.length : null,
          href: "/note?view=review",
          emphasize: true,
        },
        {
          id: "investing",
          label: "投資の注目",
          count: fund ? attention.length : null,
          href: "/investing",
          emphasize: true,
        },
        {
          id: "knowledge",
          label: "Knowledge確認待ち",
          count: knowledge?.count ?? knowledge?.items?.length ?? null,
          href: "/knowledge",
        },
      ]);

      const recent: HomeActivity[] = [];
      const latestDraft = drafts[0];
      if (latestDraft) {
        recent.push({
          id: `draft-${latestDraft.id}`,
          label: `X投稿を生成: ${truncate(latestDraft.text ?? "")}`,
          at: latestDraft.createdAt ?? null,
          href: "/note?view=review",
        });
      }
      const latestArticle = articles[0];
      if (latestArticle) {
        recent.push({
          id: `article-${latestArticle.id}`,
          label: `note下書き: ${truncate(latestArticle.title ?? "")}`,
          at: latestArticle.updatedAt ?? latestArticle.createdAt ?? null,
          href: "/note?view=review",
        });
      }
      const latestRec = (fund?.recommendations ?? [])[0];
      if (latestRec) {
        recent.push({
          id: `rec-${latestRec.id}`,
          label: `投資の判断メモ: ${latestRec.ticker ?? ""} ${latestRec.decision ?? ""}`.trim(),
          at: latestRec.evaluatedAt ?? null,
          href: "/investing",
        });
      }
      const latestCandidate = (knowledge?.items ?? [])[0];
      if (latestCandidate) {
        recent.push({
          id: `knowledge-${latestCandidate.path}`,
          label: `Knowledge候補: ${truncate(
            latestCandidate.frontmatter?.title ?? latestCandidate.frontmatter?.id ?? "無題"
          )}`,
          at: latestCandidate.frontmatter?.updated ?? latestCandidate.frontmatter?.created ?? null,
          href: "/knowledge",
        });
      }

      recent.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
      setActivity(recent.slice(0, 5));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { loading, stats, activity };
}
