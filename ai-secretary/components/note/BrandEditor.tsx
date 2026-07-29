"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { Brand } from "@/app/lib/note/types";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

/** 改行区切りのテキストエリアで配列を編集する */
function ListField({
  label,
  hint,
  value,
  onChange,
  rows = 4,
  warn,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  rows?: number;
  warn?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-300">{label}</label>
      {hint && <p className="text-[10px] leading-relaxed text-sub">{hint}</p>}
      <textarea
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").filter((v) => v.trim() !== ""))}
        rows={rows}
        className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-brand/50"
      />
      {warn && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-300">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {warn}
        </p>
      )}
    </div>
  );
}

/**
 * ブランディング / マーケティング戦略の編集。
 * ここに書いた内容が、記事・X・LINEを作るときの前提になる。
 */
export function BrandEditor({
  brand,
  loading,
  saving,
  error,
  onSave,
}: {
  brand: Brand | null;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (brand: Partial<Brand>) => void;
}) {
  const [draft, setDraft] = useState<Brand | null>(brand);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (brand && !dirty) setDraft(brand);
  }, [brand, dirty]);

  if (loading || !draft) return <Skeleton className="h-96 rounded-2xl" />;

  const set = (patch: Partial<Brand>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="ブランディング / マーケティング戦略"
          hint="記事・X投稿・LINE配信を作るとき、AIは必ずここを前提にします"
          action={
            <button
              onClick={() => {
                onSave(draft);
                setDirty(false);
              }}
              disabled={saving || !dirty}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85 disabled:opacity-40"
            >
              {saving ? "保存中…" : dirty ? "保存する" : "保存済み"}
            </button>
          }
        />
        {error && <p className="text-xs text-loss">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-slate-300">コンセプト</label>
            <input
              value={draft.concept}
              onChange={(e) => set({ concept: e.target.value })}
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300">読者（誰に向けるか）</label>
            <input
              value={draft.targetReader}
              onChange={(e) => set({ targetReader: e.target.value })}
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
          </div>

          <ListField
            label="読者の悩み"
            hint="1行に1つ。記事の書き出しはここから作られます"
            value={draft.painPoints}
            onChange={(painPoints) => set({ painPoints })}
          />

          <ListField
            label="教えること"
            hint="1行に1つ。公式LINEのカリキュラムもここに沿います"
            value={draft.teaches}
            onChange={(teaches) => set({ teaches })}
          />

          <ListField
            label="語れる根拠（実体験・実績）"
            hint="1行に1つ。実際にやったこと・数字だけを書いてください"
            value={draft.credibility}
            onChange={(credibility) => set({ credibility })}
            warn={
              draft.credibility.length === 0
                ? "ここが空の間、AIは収益額や成果を一切書きません（根拠のない実績を書かせないため）"
                : undefined
            }
          />

          <div>
            <label className="text-[11px] font-semibold text-slate-300">トーン</label>
            <textarea
              value={draft.tone}
              onChange={(e) => set({ tone: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
          </div>

          <ListField
            label="書かないこと"
            hint="1行に1つ。AIはこれを禁止事項として扱います"
            value={draft.ngList}
            onChange={(ngList) => set({ ngList })}
          />

          <ListField
            label="収益導線"
            hint="上から順に、読者をどう動かすか"
            value={draft.funnel}
            onChange={(funnel) => set({ funnel })}
            rows={5}
          />
        </div>
      </Card>
    </div>
  );
}
