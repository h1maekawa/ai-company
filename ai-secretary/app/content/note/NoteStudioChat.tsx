"use client";

import { useEffect, useState } from "react";
import { Check, Send, X } from "lucide-react";

type ArticleSession = {
  id: string;
  title: string;
  stage: string;
  messages: { id: string; role: "user" | "assistant"; text: string; createdAt: string }[];
  materialIds: string[];
  researchIds: string[];
  viewpointIds: string[];
  experienceIds: string[];
  angles?: { id: string; label: string; description: string; selected: boolean }[];
  angle?: string;
  outline?: string;
  draftId?: string;
  contentGoal?: string;
  offerIds?: string[];
  ctaIds?: string[];
};

const STAGE_ORDER = [
  "MATERIAL",
  "ANGLE",
  "INTERVIEW",
  "VIEWPOINT",
  "EXPERIENCE",
  "OUTLINE",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
];

async function api<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "リクエストに失敗しました");
  return data;
}

export function NoteStudioChat({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [session, setSession] = useState<ArticleSession | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [viewpointDraft, setViewpointDraft] = useState<any>(null);
  const [experienceDraft, setExperienceDraft] = useState<any>(null);
  const [savedViewpointId, setSavedViewpointId] = useState<string | null>(null);
  const [savedExperienceId, setSavedExperienceId] = useState<string | null>(null);

  const refresh = () => api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}`, "GET").then((d) => setSession(d.session));

  useEffect(() => {
    refresh();
  }, [sessionId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  const sendMessage = () =>
    run(async () => {
      if (!input.trim()) return;
      const text = input;
      setInput("");
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}/messages`, "POST", { text });
      setSession(d.session);
    });

  const advanceStage = (stage: string) =>
    run(async () => {
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}`, "PATCH", { stage });
      setSession(d.session);
    });

  const suggestAngles = () =>
    run(async () => {
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}/angles`, "POST");
      setSession(d.session);
    });

  const selectAngle = (angleId: string) =>
    run(async () => {
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}/angles`, "PATCH", { angleId });
      setSession(d.session);
    });

  const extractViewpoint = () =>
    run(async () => {
      const d = await api<{ draft: any }>(`/api/content/sessions/${sessionId}/viewpoint`, "POST", { action: "extract" });
      setViewpointDraft(d.draft);
    });

  const saveAndApproveViewpoint = (approve: boolean) =>
    run(async () => {
      if (!viewpointDraft) return;
      const saved = await api<{ viewpoint: any; session: ArticleSession }>(`/api/content/sessions/${sessionId}/viewpoint`, "POST", {
        action: "save",
        viewpoint: viewpointDraft,
      });
      setSession(saved.session);
      setSavedViewpointId(saved.viewpoint.id);
      if (approve) {
        await api(`/api/content/sessions/${sessionId}/viewpoint`, "PATCH", { viewpointId: saved.viewpoint.id, decision: "approve" });
      }
      setViewpointDraft(null);
    });

  const extractExperience = () =>
    run(async () => {
      const d = await api<{ draft: any }>(`/api/content/sessions/${sessionId}/experience`, "POST", { action: "extract" });
      setExperienceDraft(d.draft);
    });

  const saveAndApproveExperience = (approve: boolean) =>
    run(async () => {
      if (!experienceDraft) return;
      const saved = await api<{ experience: any; session: ArticleSession }>(`/api/content/sessions/${sessionId}/experience`, "POST", {
        action: "save",
        experience: experienceDraft,
      });
      setSession(saved.session);
      setSavedExperienceId(saved.experience.id);
      if (approve) {
        await api(`/api/content/sessions/${sessionId}/experience`, "PATCH", { experienceId: saved.experience.id, decision: "approve" });
      }
      setExperienceDraft(null);
    });

  const generateOutline = () =>
    run(async () => {
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}/outline`, "POST");
      setSession(d.session);
    });

  const generateDraft = () =>
    run(async () => {
      const d = await api<{ draft: any; session: ArticleSession }>(`/api/content/sessions/${sessionId}/draft`, "POST");
      setDraft(d.draft);
      setSession(d.session);
    });

  const saveDraftEdit = (body: string) =>
    run(async () => {
      const d = await api<{ draft: any; session: ArticleSession }>(`/api/content/sessions/${sessionId}/draft`, "PATCH", { body });
      setDraft(d.draft);
      setSession(d.session);
    });

  const draftAction = (action: string) =>
    run(async () => {
      const d = await api<{ draft: any; session: ArticleSession }>(`/api/content/sessions/${sessionId}/draft`, "PATCH", { action });
      setDraft(d.draft);
      setSession(d.session);
    });

  const publish = (url: string) =>
    run(async () => {
      const d = await api<{ session: ArticleSession }>(`/api/content/sessions/${sessionId}/publish`, "POST", { url });
      setSession(d.session);
    });

  if (!session) return <p className="text-xs text-sub">読み込み中…</p>;

  const stageIndex = STAGE_ORDER.indexOf(session.stage);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-sub hover:text-white">← Note Studioへ戻る</button>
          <div className="flex flex-wrap gap-1">
            {STAGE_ORDER.map((stage, i) => (
              <span
                key={stage}
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  i === stageIndex ? "bg-brand text-white" : i < stageIndex ? "bg-gain/20 text-gain" : "bg-white/5 text-sub"
                }`}
              >
                {stage}
              </span>
            ))}
          </div>
        </div>

        <h2 className="text-lg font-bold">{session.title}</h2>
        {error && <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}

        <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-hairline bg-ink-card p-4">
          {session.messages.length === 0 && <p className="text-xs text-sub">AIと話しながら考えを整理しましょう。まずは今の気持ちをそのまま書いてください。</p>}
          {session.messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-brand/20" : "bg-white/5"}`}>
              {m.text}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="思っていることをそのまま書いてください"
            className="flex-1 rounded-xl border border-hairline bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-brand/50"
          />
          <button onClick={sendMessage} disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Stage別アクション */}
        {(session.stage === "MATERIAL" || session.stage === "INTERVIEW") && (
          <button onClick={() => (session.stage === "MATERIAL" ? advanceStage("ANGLE").then(suggestAngles) : advanceStage("VIEWPOINT"))} disabled={busy} className="w-full rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm font-semibold text-brand">
            {session.stage === "MATERIAL" ? "次へ：切り口(Angle)を考える" : "次へ：視点(Viewpoint)を確認する"}
          </button>
        )}

        {session.stage === "ANGLE" && (
          <div className="space-y-2 rounded-2xl border border-hairline bg-ink-card p-4">
            <p className="text-sm font-semibold">同じ材料から複数の切り口を提案しました</p>
            {(session.angles ?? []).map((a) => (
              <button key={a.id} onClick={() => selectAngle(a.id)} className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${a.selected ? "border-brand bg-brand/10" : "border-hairline bg-white/[0.02]"}`}>
                <p className="font-semibold">{a.label}</p>
                <p className="mt-0.5 text-sub">{a.description}</p>
              </button>
            ))}
            {session.angle && (
              <button onClick={() => advanceStage("INTERVIEW")} className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold">
                このAngleで進める
              </button>
            )}
          </div>
        )}

        {session.stage === "VIEWPOINT" && (
          <div className="space-y-2 rounded-2xl border border-hairline bg-ink-card p-4">
            <p className="text-sm font-semibold">Viewpoint（本人の主張）</p>
            {!viewpointDraft && !savedViewpointId && (
              <button onClick={extractViewpoint} className="rounded-lg border border-hairline px-3 py-2 text-xs">会話から主張を推測する</button>
            )}
            {viewpointDraft && (
              <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
                <p>ここまでの話から、「{viewpointDraft.opinion || "（読み取れませんでした）"}」というのが今回の主張だと理解しました。</p>
                <div className="flex gap-2">
                  <button onClick={() => saveAndApproveViewpoint(true)} className="flex items-center gap-1 rounded-lg bg-gain/20 px-3 py-1.5 text-gain"><Check className="h-3 w-3" />合っている</button>
                  <button onClick={() => saveAndApproveViewpoint(false)} className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5"><X className="h-3 w-3" />修正する（下書きとして保存）</button>
                </div>
              </div>
            )}
            {savedViewpointId && <button onClick={() => advanceStage("EXPERIENCE")} className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold">次へ：実体験を確認する</button>}
          </div>
        )}

        {session.stage === "EXPERIENCE" && (
          <div className="space-y-2 rounded-2xl border border-hairline bg-ink-card p-4">
            <p className="text-sm font-semibold">この記事で使えそうな実体験</p>
            {!experienceDraft && !savedExperienceId && (
              <button onClick={extractExperience} className="rounded-lg border border-hairline px-3 py-2 text-xs">会話から体験を抜き出す</button>
            )}
            {experienceDraft && (
              <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
                <p>「{experienceDraft.whatHappened || "（会話内に体験が見つかりませんでした）"}」</p>
                <div className="flex gap-2">
                  <button onClick={() => saveAndApproveExperience(true)} className="rounded-lg bg-gain/20 px-3 py-1.5 text-gain">実体験として使う</button>
                  <button onClick={() => saveAndApproveExperience(false)} className="rounded-lg bg-white/5 px-3 py-1.5">修正</button>
                  <button onClick={() => setExperienceDraft(null)} className="rounded-lg bg-white/5 px-3 py-1.5">使用しない</button>
                </div>
              </div>
            )}
            {(savedExperienceId || session.experienceIds.length > 0) && (
              <button onClick={() => advanceStage("OUTLINE").then(generateOutline)} className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold">次へ：構成(Outline)を作る</button>
            )}
            <button onClick={() => advanceStage("OUTLINE").then(generateOutline)} className="w-full rounded-lg border border-hairline px-3 py-2 text-xs text-sub">体験は無しで次へ</button>
          </div>
        )}

        {session.stage === "OUTLINE" && (
          <div className="space-y-2 rounded-2xl border border-hairline bg-ink-card p-4">
            <p className="text-sm font-semibold">Outline（構成案）</p>
            <textarea value={session.outline ?? ""} onChange={(e) => setSession({ ...session, outline: e.target.value })} rows={8} className="w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs" />
            <div className="flex gap-2">
              <button onClick={generateOutline} className="rounded-lg border border-hairline px-3 py-2 text-xs">再生成</button>
              <button
                onClick={() =>
                  run(async () => {
                    await api(`/api/content/sessions/${sessionId}/outline`, "PATCH", { outline: session.outline });
                    await advanceStage("DRAFT");
                    await generateDraft();
                  })
                }
                className="flex-1 rounded-lg bg-brand px-3 py-2 text-xs font-semibold"
              >
                Outlineを承認して本文を作る
              </button>
            </div>
          </div>
        )}

        {(session.stage === "DRAFT" || session.stage === "REVIEW" || session.stage === "APPROVED" || session.stage === "PUBLISHED") && (
          <DraftPanel
            sessionId={sessionId}
            stage={session.stage}
            draft={draft}
            onGenerate={generateDraft}
            onSave={saveDraftEdit}
            onAction={draftAction}
            onPublish={publish}
          />
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-hairline bg-ink-card p-4 text-xs">
          <p className="font-semibold text-sub">Context</p>
          <p className="mt-2">Material: {session.materialIds.length}件</p>
          <p>Research: {session.researchIds.length}件</p>
          <p>Viewpoint: {session.viewpointIds.length}件</p>
          <p>Experience: {session.experienceIds.length}件</p>
          {session.angle && <p className="mt-2 rounded bg-white/5 p-2">Angle: {session.angle}</p>}
        </div>
      </aside>
    </div>
  );
}

function DraftPanel({
  sessionId,
  stage,
  draft,
  onGenerate,
  onSave,
  onAction,
  onPublish,
}: {
  sessionId: string;
  stage: string;
  draft: any;
  onGenerate: () => Promise<void>;
  onSave: (body: string) => Promise<void>;
  onAction: (action: string) => Promise<void>;
  onPublish: (url: string) => Promise<void>;
}) {
  const [body, setBody] = useState(draft?.freeSection ?? "");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (draft?.freeSection !== undefined) setBody(draft.freeSection);
  }, [draft?.freeSection]);

  return (
    <div className="space-y-2 rounded-2xl border border-hairline bg-ink-card p-4">
      <p className="text-sm font-semibold">Draft（本人が編集する前提の下書き）</p>
      {!draft && (
        <button onClick={onGenerate} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold">下書きを生成する</button>
      )}
      {draft && (
        <>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="w-full rounded-lg border border-hairline bg-white/[0.02] p-3 text-xs leading-relaxed" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onSave(body)} className="rounded-lg border border-hairline px-3 py-2 text-xs">本文を保存</button>
            <button onClick={() => onAction("obsidian-save")} className="rounded-lg border border-hairline px-3 py-2 text-xs">Obsidianへ保存</button>
            <button onClick={() => onAction("publish-queue")} className="rounded-lg border border-hairline px-3 py-2 text-xs">Publish Queueへ</button>
            {stage !== "APPROVED" && stage !== "PUBLISHED" && (
              <button onClick={() => onAction("approve")} className="rounded-lg bg-gain/20 px-3 py-2 text-xs text-gain">本人承認（APPROVED）</button>
            )}
          </div>
          {stage === "APPROVED" && (
            <div className="flex gap-2 border-t border-hairline pt-3">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="公開したnoteのURL（任意）" className="flex-1 rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
              <button onClick={() => onPublish(url)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold">公開記録を作成</button>
            </div>
          )}
          {stage === "PUBLISHED" && <p className="rounded-lg bg-gain/10 px-3 py-2 text-xs text-gain">公開済みです。Performanceで結果を記録できます。</p>}
        </>
      )}
    </div>
  );
}
