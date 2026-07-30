"use client";

import { AtSign, NotebookPen, Plus, Trash2 } from "lucide-react";
import { DEFAULT_GENRES } from "@/app/lib/note/types";
import type {
  Priority,
  ReferenceNoteCreator,
  ReferenceXAccount,
} from "@/app/lib/note/research/types";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { useReferences } from "@/app/note/useResearch";

const PRIORITIES: Priority[] = [1, 2, 3];

/** リサーチの参考にするX・noteアカウントの管理 */
export function ReferenceAccounts() {
  const state = useReferences();

  function addX() {
    const now = new Date().toISOString();
    state.save({
      xAccounts: [
        {
          id: `rx${Date.now().toString(36)}`,
          handle: "",
          profileUrl: "",
          genres: [],
          reason: "",
          active: true,
          priority: 2,
          createdAt: now,
          updatedAt: now,
        },
        ...state.xAccounts,
      ],
    });
  }

  function addCreator() {
    const now = new Date().toISOString();
    state.save({
      noteCreators: [
        {
          id: `rn${Date.now().toString(36)}`,
          name: "",
          creatorUrl: "",
          genres: [],
          reason: "",
          active: true,
          priority: 2,
          createdAt: now,
          updatedAt: now,
        },
        ...state.noteCreators,
      ],
    });
  }

  const updateX = (id: string, patch: Partial<ReferenceXAccount>) =>
    state.save({ xAccounts: state.xAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const updateCreator = (id: string, patch: Partial<ReferenceNoteCreator>) =>
    state.save({
      noteCreators: state.noteCreators.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

  const toggleGenre = (current: string[], genreId: string) =>
    current.includes(genreId) ? current.filter((g) => g !== genreId) : [...current, genreId];

  if (state.loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="参考アカウント"
          hint="ここに登録したアカウントだけをリサーチします。まえみち自身は対象にしません"
        />
        {state.error && <p className="text-xs text-loss">{state.error}</p>}
        {state.saving && <p className="text-[11px] text-sub">保存中…</p>}
        <p className="text-[11px] leading-relaxed text-sub">
          他者の文章をそのまま保存・再利用することはありません。
          反応された理由の「型」だけを抽出して、まえみちの言葉で書き直します。
        </p>
      </Card>

      {/* X */}
      <Card>
        <CardHeader
          title="Xの参考アカウント"
          hint={`${state.xAccounts.filter((a) => a.active).length}件が有効`}
          action={
            <button
              onClick={addX}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand/85"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          }
        />
        <div className="space-y-3">
          {state.xAccounts.length === 0 && (
            <p className="text-[11px] text-sub">まだありません。10件程度から始めるのがおすすめです。</p>
          )}
          {state.xAccounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <AtSign className="h-3 w-3" />
                </span>
                <input
                  value={a.handle}
                  onChange={(e) => updateX(a.id, { handle: e.target.value.replace(/^@/, "") })}
                  placeholder="アカウント名（@なし）"
                  className="w-40 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none focus:border-brand/50"
                />
                <input
                  value={a.displayName ?? ""}
                  onChange={(e) => updateX(a.id, { displayName: e.target.value })}
                  placeholder="表示名（任意）"
                  className="w-32 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none focus:border-brand/50"
                />
                <select
                  value={a.priority}
                  onChange={(e) => updateX(a.id, { priority: Number(e.target.value) as Priority })}
                  className="rounded-lg border border-hairline bg-ink-card px-2 py-1 text-xs text-white outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      優先度{p}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-sub">
                  <input
                    type="checkbox"
                    checked={a.active}
                    onChange={(e) => updateX(a.id, { active: e.target.checked })}
                  />
                  有効
                </label>
                <button
                  onClick={() => state.save({ xAccounts: state.xAccounts.filter((x) => x.id !== a.id) })}
                  aria-label="削除"
                  className="ml-auto text-sub hover:text-loss"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {DEFAULT_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => updateX(a.id, { genres: toggleGenre(a.genres, g.id) })}
                    className="rounded-full border px-2 py-0.5 text-[10px] transition-colors"
                    style={
                      a.genres.includes(g.id)
                        ? { backgroundColor: g.color, borderColor: "transparent", color: "#0B1220" }
                        : { borderColor: "rgba(255,255,255,0.1)", color: "#94A3B8" }
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <input
                value={a.reason}
                onChange={(e) => updateX(a.id, { reason: e.target.value })}
                placeholder="なぜ参考にするか（例：同ジャンルで実践記録の見せ方がうまい）"
                className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* note */}
      <Card>
        <CardHeader
          title="noteの参考クリエイター"
          hint={`${state.noteCreators.filter((c) => c.active).length}件が有効`}
          action={
            <button
              onClick={addCreator}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand/85"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          }
        />
        <div className="space-y-3">
          {state.noteCreators.length === 0 && (
            <p className="text-[11px] text-sub">まだありません。</p>
          )}
          {state.noteCreators.map((c) => (
            <div key={c.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gain/10 text-gain">
                  <NotebookPen className="h-3 w-3" />
                </span>
                <input
                  value={c.name}
                  onChange={(e) => updateCreator(c.id, { name: e.target.value })}
                  placeholder="クリエイター名"
                  className="w-36 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none focus:border-brand/50"
                />
                <input
                  value={c.creatorUrl}
                  onChange={(e) => updateCreator(c.id, { creatorUrl: e.target.value })}
                  placeholder="https://note.com/xxxx"
                  className="min-w-[12rem] flex-1 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 font-mono text-xs text-white outline-none focus:border-brand/50"
                />
                <select
                  value={c.priority}
                  onChange={(e) =>
                    updateCreator(c.id, { priority: Number(e.target.value) as Priority })
                  }
                  className="rounded-lg border border-hairline bg-ink-card px-2 py-1 text-xs text-white outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      優先度{p}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-sub">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) => updateCreator(c.id, { active: e.target.checked })}
                  />
                  有効
                </label>
                <button
                  onClick={() =>
                    state.save({ noteCreators: state.noteCreators.filter((n) => n.id !== c.id) })
                  }
                  aria-label="削除"
                  className="ml-auto text-sub hover:text-loss"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {DEFAULT_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => updateCreator(c.id, { genres: toggleGenre(c.genres, g.id) })}
                    className="rounded-full border px-2 py-0.5 text-[10px] transition-colors"
                    style={
                      c.genres.includes(g.id)
                        ? { backgroundColor: g.color, borderColor: "transparent", color: "#0B1220" }
                        : { borderColor: "rgba(255,255,255,0.1)", color: "#94A3B8" }
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <input
                value={c.reason}
                onChange={(e) => updateCreator(c.id, { reason: e.target.value })}
                placeholder="なぜ参考にするか"
                className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
