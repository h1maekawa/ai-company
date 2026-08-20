"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CANONICAL_DOMAINS } from "@/app/lib/knowledge/domain";

type Candidate = {
  path: string;
  frontmatter: {
    id: string;
    status: string;
    source: string;
    created: string;
    updated: string;
    title?: string;
    domain_candidates?: string[];
    domain_resolution_required?: boolean;
    tags?: string[];
    duplicate_candidates?: string[];
    conflict_candidates?: string[];
    recommended_action?: string;
    promotion_targets?: string[];
    promoted_to?: string;
  };
  body: string;
};

const ACTION_LABEL: Record<string, string> = {
  promote: "昇格",
  merge: "統合",
  hold: "保留",
  reject: "破棄",
};

export default function WeeklyReviewPage() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [domainSel, setDomainSel] = useState<Record<string, string>>({});
  const [targetSel, setTargetSel] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/candidates");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "取得に失敗しました");
      const list: Candidate[] = json.items ?? [];
      setItems(list);
      // domain初期値: 最初のdomain候補
      const d: Record<string, string> = {};
      const t: Record<string, string> = {};
      for (const it of list) {
        d[it.path] = it.frontmatter.domain_candidates?.[0] ?? "";
        t[it.path] = it.frontmatter.promotion_targets?.[0] ?? "";
      }
      setDomainSel(d);
      setTargetSel(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (item: Candidate, action: "promote" | "merge" | "hold" | "reject") => {
    setBusy(item.path);
    setError(null);
    setFlash(null);
    try {
      const payload: Record<string, unknown> = { path: item.path, action };
      if (action === "promote") {
        const domain = domainSel[item.path];
        if (!domain) throw new Error("昇格には domain の確定が必要です。");
        payload.domain = domain;
        payload.title = item.frontmatter.title;
        payload.tags = item.frontmatter.tags ?? [];
      }
      if (action === "merge") {
        const targetPath = targetSel[item.path];
        if (!targetPath) throw new Error("統合先を選択してください。");
        payload.targetPath = targetPath;
      }
      const res = await fetch("/api/knowledge/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "処理に失敗しました");
      setFlash(
        action === "promote"
          ? `昇格しました → ${json.knowledgePath}`
          : action === "merge"
            ? `統合しました → ${json.targetPath}`
            : `「${ACTION_LABEL[action]}」を記録しました`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Weekly Review — Knowledge昇格</h1>
            <p className="mt-1 text-xs text-slate-400">
              Inboxに溜まったCandidateを確認し、昇格 / 統合 / 保留 / 破棄を選びます。
              昇格したものだけが正式Knowledge（Human Managed）になります。
            </p>
          </div>
          <Link href="/" className="text-xs text-blue-400 hover:underline">
            ホームへ
          </Link>
        </div>

        {flash && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {flash}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-sm text-slate-300">レビュー待ちのCandidateはありません。</p>
            <p className="mt-1 text-xs text-slate-500">
              会話や調査から <code className="text-slate-300">/api/knowledge/capture</code> でCaptureすると、ここに整理済み候補が並びます。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              const fm = it.frontmatter;
              const needDomain = fm.domain_resolution_required || (fm.domain_candidates?.length ?? 0) === 0;
              return (
                <section key={it.path} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-100">{fm.title || fm.id}</h2>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                      {fm.status} · {fm.source}
                    </span>
                  </div>

                  <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                    {it.body.length > 400 ? it.body.slice(0, 400) + "…" : it.body}
                  </p>

                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {(fm.tags ?? []).map((t) => (
                      <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                        #{t}
                      </span>
                    ))}
                  </div>

                  {fm.recommended_action && (
                    <p className="mb-2 text-[11px] text-slate-400">
                      AI推奨: <span className="font-semibold text-slate-200">{ACTION_LABEL[fm.recommended_action] ?? fm.recommended_action}</span>
                    </p>
                  )}

                  {(fm.duplicate_candidates?.length ?? 0) > 0 && (
                    <p className="mb-2 text-[11px] text-amber-300">
                      重複候補: {fm.duplicate_candidates!.length}件（統合を検討）
                    </p>
                  )}
                  {(fm.conflict_candidates?.length ?? 0) > 0 && (
                    <p className="mb-2 text-[11px] text-rose-300">
                      矛盾候補: {fm.conflict_candidates!.length}件
                    </p>
                  )}

                  {/* domain選択（昇格に必須） */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-slate-400">domain:</label>
                    <select
                      value={domainSel[it.path] ?? ""}
                      onChange={(e) => setDomainSel((s) => ({ ...s, [it.path]: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                    >
                      <option value="">（未確定）</option>
                      {CANONICAL_DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {needDomain && !domainSel[it.path] && (
                      <span className="text-[10px] text-amber-300">昇格にはdomain確定が必要</span>
                    )}
                  </div>

                  {/* 統合先選択 */}
                  {(fm.promotion_targets?.length ?? 0) > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <label className="text-[11px] text-slate-400">統合先:</label>
                      <select
                        value={targetSel[it.path] ?? ""}
                        onChange={(e) => setTargetSel((s) => ({ ...s, [it.path]: e.target.value }))}
                        className="max-w-full truncate rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                      >
                        <option value="">（選択）</option>
                        {fm.promotion_targets!.map((p) => (
                          <option key={p} value={p}>
                            {p.replace(/^memory\/knowledge\//, "")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy === it.path || !domainSel[it.path]}
                      onClick={() => act(it, "promote")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      昇格
                    </button>
                    <button
                      disabled={busy === it.path || (fm.promotion_targets?.length ?? 0) === 0 || !targetSel[it.path]}
                      onClick={() => act(it, "merge")}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                      統合
                    </button>
                    <button
                      disabled={busy === it.path}
                      onClick={() => act(it, "hold")}
                      className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-40"
                    >
                      保留
                    </button>
                    <button
                      disabled={busy === it.path}
                      onClick={() => act(it, "reject")}
                      className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                    >
                      破棄
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
