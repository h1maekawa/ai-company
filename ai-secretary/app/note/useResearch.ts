"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ExperienceEntry,
  FeatureFlags,
  NoteArticleDraft,
  PublishJob,
  ReferenceNoteCreator,
  ReferenceXAccount,
  ResearchItem,
  SocialDraft,
  TrendCluster,
  XResearchSettings,
} from "@/app/lib/note/research/types";

type ClusterWithSources = TrendCluster & {
  items: ResearchItem[];
  experiences: ExperienceEntry[];
};

/* ─── 参考アカウント ───────────────────── */

export function useReferences() {
  const [xAccounts, setXAccounts] = useState<ReferenceXAccount[]>([]);
  const [noteCreators, setNoteCreators] = useState<ReferenceNoteCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/note/research/references")
      .then((r) => r.json())
      .then((d) => {
        setXAccounts(d.xAccounts ?? []);
        setNoteCreators(d.noteCreators ?? []);
      })
      .catch(() => setError("参考アカウントの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function save(next: {
    xAccounts?: ReferenceXAccount[];
    noteCreators?: ReferenceNoteCreator[];
  }) {
    setXAccounts(next.xAccounts ?? xAccounts);
    setNoteCreators(next.noteCreators ?? noteCreators);
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/note/research/references", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xAccounts: next.xAccounts ?? xAccounts,
          noteCreators: next.noteCreators ?? noteCreators,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setXAccounts(data.xAccounts ?? []);
      setNoteCreators(data.noteCreators ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return { xAccounts, noteCreators, loading, saving, error, save };
}

/* ─── 候補 ───────────────────────────── */

export function useCandidates() {
  const [clusters, setClusters] = useState<ClusterWithSources[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(() => {
    return fetch("/api/note/research/candidates")
      .then((r) => r.json())
      .then((d) => setClusters(d.clusters ?? []))
      .catch(() => setError("候補の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runResearch() {
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/note/research/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const parts = [
        `新しく${data.newItems}件を取り込みました（取得 ${data.fetched}件）`,
        data.xSkippedReason ? `X: ${data.xSkippedReason}` : "",
        data.failures?.length > 0
          ? `取得できなかったソース ${data.failures.length}件（他は続行しました）`
          : "",
      ].filter(Boolean);
      setNotice(parts.join(" / "));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "リサーチに失敗しました");
    } finally {
      setRunning(false);
    }
  }

  async function setStatus(id: string, status: TrendCluster["status"]) {
    setClusters((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    await fetch("/api/note/research/candidates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => setError("状態の更新に失敗しました"));
  }

  async function generate(
    clusterId: string,
    kind: "x" | "note" | "both",
    articleType: "free" | "paid" = "free"
  ) {
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/note/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId, kind, articleType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const parts = [
        data.xDrafts ? `X投稿案 ${data.xDrafts.length}件` : "",
        data.article ? `note記事「${data.article.title}」` : "",
        data.noteError ? `note: ${data.noteError}` : "",
        data.xWarning ?? "",
        data.noteWarning ?? "",
      ].filter(Boolean);
      setNotice(parts.join(" / ") || "作成しました");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return {
    clusters,
    loading,
    running,
    error,
    notice,
    runResearch,
    setStatus,
    generate,
    reload,
    clearNotice: () => setNotice(""),
  };
}

/* ─── 体験ライブラリ ───────────────────── */

export function useExperiences() {
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(() => {
    return fetch("/api/note/experiences")
      .then((r) => r.json())
      .then((d) => setExperiences(d.experiences ?? []))
      .catch(() => setError("体験の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(experience: Partial<ExperienceEntry>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/note/experiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", experience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExperiences(data.experiences ?? []);
      setNotice("体験を追加しました（本人確認をONにすると断定的に書けます）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function harvest() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/note/experiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "harvest" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExperiences(data.experiences ?? []);
      setNotice(
        data.added > 0
          ? `${data.sourceDate}の完了タスクから${data.added}件を取り込みました。中身を埋めて本人確認をONにしてください`
          : data.doneCount === 0
            ? "完了したタスクがまだありません"
            : "新しく取り込めるタスクはありませんでした"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: Partial<ExperienceEntry>) {
    setExperiences((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      const res = await fetch("/api/note/experiences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExperiences(data.experiences ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    }
  }

  async function remove(id: string) {
    const next = experiences.filter((e) => e.id !== id);
    setExperiences(next);
    await fetch("/api/note/experiences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiences: next }),
    }).catch(() => setError("削除に失敗しました"));
  }

  return {
    experiences,
    loading,
    busy,
    error,
    notice,
    add,
    harvest,
    update,
    remove,
    clearNotice: () => setNotice(""),
  };
}

/* ─── 投稿キュー ───────────────────────── */

export function usePublishQueue() {
  const [articles, setArticles] = useState<NoteArticleDraft[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [socialDrafts, setSocialDrafts] = useState<SocialDraft[]>([]);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(() => {
    return fetch("/api/note/publishing/queue")
      .then((r) => r.json())
      .then((d) => {
        setArticles(d.articles ?? []);
        setJobs(d.jobs ?? []);
        setSocialDrafts(d.socialDrafts ?? []);
        setFlags(d.flags ?? null);
      })
      .catch(() => setError("キューの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function sendToBuffer(
    draftId: string,
    mode: "saveToDraft" | "addToQueue" | "customScheduled",
    scheduledAt?: string
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/note/publishing/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, mode, scheduledAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, data.hint].filter(Boolean).join(" / "));
      setNotice(
        data.deduped
          ? "同じ操作が既に実行済みでした"
          : mode === "saveToDraft"
            ? "Bufferへ下書き保存しました"
            : "Bufferへ予約しました"
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bufferへの送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function updateArticle(articleId: string, patch: Partial<NoteArticleDraft>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/note/publishing/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setArticles(data.articles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function queueNoteJob(articleId: string, kind: "note-draft" | "note-publish") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/note/publishing/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(
        data.deduped ? "既に受付済みです" : "ジョブを登録しました（Macのランナーが取りに来ます）"
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ジョブの登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return {
    articles,
    jobs,
    socialDrafts,
    flags,
    loading,
    busy,
    error,
    notice,
    sendToBuffer,
    updateArticle,
    queueNoteJob,
    reload,
    clearNotice: () => setNotice(""),
  };
}

/* ─── リサーチ設定 ───────────────────── */

export function useResearchSettings() {
  const [x, setX] = useState<XResearchSettings | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/note/research/settings")
      .then((r) => r.json())
      .then((d) => {
        setX(d.x ?? null);
        setFlags(d.flags ?? null);
        setNoteTags(d.noteTags ?? []);
      })
      .catch(() => setError("設定の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: {
    x?: Partial<XResearchSettings>;
    flags?: Partial<FeatureFlags>;
    noteTags?: string[];
  }) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/note/research/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setX(data.x ?? null);
      setFlags(data.flags ?? null);
      setNoteTags(data.noteTags ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return { x, flags, noteTags, loading, saving, error, save };
}
