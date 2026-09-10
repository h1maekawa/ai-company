"use client";

/**
 * レビュー待ち一覧 — 要件2「承認フィードの一元化」
 *
 * note用・X用・リサーチ系のタスクを1画面に集約し、
 * 各行で「承認 / 差し戻し / 編集して承認」をその場で完結させる。
 *
 * 表示の原則:
 *   - 自動テスト（要件9）の結果を必ず出す。通っていないものは承認ボタンを止める
 *   - 差し戻しは理由の入力を必須にする（エージェントへのフィードバックになるため）
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import {
  REVIEW_KIND_LABELS,
  REVIEW_PHASE_LABELS,
  REVIEW_PHASE_ORDER,
  type ReviewItem,
  type ReviewPhase,
} from "@/app/lib/review/types";
import { relativeAge } from "@/app/lib/freshness";
import { Skeleton } from "@/components/ui/primitives";

type Feed = {
  items: ReviewItem[];
  byPhase: Record<ReviewPhase, number>;
  blockedByQa: number;
  loadedAt: string;
  error?: string;
};

/** 承認待ちが長いものを強調する閾値（要件7の停滞表示と同じ基準） */
const STALE_HOURS = 48;

function isStale(updatedAt: string): boolean {
  if (!updatedAt) return false;
  const ms = Date.now() - new Date(updatedAt).getTime();
  return Number.isFinite(ms) && ms > STALE_HOURS * 3_600_000;
}

export function ReviewFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<ReviewPhase | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/review")
      .then((r) => r.json())
      .then((json: Feed) => {
        if (json.error) setError(json.error);
        else {
          setFeed(json);
          setError("");
        }
      })
      .catch(() => setError("レビュー一覧の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const decide = useCallback(
    async (item: ReviewItem, decision: "approve" | "reject" | "edit_approve") => {
      let reason: string | undefined;
      let editedText: string | undefined;

      if (decision === "reject") {
        // 理由の無い差し戻しは学習に使えないため、入力されるまで送らない
        const input = window.prompt("差し戻す理由を入力してください（次の生成に反映されます）");
        if (!input?.trim()) return;
        reason = input.trim();
      }

      if (decision === "edit_approve") {
        const input = window.prompt("修正後の本文", item.excerpt);
        if (!input?.trim()) return;
        editedText = input.trim();
      }

      setBusy(item.id);
      try {
        const res = await fetch("/api/review/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, decision, reason, editedText }),
        });
        const json = await res.json();
        if (!res.ok) {
          const detail = Array.isArray(json.failed) ? `\n${json.failed.join("\n")}` : "";
          window.alert(`${json.error ?? "決定に失敗しました"}${detail}`);
          return;
        }
        load();
      } catch {
        window.alert("決定の送信に失敗しました");
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const visible = useMemo(
    () => (feed?.items ?? []).filter((i) => phase === "all" || i.phase === phase),
    [feed, phase]
  );

  if (loading && !feed) return <Skeleton className="h-64 rounded-2xl" />;
  if (error) {
    return (
      <section className="rounded-2xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">
        {error}
      </section>
    );
  }
  if (!feed) return null;

  return (
    <section className="space-y-3">
      {/* 工程ごとの件数。要件7のステップ表示の土台でもある */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label={`すべて (${feed.items.length})`}
          active={phase === "all"}
          onClick={() => setPhase("all")}
        />
        {REVIEW_PHASE_ORDER.map((p, index) => (
          <div key={p} className="flex items-center gap-2">
            {index > 0 && <span className="text-sub">→</span>}
            <FilterChip
              label={`${REVIEW_PHASE_LABELS[p]} (${feed.byPhase[p] ?? 0})`}
              active={phase === p}
              onClick={() => setPhase(p)}
            />
          </div>
        ))}
      </div>

      {feed.blockedByQa > 0 && (
        <p className="flex items-center gap-1.5 rounded-xl border border-loss/25 bg-loss/10 px-3 py-2 text-[11px] text-loss">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {feed.blockedByQa}件が自動テストを通過していません。修正するまで承認できません。
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-ink-card px-5 py-8 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-gain" />
          <p className="mt-2 text-sm text-slate-300">レビュー待ちはありません。</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <ReviewRow
              key={item.id}
              item={item}
              busy={busy === item.id}
              onDecide={(decision) => decide(item, decision)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-brand text-white" : "bg-white/[0.04] text-sub hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ReviewRow({
  item,
  busy,
  onDecide,
}: {
  item: ReviewItem;
  busy: boolean;
  onDecide: (decision: "approve" | "reject" | "edit_approve") => void;
}) {
  const qaBlocked = Boolean(item.qa && !item.qa.passed);
  const stale = isStale(item.updatedAt);
  const failedChecks =
    item.qa?.checks.filter((c) => c.severity === "blocking" && c.status === "fail") ?? [];

  return (
    <li
      className={`rounded-2xl border bg-ink-card p-4 ${
        stale ? "border-amber-500/30" : "border-hairline"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="rounded-full border border-hairline bg-white/5 px-2 py-0.5 text-sub">
              {REVIEW_KIND_LABELS[item.kind]}
            </span>
            <span className="rounded-full border border-hairline bg-white/5 px-2 py-0.5 text-sub">
              {REVIEW_PHASE_LABELS[item.phase]}
            </span>
            {stale && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400">
                {relativeAge(item.updatedAt)}から滞留
              </span>
            )}
          </div>

          <p className="mt-1.5 truncate text-sm font-medium text-white">{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-sub">{item.excerpt}</p>
          <p className="mt-1 text-[10px] text-sub">{item.reason}</p>

          <QaLine qa={item.qa} failedChecks={failedChecks} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <ActionButton
            label="承認"
            tone="gain"
            disabled={busy || qaBlocked}
            title={qaBlocked ? "自動テストが通っていません" : undefined}
            onClick={() => onDecide("approve")}
          />
          {item.editable && (
            <ActionButton
              label="編集して承認"
              icon={<Pencil className="h-3 w-3" />}
              disabled={busy}
              onClick={() => onDecide("edit_approve")}
            />
          )}
          <ActionButton
            label="差し戻し"
            tone="loss"
            icon={<RotateCcw className="h-3 w-3" />}
            disabled={busy}
            onClick={() => onDecide("reject")}
          />
        </div>
      </div>
    </li>
  );
}

function QaLine({
  qa,
  failedChecks,
}: {
  qa: ReviewItem["qa"];
  failedChecks: { label: string; detail: string | null }[];
}) {
  if (!qa) {
    return <p className="mt-1.5 text-[10px] text-sub">自動テスト: 対象外</p>;
  }
  return (
    <div className="mt-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
          qa.passed
            ? "border-gain/25 bg-gain/10 text-gain"
            : "border-loss/25 bg-loss/10 text-loss"
        }`}
      >
        {qa.passed ? "自動テスト通過" : "自動テスト未通過"}
      </span>
      {qa.skipped > 0 && (
        <span className="ml-1.5 text-[10px] text-sub">未検証{qa.skipped}件</span>
      )}
      {qa.warnings > 0 && (
        <span className="ml-1.5 text-[10px] text-amber-400">警告{qa.warnings}件</span>
      )}
      {failedChecks.length > 0 && (
        <p className="mt-1 text-[10px] leading-relaxed text-loss/80">
          {failedChecks.map((c) => `${c.label}: ${c.detail}`).join(" / ")}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
  icon,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "gain" | "loss";
  icon?: React.ReactNode;
  title?: string;
}) {
  const styles = {
    neutral: "border-hairline text-sub hover:text-white hover:border-white/20",
    gain: "border-gain/30 bg-gain/10 text-gain hover:bg-gain/15",
    loss: "border-loss/30 text-loss hover:bg-loss/10",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}
