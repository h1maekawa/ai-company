"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AffiliateLink,
  Brand,
  Channel,
  Genre,
  Idea,
  TeachingProgram,
} from "@/app/lib/note/types";

/* ─── ネタ帳 ───────────────────────────────────────── */

export function useIdeas() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const apply = (data: { genres?: Genre[]; ideas?: Idea[] }) => {
    if (data.genres) setGenres(data.genres);
    if (data.ideas) setIdeas(data.ideas);
  };

  const reload = useCallback(() => {
    fetch("/api/note/ideas")
      .then((r) => r.json())
      .then(apply)
      .catch(() => setError("ネタ帳の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  /** 朝会の完了タスクからネタを拾う */
  async function harvest() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/note/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "harvest" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      apply(data);
      setNotice(
        data.added > 0
          ? `${data.sourceDate}の完了タスクから${data.added}件のネタを拾いました`
          : data.doneCount === 0
            ? "完了したタスクがまだありません。朝会でタスクを終わらせると拾えます"
            : "新しく拾えるネタはありませんでした（既に取り込み済みです）"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ネタの取得に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function addIdea(idea: Partial<Idea>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/note/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", idea }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      apply(data);
      setNotice("ネタを追加しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function saveIdeas(next: Idea[]) {
    setIdeas(next);
    try {
      const response = await fetch("/api/note/ideas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      apply(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  return {
    genres,
    ideas,
    loading,
    busy,
    error,
    notice,
    harvest,
    addIdea,
    saveIdeas,
    clearNotice: () => setNotice(""),
  };
}

/* ─── アフィリエイト ───────────────────────────────── */

export function useAffiliates() {
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/note/affiliates")
      .then((r) => r.json())
      .then((data: { links?: AffiliateLink[] }) => setLinks(data.links ?? []))
      .catch(() => setError("案件の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function save(next: AffiliateLink[]) {
    setLinks(next);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/note/affiliates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLinks(data.links ?? next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return { links, loading, saving, error, save };
}

/* ─── ブランディング / チャネル / 教育プログラム ─────── */

export function useBrand() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [program, setProgram] = useState<TeachingProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const apply = (data: { brand?: Brand; channels?: Channel[]; program?: TeachingProgram }) => {
    if (data.brand) setBrand(data.brand);
    if (data.channels) setChannels(data.channels);
    if (data.program) setProgram(data.program);
  };

  useEffect(() => {
    fetch("/api/note/brand")
      .then((r) => r.json())
      .then(apply)
      .catch(() => setError("ブランド情報の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: {
    brand?: Partial<Brand>;
    channels?: Channel[];
    program?: TeachingProgram;
  }) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/note/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      apply(data);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** 指定した回の配信文をAIで作る */
  async function generateLesson(stepId: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/note/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      apply(data);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "配信文の生成に失敗しました");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { brand, channels, program, loading, saving, error, save, generateLesson };
}
