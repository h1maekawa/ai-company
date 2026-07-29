"use client";

import { useState } from "react";
import { Lightbulb, Sparkles, Trash2 } from "lucide-react";
import {
  Genre,
  Idea,
  IdeaStatus,
  IDEA_STATUS_LABELS,
} from "@/app/lib/note/types";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";

const STATUS_ORDER: IdeaStatus[] = ["inbox", "planned", "drafted", "published"];

/**
 * ネタ帳。朝会で実際に完了したタスクからAIが記事候補を拾い、
 * ジャンル別に並べる。手動追加もここから行う。
 */
export function IdeaInbox({
  genres,
  ideas,
  loading,
  busy,
  error,
  notice,
  onHarvest,
  onAdd,
  onSave,
  onWrite,
}: {
  genres: Genre[];
  ideas: Idea[];
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  onHarvest: () => void;
  onAdd: (idea: Partial<Idea>) => void;
  onSave: (ideas: Idea[]) => void;
  /** そのネタで記事を書く（Creator Workflowへ渡す） */
  onWrite: (idea: Idea) => void;
}) {
  const [title, setTitle] = useState("");
  const [genreId, setGenreId] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const visible = filter ? ideas.filter((i) => i.genreId === filter) : ideas;

  function updateStatus(id: string, status: IdeaStatus) {
    onSave(ideas.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  function remove(id: string) {
    onSave(ideas.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* 朝会から拾う */}
      <Card>
        <CardHeader
          title="朝会からネタを拾う"
          hint="実際に完了したタスクだけが対象です（やっていないことは記事にしません）"
          action={
            <button
              onClick={onHarvest}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {busy ? "探しています…" : "ネタを探す"}
            </button>
          }
        />
        {notice && <p className="text-xs text-gain">{notice}</p>}
        {error && <p className="text-xs text-loss">{error}</p>}
      </Card>

      {/* 手動追加 */}
      <Card>
        <CardHeader title="ネタを手で追加" />
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="思いついたネタ（例：AIで議事録を自動化した話）"
            className="min-w-[16rem] flex-1 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
          />
          <select
            value={genreId || genres[0]?.id || ""}
            onChange={(e) => setGenreId(e.target.value)}
            className="rounded-xl border border-hairline bg-ink-card px-3 py-2 text-sm text-white outline-none"
          >
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!title.trim()) return;
              onAdd({ title, genreId: genreId || genres[0]?.id });
              setTitle("");
            }}
            disabled={busy || !title.trim()}
            className="rounded-xl border border-hairline px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-40"
          >
            追加
          </button>
        </div>
      </Card>

      {/* ジャンルで絞り込む */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter(null)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            filter === null ? "bg-brand text-white" : "text-sub hover:bg-white/5 hover:text-white"
          }`}
        >
          すべて {ideas.length}
        </button>
        {genres.map((g) => {
          const count = ideas.filter((i) => i.genreId === g.id).length;
          const active = filter === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setFilter(g.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                active
                  ? { backgroundColor: g.color, color: "#0B1220" }
                  : { color: g.color, backgroundColor: `${g.color}14` }
              }
            >
              {g.label} {count}
            </button>
          );
        })}
      </div>

      {/* 一覧 */}
      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lightbulb className="h-7 w-7" />}
            title="ネタがまだありません"
            description="「ネタを探す」で朝会の完了タスクから拾うか、上のフォームで直接追加できます。"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {STATUS_ORDER.map((status) => {
            const rows = visible.filter((i) => i.status === status);
            if (rows.length === 0) return null;
            return (
              <Card key={status} padded={false}>
                <div className="px-5 pt-5">
                  <CardHeader title={`${IDEA_STATUS_LABELS[status]}（${rows.length}）`} />
                </div>
                <ul className="divide-y divide-hairline/60">
                  {rows.map((idea) => {
                    const genre = genres.find((g) => g.id === idea.genreId);
                    return (
                      <li key={idea.id} className="group px-5 py-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">{idea.title}</p>
                            {idea.takeaway && (
                              <p className="mt-0.5 text-[11px] text-sub">→ {idea.takeaway}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {genre && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{ color: genre.color, backgroundColor: `${genre.color}1a` }}
                                >
                                  {genre.label}
                                </span>
                              )}
                              {idea.source === "morning" && idea.sourceDate && (
                                <span
                                  className="text-[10px] text-sub"
                                  title={`元タスク: ${idea.sourceTask ?? ""}`}
                                >
                                  ↩️ {idea.sourceDate}の朝会
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => onWrite(idea)}
                              className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand/85"
                            >
                              書く
                            </button>
                            <select
                              value={idea.status}
                              onChange={(e) => updateStatus(idea.id, e.target.value as IdeaStatus)}
                              className="rounded-lg border border-hairline bg-ink-card px-1.5 py-1 text-[11px] text-sub outline-none"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {IDEA_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => remove(idea.id)}
                              aria-label="削除"
                              className="text-sub opacity-0 transition-opacity hover:text-loss group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
