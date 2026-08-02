"use client";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import type { XAccount } from "@/app/lib/note/types";
import type { OwnedXPost, XReferenceNote, XWorkspaceData } from "@/app/lib/note/x/types";
import { countXCharacters, openXComposeIntent, X_POST_LIMIT } from "@/app/lib/note/x/web-intents";
import { parseXPostUrl } from "@/app/lib/note/x/urls";
import { useReferences, useResearchSettings } from "@/app/note/useResearch";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { XEmbeddedPost } from "./XEmbeddedPost";
import { XEmbeddedTimeline } from "./XEmbeddedTimeline";

const empty: XWorkspaceData = { ownedPosts: [], referenceNotes: [] };

export function XWorkspace({ accounts, onOpenLocalEditor }: { accounts: XAccount[]; onOpenLocalEditor: () => void }) {
  const settings = useResearchSettings();
  const references = useReferences();
  const [data, setData] = useState<XWorkspaceData>(empty);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [timelineHandle, setTimelineHandle] = useState(accounts[0]?.handle ?? "");
  const [draft, setDraft] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const count = countXCharacters(draft);

  useEffect(() => {
    fetch("/api/note/x/workspace").then((r) => r.json()).then(setData).catch(() => setError("履歴を読み込めません"));
  }, []);

  const timelineChoices = useMemo(() => [
    ...accounts.filter((a) => a.handle).map((a) => ({ id: `owned:${a.id}`, label: `自分: ${a.label}`, handle: a.handle })),
    ...references.xAccounts.filter((a) => a.active && a.handle).map((a) => ({ id: `ref:${a.id}`, label: `参考: @${a.handle}`, handle: a.handle })),
  ], [accounts, references.xAccounts]);

  async function save(next: XWorkspaceData) {
    const response = await fetch("/api/note/x/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
    });
    const body = await response.json() as XWorkspaceData & { error?: string };
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }

  function openCompose() {
    if (!draft.trim() || count > X_POST_LIMIT) return;
    const opened = openXComposeIntent(draft);
    setNotice(opened
      ? "X公式投稿画面を開きました。最終投稿はX側で本人が確定してください。戻ったら投稿済み登録を行います。"
      : "ポップアップがブロックされました。ブラウザでこのサイトのポップアップを許可してください。");
  }

  async function markPosted(source: "ai-secretary" | "manual" = "ai-secretary") {
    if (!draft.trim()) return;
    if (finalUrl && !parseXPostUrl(finalUrl)) {
      setError("投稿URLの形式が不正です"); return;
    }
    const now = new Date().toISOString();
    const post: OwnedXPost = {
      id: `ox_${Date.now().toString(36)}`, accountId: accountId || "maemichi", text: draft.trim(),
      url: finalUrl.trim() || undefined, postedAt: now, source, genreIds: [],
      verifiedByUser: true, finalTextConfirmed: true, createdAt: now, updatedAt: now,
    };
    await save({ ...data, ownedPosts: [post, ...data.ownedPosts] });
    setNotice("本人投稿履歴へ保存しました。Xへ自動投稿はしていません。");
  }

  async function saveReference() {
    const parsed = parseXPostUrl(postUrl);
    if (!parsed) { setError("正しいXポストURLを入力してください"); return; }
    const reason = window.prompt("この投稿を参考にする理由を入力してください");
    if (!reason?.trim()) return;
    const note: XReferenceNote = {
      id: `xr_${Date.now().toString(36)}`, postUrl: parsed.canonicalUrl,
      reason: reason.trim(), createdAt: new Date().toISOString(),
    };
    await save({ ...data, referenceNotes: [note, ...data.referenceNotes] });
    setNotice("他者の全文ではなく、参考理由だけを保存しました。");
  }

  if (settings.loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!settings.flags?.xFreeWorkspaceEnabled) {
    return <Card><CardHeader title="Xワークスペースは停止中です" hint="初期値は安全のためOFFです" />
      <button onClick={() => settings.save({ flags: { xFreeWorkspaceEnabled: true } })}
        className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white">無料モードで有効にする</button></Card>;
  }

  return <div className="space-y-4">
    <Card><div className="flex items-center gap-2 text-sm font-semibold text-gain"><ShieldCheck className="h-4 w-4" />無料モード</div>
      <p className="mt-1 text-xs text-sub">X API・SerpAPI・Buffer・ブラウザ自動操作は使いません。投稿確定は必ず本人がX公式画面で行います。</p></Card>
    <Card>
      <CardHeader title="使い方は3ステップです" hint="この画面から勝手に投稿されることはありません" />
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["1", "右側で調べる", "参考アカウントの投稿を見て、書くテーマを決めます"],
          ["2", "左側で文章を作る", "自分の意見や体験を入れ、必要ならMacのAIで整えます"],
          ["3", "Xで確認して投稿", "X公式画面を開き、内容を確認して本人が投稿します"],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-lg border border-hairline bg-white/[0.02] p-3">
            <span className="text-xs font-bold text-gain">STEP {number}</span>
            <p className="mt-1 text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-sub">{text}</p>
          </div>
        ))}
      </div>
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card><CardHeader title="2. Xに載せる文章を作る" hint="前川さん自身の言葉や体験を中心に入力してください" />
          <button onClick={onOpenLocalEditor} className="mb-3 rounded-lg border border-brand/40 px-3 py-2 text-xs text-brand">
            MacのAIで文章を読みやすくする
          </button>
          <details className="mb-3 text-[10px] text-sub">
            <summary className="cursor-pointer">使用するAIについて</summary>
            <p className="mt-1">最初にMac内のOllamaを使います。Geminiは明示設定した無料モデルだけ利用でき、有料サービスへの自動切替はありません。</p>
          </details>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mb-2 w-full rounded-lg border border-hairline bg-ink-card px-3 py-2 text-sm">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10}
            placeholder="投稿案を入力。Ollama添削は「記事を作る → 本人原稿を添削」でも利用できます"
            className="w-full rounded-xl border border-hairline bg-white/[0.03] p-3 text-sm outline-none" />
          <p className={`mt-1 text-right text-xs ${count > X_POST_LIMIT ? "text-loss" : "text-sub"}`}>{count}/{X_POST_LIMIT}</p>
          <button onClick={openCompose} disabled={!draft.trim() || count > X_POST_LIMIT}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold disabled:opacity-40">
            <ExternalLink className="h-4 w-4" />3. X公式画面で内容を確認する
          </button>
          <div className="mt-3 border-t border-hairline pt-3">
            <label className="text-xs text-sub">X側で投稿した後のURL（任意）</label>
            <input value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} placeholder="https://x.com/.../status/..."
              className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-3 py-2 text-xs" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => markPosted("ai-secretary")} className="rounded-lg border border-gain/40 px-3 py-2 text-xs text-gain">本人が投稿済みにする</button>
              <button onClick={() => markPosted("manual")} className="rounded-lg border border-hairline px-3 py-2 text-xs">過去投稿を手動登録</button>
            </div>
          </div>
        </Card>
        <Card><CardHeader title="本人投稿履歴" hint={`${data.ownedPosts.length}件`} />
          <div className="max-h-72 space-y-2 overflow-auto">
            {data.ownedPosts.slice(0, 20).map((p) => <div key={p.id} className="rounded-lg border border-hairline p-2 text-xs">
              <p className="whitespace-pre-wrap">{p.text}</p><p className="mt-1 text-sub">{p.source} / {p.verifiedByUser ? "本人確認済み" : "未確認"}</p>
            </div>)}
            {!data.ownedPosts.length && <p className="text-xs text-sub">まだありません。</p>}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card><CardHeader title="1. Xで話題や書き方を調べる" hint="自分または参考アカウントを選んで投稿を見ます" />
          <select value={timelineHandle} onChange={(e) => setTimelineHandle(e.target.value)}
            className="mb-3 w-full rounded-lg border border-hairline bg-ink-card px-3 py-2 text-sm">
            <option value="">アカウントを選択</option>
            {timelineChoices.map((a) => <option key={a.id} value={a.handle}>{a.label}</option>)}
          </select>
          <div className="max-h-[680px] overflow-auto"><XEmbeddedTimeline handle={timelineHandle} /></div>
        </Card>
        <Card><CardHeader title="特定の投稿を詳しく見る" hint="参考にしたいX投稿のURLを貼り付けます" />
          <input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://x.com/handle/status/123..."
            className="w-full rounded-lg border border-hairline bg-white/[0.03] px-3 py-2 text-xs" />
          <div className="mt-3"><XEmbeddedPost url={postUrl} /></div>
          {parseXPostUrl(postUrl) && <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={saveReference} className="rounded-lg border border-hairline px-3 py-2 text-xs">参考ポイントを記録</button>
            <button onClick={() => { setFinalUrl(postUrl); setNotice("本人投稿として保存する場合は、左側へ本人が確認した本文を入力してください。"); }}
              className="rounded-lg border border-hairline px-3 py-2 text-xs">自分の投稿として登録</button>
            <button onClick={() => { setDraft(""); setNotice("他者の本文は自動取得しません。参考ポイントを見て、自分の言葉で左側へ下書きを作成してください。"); }}
              className="rounded-lg border border-hairline px-3 py-2 text-xs">この投稿を元に下書き</button>
          </div>}
        </Card>
      </div>
    </div>
    {notice && <p className="text-xs text-gain">{notice}</p>}
    {error && <p className="text-xs text-loss">{error}</p>}
  </div>;
}
