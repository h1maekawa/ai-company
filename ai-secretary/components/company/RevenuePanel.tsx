"use client";

/**
 * 収益パネル — Phase 5 §10 / §11 / §13 / §51
 *
 * 内部IDを人に入力させない（§11）。
 * 収益源とメモだけで登録でき、Trace/Agentは選べる範囲で補完する。
 */

import { useCallback, useEffect, useState } from "react";
import { PlusCircle, Trophy } from "lucide-react";
import {
  REVENUE_SOURCE_LABELS,
  type RevenueSourceType,
} from "@/app/lib/company/revenue";
import { Skeleton } from "@/components/ui/primitives";

type Entry = {
  id: string;
  kind: string;
  amountYen: number;
  sourceType: RevenueSourceType;
  occurredAt: string;
  confirmedByHuman: boolean;
  note?: string;
};

type RevenueData = {
  entries: Entry[];
  allTime: { aiGeneratedYen: number; investmentYen: number; unconfirmedYen: number };
  thisMonth: { aiGeneratedYen: number };
  achievements: { id: string; title: string; unlocked: boolean; target?: number }[];
};

type Quest = {
  id: string;
  title: string;
  description: string;
  status: string;
  expectedRevenueYen?: number;
  estimatedMinutesToRevenue?: number;
};

const yen = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;

export function RevenuePanel() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch("/api/company/revenue")
      .then((r) => r.json())
      .then((json: RevenueData) => setData(json))
      .catch(() => undefined);
    fetch("/api/company/opportunities")
      .then((r) => r.json())
      .then((json: { quests?: Quest[] }) => setQuests(json.quests ?? []))
      .catch(() => setQuests([]));
  }, []);

  useEffect(load, [load]);

  const onRecorded = useCallback(
    (amount: number, unlocked: boolean) => {
      setShowForm(false);
      if (unlocked) setJustUnlocked(amount);
      load();
    },
    [load]
  );

  if (!data) return <Skeleton className="h-64 rounded-2xl" />;

  const first = data.achievements.find((a) => a.id === "first-revenue");
  const target = first?.target ?? 1;

  return (
    <section className="space-y-3">
      {justUnlocked !== null && (
        <AchievementOverlay amount={justUnlocked} onClose={() => setJustUnlocked(null)} />
      )}

      <div className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">収益</p>
            <p className="mt-0.5 text-[11px] text-sub">
              人が確認したものだけが正式な収益として集計されます
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/15"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            収益を記録
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="AI経由（累計）" value={yen(data.allTime.aiGeneratedYen)} emphasize />
          <Figure label="今月" value={yen(data.thisMonth.aiGeneratedYen)} />
          <Figure label="投資（別集計）" value={yen(data.allTime.investmentYen)} />
          <Figure label="確認待ち" value={yen(data.allTime.unconfirmedYen)} />
        </div>

        {/* 最初の1円 */}
        <div className="mt-4 rounded-xl border border-brand/25 bg-brand/[0.06] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] text-sub">FIRST REVENUE</p>
            {first?.unlocked && (
              <span className="rounded-full border border-gain/30 bg-gain/10 px-2 py-0.5 text-[10px] font-medium text-gain">
                達成
              </span>
            )}
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-brand">
            {yen(data.allTime.aiGeneratedYen)}
            <span className="ml-1 text-xs font-normal text-sub">/ {yen(target)}</span>
          </p>
        </div>

        {showForm && <RevenueForm onRecorded={onRecorded} onCancel={() => setShowForm(false)} />}

        {data.entries.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {data.entries.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-sub">
                  {entry.occurredAt.slice(0, 10)} · {REVENUE_SOURCE_LABELS[entry.sourceType]}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    entry.confirmedByHuman ? "text-white" : "text-sub"
                  }`}
                >
                  {yen(entry.amountYen)}
                  {!entry.confirmedByHuman && "（未確認）"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Money Quest（§51） */}
      <div className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-sm font-semibold text-white">💰 今日のMoney Quest</p>
        {quests === null ? (
          <Skeleton className="mt-3 h-20 rounded-xl" />
        ) : quests.length === 0 ? (
          <p className="mt-2 text-[11px] text-sub">今日のQuestはありません。</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {quests.map((quest, index) => (
              <li key={quest.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
                <p className="text-xs font-medium text-white">
                  {index + 1}. {quest.title}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-sub">{quest.description}</p>
                <p className="mt-1.5 text-[10px] text-sub">
                  想定収益:{" "}
                  {quest.expectedRevenueYen === undefined
                    ? "不明"
                    : yen(quest.expectedRevenueYen)}
                  {quest.estimatedMinutesToRevenue
                    ? ` ・ 目安 ${quest.estimatedMinutesToRevenue}分`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-sub">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          emphasize ? "text-white" : "text-slate-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** 収益の登録フォーム。内部IDを人に入力させない（§11） */
function RevenueForm({
  onRecorded,
  onCancel,
}: {
  onRecorded: (amount: number, unlocked: boolean) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [sourceType, setSourceType] = useState<RevenueSourceType>("note");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const amountYen = Number(amount);
    if (!Number.isFinite(amountYen) || amountYen <= 0) {
      setError("金額は0より大きい数値で入力してください");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/company/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountYen,
          sourceType,
          note: note.trim() || undefined,
          occurredAt: new Date(occurredAt).toISOString(),
          // 人が画面から入力したものなので確認済みとして記録する
          confirmedByHuman: true,
          originAgentId: sourceType === "note" ? "personal-note" : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "記録に失敗しました");
        return;
      }
      const unlocked = Boolean(
        json.achievements?.find((a: { id: string; unlocked: boolean }) => a.id === "first-revenue")
          ?.unlocked
      );
      onRecorded(amountYen, unlocked);
    } catch {
      setError("記録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-white/[0.02] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="金額（円）">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
            placeholder="500"
          />
        </Field>
        <Field label="収益源">
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as RevenueSourceType)}
            className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
          >
            {Object.entries(REVENUE_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="日付">
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
          />
        </Field>
        <Field label="メモ">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
            placeholder="note有料販売"
          />
        </Field>
      </div>

      {error && <p className="mt-2 text-[11px] text-loss">{error}</p>}

      <p className="mt-2 text-[10px] leading-relaxed text-sub">
        投資の損益は別集計になり、AI経由の収益には含まれません。
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "記録中…" : "記録する"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-4 py-2 text-xs text-sub hover:text-white"
        >
          やめる
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-sub">{label}</span>
      {children}
    </label>
  );
}

/** FIRST REVENUE 解除時の簡易オーバーレイ（§13） */
function AchievementOverlay({ amount, onClose }: { amount: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="max-w-sm rounded-2xl border border-gain/40 bg-ink-card p-6 text-center shadow-lift">
        <Trophy className="mx-auto h-10 w-10 text-gain" />
        <p className="mt-3 text-[10px] font-semibold tracking-[0.2em] text-gain">
          ACHIEVEMENT UNLOCKED
        </p>
        <p className="mt-1 text-xl font-bold text-white">FIRST REVENUE</p>
        <p className="mt-2 text-xs leading-relaxed text-sub">
          AI Companyが初めて収益を生み出しました。
        </p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-gain">{yen(amount)}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
