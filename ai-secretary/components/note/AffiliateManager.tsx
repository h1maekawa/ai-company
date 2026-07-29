"use client";

import { Link2, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { AffiliateLink, Genre } from "@/app/lib/note/types";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";

/**
 * アフィリエイト案件の手入力管理。
 * URLはここで貼り付けたものだけが記事に入る（AIには作らせない）。
 */
export function AffiliateManager({
  genres,
  links,
  loading,
  saving,
  error,
  onSave,
}: {
  genres: Genre[];
  links: AffiliateLink[];
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (links: AffiliateLink[]) => void;
}) {
  function update(id: string, patch: Partial<AffiliateLink>) {
    onSave(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function add() {
    const created: AffiliateLink = {
      id: `aff${Date.now().toString(36)}`,
      genreId: genres[0]?.id ?? "",
      programName: "新しい案件",
      serviceName: "",
      url: "",
      ctaText: "詳しく見る",
      placement: "",
      active: true,
      createdAt: new Date().toISOString(),
    };
    onSave([created, ...links]);
  }

  const missingUrl = links.filter((l) => l.active && !l.url).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="アフィリエイト案件"
          hint="リンクはAPIで取得できないため手入力です。ここに貼ったURLだけが記事に使われます"
          action={
            <button
              onClick={add}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand/85"
            >
              <Plus className="h-3.5 w-3.5" />
              案件を追加
            </button>
          }
        />

        <div className="space-y-1.5 text-[11px] leading-relaxed text-sub">
          <p>・URLが空の案件は記事に挿入されません（AIにリンクを作らせないため）</p>
          <p>・アフィリエイトを含む記事には「※本記事にはプロモーションが含まれます」を自動で付けます</p>
          <p>・ジャンルが一致する案件だけが、その記事の候補になります</p>
        </div>

        {missingUrl > 0 && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            URL未登録の案件が{missingUrl}件あります。貼り付けるまで記事には出ません
          </p>
        )}
        {error && <p className="mt-2 text-xs text-loss">{error}</p>}
        {saving && <p className="mt-2 text-[11px] text-sub">保存中…</p>}
      </Card>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : links.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Link2 className="h-7 w-7" />}
            title="案件がまだありません"
            description="「案件を追加」して、A8などで取得したリンクを貼り付けてください。"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const genre = genres.find((g) => g.id === link.genreId);
            return (
              <Card key={link.id} className={link.active ? "" : "opacity-60"}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={link.programName}
                      onChange={(e) => update(link.id, { programName: e.target.value })}
                      placeholder="案件名"
                      className="min-w-[10rem] flex-1 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-sm font-semibold text-white outline-none focus:border-brand/50"
                    />
                    <select
                      value={link.genreId}
                      onChange={(e) => update(link.id, { genreId: e.target.value })}
                      className="rounded-lg border border-hairline bg-ink-card px-2 py-1.5 text-xs outline-none"
                      style={{ color: genre?.color ?? "#94A3B8" }}
                    >
                      {genres.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-[11px] text-sub">
                      <input
                        type="checkbox"
                        checked={link.active}
                        onChange={(e) => update(link.id, { active: e.target.checked })}
                      />
                      有効
                    </label>
                    <button
                      onClick={() => onSave(links.filter((l) => l.id !== link.id))}
                      aria-label="削除"
                      className="text-sub hover:text-loss"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={link.serviceName}
                      onChange={(e) => update(link.id, { serviceName: e.target.value })}
                      placeholder="サービス名"
                      className="rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                    />
                    <input
                      value={link.ctaText}
                      onChange={(e) => update(link.id, { ctaText: e.target.value })}
                      placeholder="ボタン文言（例：無料相談を見る）"
                      className="rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-sub">
                      アフィリエイトURL（ここに貼り付けたものだけが使われます）
                    </label>
                    <input
                      value={link.url}
                      onChange={(e) => update(link.id, { url: e.target.value })}
                      placeholder="https://..."
                      className={`mt-1 w-full rounded-lg border bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs outline-none ${
                        link.url
                          ? "border-gain/30 text-gain"
                          : "border-amber-500/40 text-amber-300 placeholder:text-amber-300/40"
                      }`}
                    />
                  </div>

                  <input
                    value={link.placement}
                    onChange={(e) => update(link.id, { placement: e.target.value })}
                    placeholder="どういう文脈で出すと自然か（例：始め方記事の最後）"
                    className="w-full rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
