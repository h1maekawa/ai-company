"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Search, Sparkles } from "lucide-react";
import { useCandidates } from "@/app/note/useResearch";
import type {
  GrowthGoal,
  OutputType,
  TrendCluster,
} from "@/app/lib/note/research/types";
import { Card, CardHeader } from "@/components/ui/primitives";

const GENRES = [
  ["", "指定なし"],
  ["ai", "AI"],
  ["side-business", "副業"],
  ["reading", "読書"],
  ["asset-building", "投資・資産形成"],
  ["career", "仕事・キャリア"],
  ["habits", "習慣・暮らし"],
  ["personal-development", "個人開発"],
] as const;

const GOALS: { id: GrowthGoal; label: string; hint: string }[] = [
  { id: "reach", label: "フォロワーを増やす", hint: "まず知ってもらう" },
  { id: "conversation", label: "返信・会話を増やす", hint: "答えやすい問いを作る" },
  { id: "save", label: "保存される投稿", hint: "後で見返せる情報にする" },
  { id: "profile-follow", label: "プロフィール誘導", hint: "人柄と発信軸を伝える" },
  { id: "note-bridge", label: "noteへ誘導", hint: "投稿だけでも価値を出す" },
  { id: "trust", label: "信頼を積み上げる", hint: "考え方と根拠を丁寧に伝える" },
  { id: "monetization", label: "収益化につなげる", hint: "売り込みより課題解決を優先" },
];

const OUTPUTS: { id: OutputType; label: string; available: boolean }[] = [
  { id: "x-post", label: "X投稿", available: true },
  { id: "note-free", label: "無料note", available: true },
  { id: "x-and-note", label: "Xとnote両方", available: true },
  { id: "x-thread", label: "Xスレッド（Phase 3）", available: false },
  { id: "note-paid-outline", label: "有料note構成（Phase 3）", available: false },
];

export function ContentStudio({ onOpenDrafts }: { onOpenDrafts: () => void }) {
  const candidates = useCandidates();
  const [focusTopic, setFocusTopic] = useState("");
  const [platform, setPlatform] = useState<"x" | "note" | "both">("both");
  const [genreId, setGenreId] = useState("");
  const [personalAngle, setPersonalAngle] = useState("");
  const [growthGoal, setGrowthGoal] = useState<GrowthGoal>("reach");
  const [outputType, setOutputType] = useState<OutputType>("x-and-note");
  const [selectedId, setSelectedId] = useState("");

  const visibleCandidates = useMemo(() => {
    if (candidates.latestCandidateIds.length === 0) return [];
    const byId = new Map(candidates.clusters.map((candidate) => [candidate.id, candidate]));
    return candidates.latestCandidateIds
      .map((id) => byId.get(id))
      .filter((candidate): candidate is (typeof candidates.clusters)[number] => Boolean(candidate));
  }, [candidates.clusters, candidates.latestCandidateIds]);

  async function research() {
    setSelectedId("");
    await candidates.runResearch({
      focusTopic: focusTopic.trim() || undefined,
      platform,
      genreId: genreId || undefined,
      growthGoal,
      personalAngle: personalAngle.trim() || undefined,
    });
  }

  async function generate() {
    if (!selectedId) return;
    const kind =
      outputType === "x-post" ? "x" : outputType === "note-free" ? "note" : "both";
    await candidates.generate(selectedId, kind, "free", {
      personalAngle: personalAngle.trim() || undefined,
      growthGoal,
      outputType,
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="投稿を作る"
          hint="話題を選び、まえみちの切り口と自分の意見を加えて、下書きまで作ります"
        />
        <div className="mb-4 grid grid-cols-4 gap-2">
          {["話題", "切り口", "自分の意見", "生成"].map((label, index) => (
            <div key={label} className="rounded-xl bg-white/[0.03] px-2 py-2 text-center">
              <p className="text-[10px] text-sub">STEP {index + 1}</p>
              <p className="mt-0.5 text-xs font-semibold">{label}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-hairline p-4">
          <StepTitle number="1" title="話題を選ぶ" text="調べたい言葉を入力します。空欄なら登録済みの話題を調べます。" />
          <label className="mt-3 block text-xs font-semibold text-slate-200">今回調べたいテーマ</label>
          <input
            value={focusTopic}
            onChange={(event) => setFocusTopic(event.target.value)}
            placeholder="例：半導体、NVIDIA、新NISA、嫌われる勇気"
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-3 text-sm text-white outline-none placeholder:text-sub/60 focus:border-brand/60"
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["both", "X・note両方"],
              ["x", "Xを調べる"],
              ["note", "noteを調べる"],
            ] as const).map(([id, label]) => (
              <Choice key={id} active={platform === id} onClick={() => setPlatform(id)} label={label} />
            ))}
          </div>
          <button
            onClick={research}
            disabled={candidates.running}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {candidates.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            今の話題を調べる
          </button>
        </section>

        {visibleCandidates.length > 0 && (
          <section className="mt-4 rounded-2xl border border-hairline p-4">
            <StepTitle number="2" title="候補と切り口を選ぶ" text="他者の文章ではなく、話題と構造だけを参考にします。" />
            <div className="mt-3 space-y-2">
              {visibleCandidates.map((candidate, index) => (
                <CandidateChoice
                  key={candidate.id}
                  candidate={candidate}
                  index={index}
                  active={selectedId === candidate.id}
                  onClick={() => setSelectedId(candidate.id)}
                />
              ))}
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-200">まえみちの切り口</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {GENRES.map(([id, label]) => (
                <Choice key={id} active={genreId === id} onClick={() => setGenreId(id)} label={label} />
              ))}
            </div>
          </section>
        )}

        {visibleCandidates.length > 0 && (
          <section className="mt-4 rounded-2xl border border-hairline p-4">
            <StepTitle
              number="3"
              title="自分の意見を加える"
              text="投稿の中心になります。空欄なら一般的な解説として作り、体験は創作しません。"
            />
            <textarea
              value={personalAngle}
              onChange={(event) => setPersonalAngle(event.target.value)}
              rows={5}
              placeholder="例：半導体は長期では注目していますが、短期の値動きだけを理由に買わないようにしています。"
              className="mt-3 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-sub/60 focus:border-brand/60"
            />
            <p className="mt-1 text-[10px] text-sub">
              入力内容は今回の投稿にだけ使います。実体験ライブラリへ自動登録しません。
            </p>
          </section>
        )}

        {visibleCandidates.length > 0 && (
          <section className="mt-4 rounded-2xl border border-hairline p-4">
            <StepTitle number="4" title="目的と作るものを選ぶ" text="初期値はフォロワー獲得とX・note両方です。" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => setGrowthGoal(goal.id)}
                  className={`rounded-xl border p-3 text-left ${
                    growthGoal === goal.id ? "border-brand bg-brand/10" : "border-hairline bg-white/[0.02]"
                  }`}
                >
                  <p className="text-xs font-semibold">{goal.label}</p>
                  <p className="mt-0.5 text-[10px] text-sub">{goal.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {OUTPUTS.map((output) => (
                <button
                  key={output.id}
                  disabled={!output.available}
                  onClick={() => setOutputType(output.id)}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    outputType === output.id
                      ? "border-gain bg-gain/10 text-gain"
                      : "border-hairline text-slate-300"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {output.label}
                </button>
              ))}
            </div>
            <button
              onClick={generate}
              disabled={!selectedId || candidates.running}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gain py-3 text-sm font-bold text-ink-base disabled:opacity-40"
            >
              {candidates.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              確認用の下書きを作る
            </button>
          </section>
        )}

        {candidates.error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-300">{candidates.error}</p>}
        {candidates.notice && (
          <div className="mt-4 rounded-xl border border-gain/30 bg-gain/10 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-gain"><Check className="h-4 w-4" />{candidates.notice}</p>
            <button onClick={onOpenDrafts} className="mt-2 flex items-center gap-1 text-xs font-semibold text-white">
              下書きを確認する <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function StepTitle({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold">{number}</span>
      <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-[11px] text-sub">{text}</p></div>
    </div>
  );
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-lg border px-3 py-2 text-xs ${active ? "border-brand bg-brand/10 text-white" : "border-hairline text-sub"}`}>
      {label}
    </button>
  );
}

function CandidateChoice({
  candidate,
  index,
  active,
  onClick,
}: {
  candidate: TrendCluster;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-3 text-left ${active ? "border-gain bg-gain/10" : "border-hairline bg-white/[0.02]"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{candidate.title}</p>
          <p className="mt-1 text-[10px] text-sub">{candidate.totalScore}点・{candidate.sourceCount}件のソース</p>
        </div>
        {active && <Check className="h-4 w-4 shrink-0 text-gain" />}
      </div>
    </button>
  );
}
