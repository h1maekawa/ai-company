"use client";

import { useState } from "react";
import { Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { usePublishQueue, useResearchSettings } from "@/app/note/useResearch";

/** X下書き・note記事・投稿ジョブと、安全装置のスイッチ */
export function PublishQueue() {
  const state = usePublishQueue();
  const settings = useResearchSettings();
  const [scheduleFor, setScheduleFor] = useState<Record<string, string>>({});

  const pending = state.socialDrafts.filter(
    (d) => d.status !== "discarded" && d.status !== "published"
  );

  return (
    <div className="space-y-4">
      {/* 安全装置 */}
      <Card>
        <CardHeader
          title="安全装置"
          hint="OFFの間はどのチャネルにも投稿しません。初期値はすべて停止側です"
        />
        {settings.loading || !settings.flags ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label="投稿全体を有効にする"
              hint="これがOFFなら他の設定に関係なく投稿しません"
              checked={settings.flags.publishingEnabled}
              onChange={(v) => settings.save({ flags: { publishingEnabled: v } })}
            />
            <Toggle
              label="X自動投稿（Buffer予約）"
              hint="OFFでも下書き保存はできます"
              checked={settings.flags.xAutoPublish}
              onChange={(v) => settings.save({ flags: { xAutoPublish: v } })}
            />
            <Toggle
              label="note自動公開"
              hint="OFFの間は下書き保存までで停止します"
              checked={settings.flags.noteAutoPublish}
              onChange={(v) => settings.save({ flags: { noteAutoPublish: v } })}
            />
            <Toggle
              label="note下書きのみ"
              hint="ONの間は公開ジョブをランナーへ渡しません"
              checked={settings.flags.noteDraftOnly}
              onChange={(v) => settings.save({ flags: { noteDraftOnly: v } })}
            />
          </div>
        )}
        {settings.error && <p className="mt-2 text-xs text-loss">{settings.error}</p>}
      </Card>

      {state.notice && (
        <p className="rounded-lg border border-gain/25 bg-gain/10 px-3 py-2 text-xs text-gain">
          {state.notice}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-loss/25 bg-loss/10 px-3 py-2 text-xs text-loss">
          {state.error}
        </p>
      )}

      {/* X下書き */}
      <Card>
        <CardHeader title="X投稿の下書き" hint={`${pending.length}件`} />
        {state.loading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<Send className="h-7 w-7" />}
            title="下書きがありません"
            description="リサーチ候補から「X投稿を作る」で生成できます。"
          />
        ) : (
          <div className="space-y-3">
            {pending.map((d) => (
              <div key={d.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
                <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{d.text}</pre>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-sub">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5">{d.status}</span>
                  <span>{d.needsDisclosure ? "[PR]あり" : "リンクなし"}</span>
                  {typeof d.similarityScore === "number" && (
                    <span>類似度 {d.similarityScore}</span>
                  )}
                  {d.scheduledAt && <span>予定 {d.scheduledAt}</span>}
                </div>

                {d.failureReason && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {d.failureReason}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => state.sendToBuffer(d.id, "saveToDraft")}
                    disabled={state.busy || Boolean(d.failureReason)}
                    className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    Bufferへ下書き
                  </button>
                  <button
                    onClick={() => state.sendToBuffer(d.id, "addToQueue")}
                    disabled={state.busy || Boolean(d.failureReason)}
                    className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand/85 disabled:opacity-40"
                  >
                    次の枠へ予約
                  </button>
                  <input
                    type="datetime-local"
                    value={scheduleFor[d.id] ?? ""}
                    onChange={(e) =>
                      setScheduleFor((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    className="rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-[11px] text-white outline-none"
                  />
                  <button
                    onClick={() =>
                      state.sendToBuffer(
                        d.id,
                        "customScheduled",
                        scheduleFor[d.id] ? new Date(scheduleFor[d.id]).toISOString() : undefined
                      )
                    }
                    disabled={state.busy || !scheduleFor[d.id] || Boolean(d.failureReason)}
                    className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    この日時で予約
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* note記事 */}
      <Card>
        <CardHeader
          title="note記事"
          hint="価格と有料の境界は必ず人が確認します（AIには決めさせません）"
        />
        {state.articles.length === 0 ? (
          <EmptyState
            icon={<Send className="h-7 w-7" />}
            title="記事がありません"
            description="リサーチ候補から「無料note」「有料note」で生成できます。"
          />
        ) : (
          <div className="space-y-3">
            {state.articles.map((a) => (
              <div key={a.id} className="rounded-xl border border-hairline bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-sub">
                    {a.status} / {a.articleType}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{a.title}</p>
                </div>

                {a.articleType === "paid" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      value={a.price ?? ""}
                      onChange={(e) =>
                        state.updateArticle(a.id, { price: Number(e.target.value) || undefined })
                      }
                      placeholder="価格（円）"
                      className="w-28 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none"
                    />
                    <input
                      value={a.paywallAfterHeading ?? ""}
                      onChange={(e) =>
                        state.updateArticle(a.id, { paywallAfterHeading: e.target.value })
                      }
                      placeholder="有料の境界にする見出し"
                      className="min-w-[12rem] flex-1 rounded-lg border border-hairline bg-white/[0.03] px-2 py-1 text-xs text-white outline-none"
                    />
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => state.updateArticle(a.id, { status: "approved" })}
                    disabled={state.busy}
                    className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    承認する
                  </button>
                  <button
                    onClick={() => state.queueNoteJob(a.id, "note-draft")}
                    disabled={state.busy}
                    className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand/85 disabled:opacity-40"
                  >
                    note下書きジョブを積む
                  </button>
                  {a.noteUrl && (
                    <a
                      href={a.noteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] text-brand hover:underline"
                    >
                      公開先を開く
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ジョブ */}
      <Card>
        <CardHeader
          title="投稿ジョブ"
          hint="MacのPlaywrightランナーが取りに来ます"
          action={
            <span className="flex items-center gap-1 text-[10px] text-sub">
              <ShieldAlert className="h-3 w-3" />
              Macがスリープ中は実行されません
            </span>
          }
        />
        {state.jobs.length === 0 ? (
          <p className="text-[11px] text-sub">ジョブはありません。</p>
        ) : (
          <ul className="space-y-1">
            {state.jobs.slice(0, 10).map((j) => (
              <li key={j.id} className="text-[11px] text-slate-300">
                [{j.status}] {j.kind} — {j.articleId}
                {j.failureReason && <span className="text-loss"> / {j.failureReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-2 rounded-xl border p-3 ${
        checked ? "border-gain/30 bg-gain/[0.06]" : "border-hairline bg-white/[0.02]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-white">{label}</span>
        <span className="block text-[10px] leading-relaxed text-sub">{hint}</span>
      </span>
    </label>
  );
}
