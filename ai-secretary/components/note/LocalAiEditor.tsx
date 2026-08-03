"use client";

import { useEffect, useState } from "react";
import { Laptop, ShieldCheck } from "lucide-react";
import type {
  LocalAiReviewJob,
  ReviewDestination,
  ReviewPurpose,
  ReviewStrength,
} from "@/app/lib/note/editor/types";
import { Card, CardHeader } from "@/components/ui/primitives";

type PublicJob = Omit<LocalAiReviewJob, "context" | "claimToken">;

export function LocalAiEditor() {
  const [destination, setDestination] = useState<ReviewDestination>("both");
  const [purpose, setPurpose] = useState<ReviewPurpose>("experience");
  const [strength, setStrength] = useState<ReviewStrength>("light");
  const [originalText, setOriginalText] = useState("");
  const [keepExpressions, setKeepExpressions] = useState("");
  const [additionalFacts, setAdditionalFacts] = useState("");
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/note/editor/jobs/${job.id}`);
        const data = (await response.json()) as { job?: PublicJob; error?: string };
        if (!response.ok || !data.job) throw new Error(data.error);
        setJob(data.job);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "状態を取得できません");
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job]);

  async function submit(overrides: Partial<{
    destination: ReviewDestination;
    strength: ReviewStrength;
    originalText: string;
  }> = {}) {
    const source = overrides.originalText ?? originalText;
    if (source.trim().length < 10) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/note/editor/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: overrides.destination ?? destination,
          purpose,
          strength: overrides.strength ?? strength,
          originalText: source,
          keepExpressions: keepExpressions.split("\n"),
          additionalFacts: additionalFacts.split("\n"),
        }),
      });
      const data = (await response.json()) as { job?: PublicJob; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error);
      setJob(data.job);
      setMessage("MacのLocal AI Workerへ添削を依頼しました。Macが停止中の場合は保留されます。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "添削を依頼できません");
    } finally {
      setLoading(false);
    }
  }

  async function decide(action: "adopt" | "reject" | "save-experience") {
    if (!job) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/note/editor/jobs/${job.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      if (action === "adopt") {
        setJob({ ...job, status: "adopted" });
        setMessage("採用しました。外部公開せず、投稿キューへ下書きとして保存しました。");
      } else if (action === "reject") {
        setJob({ ...job, status: "rejected" });
        setMessage("却下履歴を保存しました。");
      } else {
        setMessage("体験ライブラリへ未確認の下書きとして保存しました。確認後に利用できます。");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作に失敗しました");
    }
  }

  const result = job?.result;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="本人原稿をLocal AIで添削"
          hint="前川さんの文章を中心に、MacのOllamaが構成・表現だけを整えます"
          action={<Laptop className="h-4 w-4 text-brand" />}
        />
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-gain/25 bg-gain/10 p-3 text-xs leading-relaxed text-gain">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          採用しても外部公開されません。X・noteとも必ず下書きで停止します。
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="投稿先" value={destination} onChange={(v) => setDestination(v as ReviewDestination)}>
            <option value="x">X</option><option value="note">note</option><option value="both">Xとnote両方</option>
          </Select>
          <Select label="記事の目的" value={purpose} onChange={(v) => setPurpose(v as ReviewPurpose)}>
            <option value="awareness">認知</option><option value="experience">体験共有</option>
            <option value="howto">ノウハウ</option><option value="product">商品紹介</option>
            <option value="values">価値観</option>
          </Select>
          <Select label="修正の強さ" value={strength} onChange={(v) => setStrength(v as ReviewStrength)}>
            <option value="light">軽く整える</option><option value="structure">読みやすく構成変更</option>
            <option value="rewrite">大幅に書き直す</option>
          </Select>
        </div>
        <label className="mt-3 block text-[11px] text-sub">元になる文章 *</label>
        <textarea value={originalText} onChange={(e) => setOriginalText(e.target.value)} rows={10}
          placeholder="前川さんが作成した大枠・メモ・下書きを入力してください"
          className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand/50" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextArea label="残したい表現（1行に1つ）" value={keepExpressions} onChange={setKeepExpressions} />
          <TextArea label="確認済みの追加事実（1行に1つ）" value={additionalFacts} onChange={setAdditionalFacts} />
        </div>
        <button onClick={() => submit()} disabled={loading || originalText.trim().length < 10}
          className="mt-3 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-40">
          {loading ? "依頼中…" : "MacのLocal AIへ添削を依頼"}
        </button>
        {message && <p className="mt-3 text-xs text-gain">{message}</p>}
        {error && <p className="mt-3 text-xs text-loss">{error}</p>}
        {job && ["pending", "running"].includes(job.status) && (
          <p className="mt-3 text-xs text-sub">
            状態: {job.status === "pending" ? "保留中（Mac側Workerの起動待ち）" : "添削中"}
          </p>
        )}
      </Card>

      {result && (
        <Card>
          <CardHeader title="添削結果" hint={`品質評価 ${result.score.total}/25`} />
          <Compare label="添削前" text={job.input.originalText} />
          <Compare label="添削後" text={result.revisedText} />
          <List title="主な修正点" items={result.changes} />
          <List title="確認が必要な点" items={result.questions} empty="確認事項はありません" />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Score label="ブランド" value={result.score.brandFit} />
            <Score label="有用性" value={result.score.usefulness} />
            <Score label="独自性" value={result.score.originality} />
            <Score label="読みやすさ" value={result.score.readability} />
            <Score label="信頼性" value={result.score.reliability} />
          </div>
          {job.status === "completed" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Action label="この内容を採用" onClick={() => decide("adopt")} primary />
              <Action label="軽く再修正" onClick={() => submit({ originalText: result.revisedText, strength: "light" })} />
              <Action label="大幅に再修正" onClick={() => submit({ originalText: result.revisedText, strength: "rewrite" })} />
              <Action label="X用に短縮" onClick={() => submit({ originalText: result.revisedText, destination: "x", strength: "structure" })} />
              <Action label="note記事に展開" onClick={() => submit({ originalText: result.revisedText, destination: "note", strength: "structure" })} />
              <Action label="実体験として保存" onClick={() => decide("save-experience")} />
              <Action label="却下" onClick={() => decide("reject")} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="text-[11px] text-sub">{label}<select value={value} onChange={(e) => onChange(e.target.value)}
    className="mt-1 w-full rounded-xl border border-hairline bg-ink-card px-3 py-2 text-sm text-white">{children}</select></label>;
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-[11px] text-sub">{label}<textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)}
    className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none" /></label>;
}
function Compare({ label, text }: { label: string; text: string }) {
  return <div className="mb-3 rounded-xl border border-hairline bg-ink-base/60 p-3"><p className="mb-2 text-[11px] font-semibold text-sub">{label}</p>
    <p className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{text}</p></div>;
}
function List({ title, items, empty = "ありません" }: { title: string; items: string[]; empty?: string }) {
  return <div className="mt-3"><p className="text-xs font-semibold text-white">{title}</p><ul className="mt-1 text-xs leading-6 text-sub">
    {items.length ? items.map((item, i) => <li key={i}>・{item}</li>) : <li>{empty}</li>}</ul></div>;
}
function Score({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-hairline p-2 text-center text-sub">{label}<strong className="ml-1 text-white">{value}/5</strong></div>;
}
function Action({ label, onClick, primary = false }: { label: string; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-2 text-xs ${primary ? "bg-brand font-bold text-white" : "border border-hairline text-slate-300"}`}>{label}</button>;
}
