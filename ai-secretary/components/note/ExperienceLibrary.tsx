"use client";

import { useState } from "react";
import { BookOpen, Plus, Sparkles, Trash2 } from "lucide-react";
import { DEFAULT_GENRES } from "@/app/lib/note/types";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useExperiences } from "@/app/note/useResearch";

/**
 * 体験ライブラリ。
 * ここに無いことは体験談として書かせない。
 * 本人確認（verifiedByUser）がONのものだけ断定的に書ける。
 */
export function ExperienceLibrary() {
  const state = useExperiences();
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const verified = state.experiences.filter((e) => e.verifiedByUser).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="体験ライブラリ"
          hint={`${state.experiences.length}件（本人確認済み ${verified}件）`}
          action={
            <button
              onClick={state.harvest}
              disabled={state.busy}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand/85 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {state.busy ? "取り込み中…" : "朝会から取り込む"}
            </button>
          }
        />
        {state.notice && <p className="text-xs text-gain">{state.notice}</p>}
        {state.error && <p className="text-xs text-loss">{state.error}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-sub">
          記事の説得力はここから来ます。
          <span className="text-amber-300">
            本人確認がOFFの体験は、断定的な体験談としては使われません
          </span>
          （「〜と思います」程度に留められます）。
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="実際にやったこと（例：ChatGPTで振り返りの質問を3つに絞った）"
            className="min-w-[16rem] flex-1 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
          />
          <button
            onClick={() => {
              if (!title.trim()) return;
              state.add({ title });
              setTitle("");
            }}
            disabled={state.busy || !title.trim()}
            className="flex items-center gap-1.5 rounded-xl border border-hairline px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            追加
          </button>
        </div>
      </Card>

      {state.loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : state.experiences.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="h-7 w-7" />}
            title="体験がまだありません"
            description="「朝会から取り込む」で実際に完了したタスクから拾うか、上のフォームで直接追加できます。"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {state.experiences.map((e) => {
            const expanded = open === e.id;
            return (
              <Card key={e.id} padded={false}>
                <div className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <input
                      value={e.title}
                      onChange={(ev) => state.update(e.id, { title: ev.target.value })}
                      className="w-full bg-transparent text-sm font-medium text-white outline-none"
                    />
                    <p className="mt-0.5 text-[11px] text-sub">
                      {e.summary || "（概要未記入）"}
                      {e.sourceType === "morning-task" && " ・朝会より"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {DEFAULT_GENRES.map((g) => (
                        <button
                          key={g.id}
                          onClick={() =>
                            state.update(e.id, {
                              genres: e.genres.includes(g.id)
                                ? e.genres.filter((x) => x !== g.id)
                                : [...e.genres, g.id],
                            })
                          }
                          className="rounded-full border px-2 py-0.5 text-[10px]"
                          style={
                            e.genres.includes(g.id)
                              ? { backgroundColor: g.color, borderColor: "transparent", color: "#0B1220" }
                              : { borderColor: "rgba(255,255,255,0.1)", color: "#94A3B8" }
                          }
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <label
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${
                        e.verifiedByUser ? "bg-gain/15 text-gain" : "text-amber-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={e.verifiedByUser}
                        onChange={(ev) => state.update(e.id, { verifiedByUser: ev.target.checked })}
                      />
                      本人確認
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setOpen(expanded ? null : e.id)}
                        className="rounded-lg border border-hairline px-2 py-1 text-[11px] text-sub hover:text-white"
                      >
                        {expanded ? "閉じる" : "詳しく"}
                      </button>
                      <button
                        onClick={() => state.remove(e.id)}
                        aria-label="削除"
                        className="text-sub hover:text-loss"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="space-y-2 border-t border-hairline px-4 py-3">
                    <Field
                      label="概要"
                      value={e.summary}
                      onChange={(v) => state.update(e.id, { summary: v })}
                    />
                    <Field
                      label="起きたこと"
                      value={e.whatHappened}
                      onChange={(v) => state.update(e.id, { whatHappened: v })}
                    />
                    <Field
                      label="試したこと"
                      value={e.whatWasTried}
                      onChange={(v) => state.update(e.id, { whatWasTried: v })}
                    />
                    <Field
                      label="うまくいったこと"
                      value={e.whatWorked ?? ""}
                      onChange={(v) => state.update(e.id, { whatWorked: v })}
                    />
                    <Field
                      label="うまくいかなかったこと"
                      value={e.whatDidNotWork ?? ""}
                      onChange={(v) => state.update(e.id, { whatDidNotWork: v })}
                    />
                    <Field
                      label="学び"
                      value={e.lesson ?? ""}
                      onChange={(v) => state.update(e.id, { lesson: v })}
                    />
                    <div>
                      <label className="text-[10px] text-sub">
                        記事に使える事実（1行に1つ。数字を書くのは事実だけ）
                      </label>
                      <textarea
                        value={e.reusableFacts.join("\n")}
                        onChange={(ev) =>
                          state.update(e.id, {
                            reusableFacts: ev.target.value.split("\n").filter((v) => v.trim()),
                          })
                        }
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-2 py-1.5 text-xs text-white outline-none focus:border-brand/50"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-sub">
                      <input
                        type="checkbox"
                        checked={e.sensitive}
                        onChange={(ev) => state.update(e.id, { sensitive: ev.target.checked })}
                      />
                      機微な内容（記事の生成には一切使わない）
                    </label>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-sub">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-2 py-1.5 text-xs text-white outline-none focus:border-brand/50"
      />
    </div>
  );
}
