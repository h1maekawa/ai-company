"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { Brand } from "@/app/lib/note/types";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { BrandPreview } from "./BrandPreview";

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

function TextField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-300">{label}</label>
      {hint && <p className="text-[10px] leading-relaxed text-sub">{hint}</p>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
      />
    </div>
  );
}

function TextAreaField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-300">{label}</label>
      {hint && <p className="text-[10px] leading-relaxed text-sub">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-brand/50"
      />
    </div>
  );
}

function ColorField({
  label,
  hex,
  onChange,
}: {
  label: string;
  hex: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-sub">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1.5">
        <span className="h-5 w-5 shrink-0 rounded-full border border-white/10" style={{ backgroundColor: hex }} />
        <input
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-xs text-white outline-none"
        />
      </div>
    </div>
  );
}

/**
 * ブランディング編集画面。6セクションに分けている:
 * 基本情報 / プロフィール / 人格・口調 / 読者・発信内容 / 収益導線 / ビジュアル
 * ここに書いた内容が、記事・X・LINEを作るときAIの前提になる。
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
  const setIdentity = (patch: Partial<Brand["identity"]>) =>
    set({ identity: { ...draft.identity, ...patch } });
  const setPersonality = (patch: Partial<Brand["personality"]>) =>
    set({ personality: { ...draft.personality, ...patch } });
  const setVisual = (patch: Partial<Brand["visualIdentity"]>) =>
    set({ visualIdentity: { ...draft.visualIdentity, ...patch } });

  const SaveButton = (
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
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-loss">{error}</p>}

      {/* セクション1: ブランド基本情報 */}
      <Card>
        <CardHeader
          title="ブランド基本情報"
          hint="Xヘッダーや画面タイトルなど、短く表示する場所で優先するコピー"
          action={SaveButton}
        />
        <div className="space-y-4">
          <TextField label="ブランド名" value={draft.identity.name} onChange={(name) => setIdentity({ name })} />
          <TextField
            label="メインキャッチコピー"
            hint="短く表示する場所（Xヘッダー、画面タイトルなど）ではこちらを優先する"
            value={draft.identity.primaryTagline}
            onChange={(primaryTagline) => setIdentity({ primaryTagline })}
          />
          <TextAreaField
            label="ブランドストーリーコピー"
            hint="ブランド名の意味を説明する中心的な言葉。長めの説明が可能な場所で使う"
            value={draft.identity.storyTagline}
            onChange={(storyTagline) => setIdentity({ storyTagline })}
            rows={2}
          />
          <ListField
            label="サブコピー"
            hint="メインコピーを置き換えない。記事・キャンペーン・ヘッダー制作時に使えるコピー"
            value={draft.identity.alternateTaglines}
            onChange={(alternateTaglines) => setIdentity({ alternateTaglines })}
            rows={2}
          />
          <TextAreaField
            label="コンセプト"
            value={draft.concept}
            onChange={(concept) => set({ concept })}
            rows={2}
          />
          <TextAreaField
            label="ブランド全体のゴール"
            hint="何の専門家になるかではなく、読者からどのように見られたいか"
            value={draft.brandGoal}
            onChange={(brandGoal) => set({ brandGoal })}
            rows={3}
          />
        </div>
      </Card>

      {/* セクション2: プロフィール */}
      <Card>
        <CardHeader title="プロフィール" hint="Xプロフィール・noteプロフィール・固定ポスト" />
        <div className="space-y-4">
          <TextAreaField
            label="Xプロフィール"
            value={draft.identity.xProfile}
            onChange={(xProfile) => setIdentity({ xProfile })}
            rows={4}
          />
          <TextAreaField
            label="Xプロフィール（短縮版）"
            hint="文字数制限に収まらない場合に使う"
            value={draft.identity.xProfileShort}
            onChange={(xProfileShort) => setIdentity({ xProfileShort })}
            rows={3}
          />
          <TextAreaField
            label="noteプロフィール"
            hint="Xより少し世界観を重視してよい"
            value={draft.identity.noteProfile}
            onChange={(noteProfile) => setIdentity({ noteProfile })}
            rows={5}
          />
          <TextAreaField
            label="固定ポスト"
            hint="Xの固定ポスト。ここで変更できる"
            value={draft.identity.fixedPost}
            onChange={(fixedPost) => setIdentity({ fixedPost })}
            rows={10}
          />
        </div>
      </Card>

      {/* セクション3: 人格・口調 */}
      <Card>
        <CardHeader title="人格・口調" hint="記事・X・LINEを書くときの発信者人格" />
        <div className="space-y-4">
          <ListField
            label="性格"
            hint="1行に1つ（例：穏やか、親しみやすい）"
            value={draft.personality.traits}
            onChange={(traits) => setPersonality({ traits })}
            rows={3}
          />
          <ListField
            label="基本姿勢"
            value={draft.personality.basicStance}
            onChange={(basicStance) => setPersonality({ basicStance })}
            rows={3}
          />
          <ListField
            label="使用したい表現"
            hint="このニュアンスで書いてほしい言い回し"
            value={draft.personality.preferredExpressions}
            onChange={(preferredExpressions) => setPersonality({ preferredExpressions })}
            rows={4}
          />
          <ListField
            label="避ける表現"
            hint="AIはこれを禁止表現として扱う"
            value={draft.personality.avoidedExpressions}
            onChange={(avoidedExpressions) => setPersonality({ avoidedExpressions })}
            rows={4}
          />
          <ListField
            label="文章ルール"
            value={draft.personality.writingRules}
            onChange={(writingRules) => setPersonality({ writingRules })}
            rows={6}
          />
        </div>
      </Card>

      {/* セクション4: 読者・発信内容 */}
      <Card>
        <CardHeader title="読者・発信内容" />
        <div className="space-y-4">
          <TextAreaField
            label="想定読者"
            value={draft.targetReader}
            onChange={(targetReader) => set({ targetReader })}
            rows={3}
          />
          <ListField
            label="読者の悩み"
            hint="1行に1つ。記事の書き出しはここから作られます"
            value={draft.painPoints}
            onChange={(painPoints) => set({ painPoints })}
          />
          <ListField
            label="発信・共有すること"
            hint="1行に1つ。知識だけでなく、体験・感情・迷い・途中経過も含めます"
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
        </div>
      </Card>

      <Card>
        <CardHeader title="投稿割合" hint="直近の偏りを確認するための目安です。投稿内容を強制しません。" />
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.contentPillars.map((pillar, index) => (
            <label key={pillar.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
              <span className="text-xs font-semibold">{pillar.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={pillar.targetRatio}
                onChange={(event) => {
                  const contentPillars = draft.contentPillars.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, targetRatio: Number(event.target.value) || 0 } : item
                  );
                  set({ contentPillars });
                }}
                className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.03] px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
        <p className={`mt-3 text-xs ${draft.contentPillars.reduce((sum, item) => sum + item.targetRatio, 0) === 100 ? "text-gain" : "text-amber-300"}`}>
          合計 {draft.contentPillars.reduce((sum, item) => sum + item.targetRatio, 0)}%
          {draft.contentPillars.reduce((sum, item) => sum + item.targetRatio, 0) !== 100 && "（目安として使うには100%にしてください）"}
        </p>
      </Card>

      <Card>
        <CardHeader title="Xの発信ルール" hint="毎日の記録・途中経過・会話のための媒体" />
        <div className="space-y-4">
          <ListField label="Xの目的" value={draft.channelGuidelines.x.purpose} onChange={(purpose) => set({ channelGuidelines: { ...draft.channelGuidelines, x: { ...draft.channelGuidelines.x, purpose } } })} />
          <ListField label="Xの口調" value={draft.channelGuidelines.x.tone} onChange={(tone) => set({ channelGuidelines: { ...draft.channelGuidelines, x: { ...draft.channelGuidelines.x, tone } } })} />
          <ListField label="Xで守るルール" value={draft.channelGuidelines.x.rules} onChange={(rules) => set({ channelGuidelines: { ...draft.channelGuidelines, x: { ...draft.channelGuidelines.x, rules } } })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="noteの発信ルール" hint="背景・感情・考えの変化を深く残す媒体" />
        <div className="space-y-4">
          <ListField label="noteの目的" value={draft.channelGuidelines.note.purpose} onChange={(purpose) => set({ channelGuidelines: { ...draft.channelGuidelines, note: { ...draft.channelGuidelines.note, purpose } } })} />
          <ListField label="noteの口調" value={draft.channelGuidelines.note.tone} onChange={(tone) => set({ channelGuidelines: { ...draft.channelGuidelines, note: { ...draft.channelGuidelines.note, tone } } })} />
          <ListField label="noteで守るルール" value={draft.channelGuidelines.note.rules} onChange={(rules) => set({ channelGuidelines: { ...draft.channelGuidelines, note: { ...draft.channelGuidelines.note, rules } } })} />
        </div>
      </Card>

      {/* セクション5: 収益導線 */}
      <Card>
        <CardHeader
          title="収益導線"
          hint="X → note → 有料note・公式LINE → アフィリエイト・将来のサービス、の順で上から並べる"
        />
        <ListField
          label="収益導線"
          hint="上から順に、読者をどう動かすか"
          value={draft.funnel}
          onChange={(funnel) => set({ funnel })}
          rows={6}
        />
        <div className="mt-4">
          <label className="text-[11px] font-semibold text-slate-300">トーン（要約）</label>
          <textarea
            value={draft.tone}
            onChange={(e) => set({ tone: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
          />
        </div>
        <div className="mt-4">
          <ListField
            label="書かないこと"
            hint="1行に1つ。AIはこれを禁止事項として扱います"
            value={draft.ngList}
            onChange={(ngList) => set({ ngList })}
          />
        </div>
      </Card>

      {/* セクション6: ビジュアル */}
      <Card>
        <CardHeader title="ビジュアル" hint="ブランドカラー・アイコン方針・ヘッダー方針" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ColorField
              label="ベース"
              hex={draft.visualIdentity.baseColor}
              onChange={(baseColor) => setVisual({ baseColor })}
            />
            <ColorField
              label="サーフェス"
              hex={draft.visualIdentity.surfaceColor}
              onChange={(surfaceColor) => setVisual({ surfaceColor })}
            />
            <ColorField
              label="アクセント"
              hex={draft.visualIdentity.accentColor}
              onChange={(accentColor) => setVisual({ accentColor })}
            />
            <ColorField
              label="テキスト"
              hex={draft.visualIdentity.textColor}
              onChange={(textColor) => setVisual({ textColor })}
            />
            <ColorField
              label="サブテキスト"
              hex={draft.visualIdentity.subTextColor}
              onChange={(subTextColor) => setVisual({ subTextColor })}
            />
            <ColorField
              label="セカンダリ"
              hex={draft.visualIdentity.secondaryColor}
              onChange={(secondaryColor) => setVisual({ secondaryColor })}
            />
          </div>
          <ListField
            label="イラストの方針"
            value={draft.visualIdentity.illustrationStyle}
            onChange={(illustrationStyle) => setVisual({ illustrationStyle })}
            rows={3}
          />
          <ListField
            label="アイコンの方針"
            value={draft.visualIdentity.iconGuidelines}
            onChange={(iconGuidelines) => setVisual({ iconGuidelines })}
            rows={4}
          />
          <ListField
            label="ヘッダーの方針"
            value={draft.visualIdentity.headerGuidelines}
            onChange={(headerGuidelines) => setVisual({ headerGuidelines })}
            rows={3}
          />
        </div>
      </Card>

      <BrandPreview visual={draft.visualIdentity} />
    </div>
  );
}
