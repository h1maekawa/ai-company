"use client";

import { AtSign, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { Genre, XAccount } from "@/app/lib/note/types";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";

/**
 * X複数アカウントの管理。
 * どのジャンルをどのアカウントに出すかはここでの割り当てで決まる（AIには判断させない）。
 */
export function XAccounts({
  genres,
  accounts,
  loading,
  saving,
  error,
  onSave,
}: {
  genres: Genre[];
  accounts: XAccount[];
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (accounts: XAccount[]) => void;
}) {
  function update(id: string, patch: Partial<XAccount>) {
    onSave(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function toggleGenre(id: string, genreId: string) {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    const has = account.genreIds.includes(genreId);
    update(id, {
      genreIds: has
        ? account.genreIds.filter((g) => g !== genreId)
        : [...account.genreIds, genreId],
    });
  }

  function add() {
    const created: XAccount = {
      id: `x${Date.now().toString(36)}`,
      label: `Xアカウント${accounts.length + 1}`,
      handle: "",
      role: "",
      genreIds: [],
      nextStep: "note記事へ誘導",
      monetization: [],
      directAffiliate: false,
    };
    onSave([...accounts, created]);
  }

  const assignedGenreIds = new Set(accounts.flatMap((a) => a.genreIds));
  const unassigned = genres.filter((g) => !assignedGenreIds.has(g.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Xアカウント（複数運用）"
          hint="ジャンルごとにどちらのアカウントへ出すかをここで割り当てます。生成のたびにAIが判断するわけではありません"
          action={
            <button
              onClick={add}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand/85"
            >
              <Plus className="h-3.5 w-3.5" />
              アカウントを追加
            </button>
          }
        />
        {error && <p className="text-xs text-loss">{error}</p>}
        {saving && <p className="mt-1 text-[11px] text-sub">保存中…</p>}

        {unassigned.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            未割り当てのジャンルがあります: {unassigned.map((g) => g.label).join("、")}
            。「記事を作る」で選んでも、どのXアカウントにも投稿案が出ません
          </p>
        )}
      </Card>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AtSign className="h-7 w-7" />}
            title="アカウントがまだありません"
            description="「アカウントを追加」して、運用するXアカウントを登録してください。"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <AtSign className="h-3.5 w-3.5" />
                  </span>
                  <input
                    value={account.label}
                    onChange={(e) => update(account.id, { label: e.target.value })}
                    placeholder="呼び分け用の名前（例：実践記録アカウント）"
                    className="min-w-[10rem] flex-1 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-sm font-semibold text-white outline-none focus:border-brand/50"
                  />
                  <div className="flex items-center gap-1 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5">
                    <span className="text-xs text-sub">@</span>
                    <input
                      value={account.handle}
                      onChange={(e) => update(account.id, { handle: e.target.value.replace(/^@/, "") })}
                      placeholder="アカウント名"
                      className="w-28 bg-transparent text-xs text-white outline-none placeholder:text-sub/70"
                    />
                  </div>
                  <button
                    onClick={() => onSave(accounts.filter((a) => a.id !== account.id))}
                    aria-label="削除"
                    className="text-sub hover:text-loss"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-sub">役割・トーン</label>
                  <textarea
                    value={account.role}
                    onChange={(e) => update(account.id, { role: e.target.value })}
                    rows={2}
                    placeholder="例：日々の実践過程をそのまま出す、実名寄りの半匿名アカウント"
                    className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-sub">担当ジャンル（自動振り分け）</label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {genres.map((g) => {
                      const active = account.genreIds.includes(g.id);
                      const takenByOther = !active && assignedGenreIds.has(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => toggleGenre(account.id, g.id)}
                          disabled={takenByOther}
                          title={takenByOther ? "他のアカウントに割り当て済みです" : undefined}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? "border-transparent text-ink-base"
                              : takenByOther
                                ? "cursor-not-allowed border-hairline text-sub/40"
                                : "border-hairline text-sub hover:text-white"
                          }`}
                          style={active ? { backgroundColor: g.color } : undefined}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <input
                  value={account.nextStep}
                  onChange={(e) => update(account.id, { nextStep: e.target.value })}
                  placeholder="次の導線（例：note記事へ誘導 / 公式LINEへ誘導）"
                  className="w-full rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                />

                <div className="border-t border-hairline pt-3">
                  <label className="text-[10px] text-sub">
                    このアカウント自体での収益化方法（1行に1つ。例：X Premium収益分配、自分の教材紹介）
                  </label>
                  <textarea
                    value={account.monetization.join("\n")}
                    onChange={(e) =>
                      update(account.id, {
                        monetization: e.target.value.split("\n").filter((v) => v.trim() !== ""),
                      })
                    }
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                  />
                  <label className="mt-2 flex items-start gap-2 text-[11px] text-sub">
                    <input
                      type="checkbox"
                      checked={account.directAffiliate}
                      onChange={(e) => update(account.id, { directAffiliate: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span>
                      投稿本文に登録済みアフィリエイトリンクを直接入れることを許可する
                      <span className="block text-[10px] text-sub/70">
                        使った投稿には自動で「[PR]」を付けます。オフの間は誘導文言だけにし、URLは書きません
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
