"use client";

import { useState } from "react";
import { GraduationCap, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Channel, TeachingProgram } from "@/app/lib/note/types";
import { Card, CardHeader, Badge, Skeleton } from "@/components/ui/primitives";

/**
 * 公式LINEの教育プログラム。
 * X・noteは通常のコンテンツ、ここが「副業で稼ぎたい人に教える」場になる。
 */
export function LineProgram({
  program,
  channels,
  loading,
  saving,
  error,
  onSave,
  onGenerate,
}: {
  program: TeachingProgram | null;
  channels: Channel[];
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (program: TeachingProgram) => void;
  onGenerate: (stepId: string) => void;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  if (loading || !program) return <Skeleton className="h-96 rounded-2xl" />;

  const steps = [...program.steps].sort((a, b) => a.order - b.order);
  const written = steps.filter((s) => s.content).length;

  function update(patch: Partial<TeachingProgram>) {
    onSave({ ...program!, ...patch });
  }

  function updateStep(id: string, patch: Partial<TeachingProgram["steps"][number]>) {
    update({ steps: program!.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  async function generate(stepId: string) {
    setGenerating(stepId);
    await onGenerate(stepId);
    setGenerating(null);
    setOpenStep(stepId);
  }

  return (
    <div className="space-y-4">
      {/* チャネルの役割 */}
      <Card>
        <CardHeader title="チャネルの役割" hint="どこで集めて、どこで教えるか" />
        <ul className="space-y-2">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className={`rounded-xl border p-3 ${
                channel.id === "line"
                  ? "border-gain/30 bg-gain/[0.06]"
                  : "border-hairline bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{channel.icon}</span>
                <span className="text-sm font-semibold text-white">{channel.label}</span>
                {channel.id === "line" && <Badge tone="gain">教える場</Badge>}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-sub">{channel.role}</p>
              <p className="mt-0.5 text-[11px] text-brand">→ {channel.nextStep}</p>
            </li>
          ))}
        </ul>
      </Card>

      {/* プログラム設定 */}
      <Card>
        <CardHeader
          title="公式LINEで教えるプログラム"
          hint={`${written} / ${steps.length} 回ぶんの配信文ができています`}
          action={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gain/10 text-gain">
              <GraduationCap className="h-4 w-4" />
            </span>
          }
        />
        {error && <p className="mb-2 text-xs text-loss">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] text-sub">プログラム名</label>
            <input
              value={program.name}
              onChange={(e) => update({ name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-sub">配信ペース</label>
            <input
              value={program.duration}
              onChange={(e) => update({ duration: e.target.value })}
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[11px] text-sub">完走したら何ができるようになるか</label>
          <input
            value={program.promise}
            onChange={(e) => update({ promise: e.target.value })}
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
          />
        </div>
      </Card>

      {/* ステップ一覧 */}
      <div className="space-y-3">
        {steps.map((step) => {
          const open = openStep === step.id;
          return (
            <Card key={step.id} padded={false}>
              <div className="flex items-start gap-3 p-4">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.content ? "bg-gain/15 text-gain" : "bg-white/[0.06] text-sub"
                  }`}
                >
                  {step.order}
                </span>

                <div className="min-w-0 flex-1">
                  <input
                    value={step.title}
                    onChange={(e) => updateStep(step.id, { title: e.target.value })}
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                  />
                  <input
                    value={step.goal}
                    onChange={(e) => updateStep(step.id, { goal: e.target.value })}
                    placeholder="この回のゴール"
                    className="mt-0.5 w-full bg-transparent text-[11px] text-sub outline-none"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => generate(step.id)}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand/85 disabled:opacity-40"
                  >
                    <Sparkles className="h-3 w-3" />
                    {generating === step.id ? "作成中…" : step.content ? "作り直す" : "配信文を作る"}
                  </button>
                  {step.content && (
                    <button
                      onClick={() => setOpenStep(open ? null : step.id)}
                      className="rounded-lg border border-hairline px-2 py-1 text-[11px] text-sub hover:text-white"
                    >
                      {open ? "閉じる" : "見る"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      update({ steps: program.steps.filter((s) => s.id !== step.id) })
                    }
                    aria-label="この回を削除"
                    className="text-sub hover:text-loss"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {open && step.content && (
                <div className="border-t border-hairline px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-sub">配信文</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(step.content ?? "")}
                      className="text-[11px] text-brand hover:underline"
                    >
                      コピー
                    </button>
                  </div>
                  <pre className="mt-1.5 whitespace-pre-wrap rounded-xl border border-hairline bg-ink-base/60 p-3 text-xs leading-6 text-slate-300">
                    {step.content}
                  </pre>
                  {step.assignment && (
                    <p className="mt-2 rounded-lg border border-brand/25 bg-brand-soft px-3 py-2 text-[11px] text-slate-200">
                      <span className="font-semibold text-brand">今日の課題: </span>
                      {step.assignment}
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <button
        onClick={() =>
          update({
            steps: [
              ...program.steps,
              {
                id: `s${Date.now().toString(36)}`,
                order: steps.length + 1,
                title: "新しい回",
                goal: "",
              },
            ],
          })
        }
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline py-3 text-xs text-sub hover:border-brand/40 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
        回を追加
      </button>
    </div>
  );
}
