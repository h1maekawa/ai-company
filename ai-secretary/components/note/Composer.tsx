"use client";

import { useEffect, useState } from "react";
import { PenLine, ShieldCheck } from "lucide-react";
import type { Genre, Idea, XAccount } from "@/app/lib/note/types";
import { Card, CardHeader, Badge, Skeleton } from "@/components/ui/primitives";
import { LocalAiEditor } from "./LocalAiEditor";

type ComposeResponse = {
  article: string;
  xPosts: string[];
  xAccount: XAccount | null;
  lineMessage: string;
  usedAffiliateIds: string[];
  needsDisclosure: boolean;
  title: string;
  genre: Genre;
  availableAffiliates: number;
  error?: string;
};

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-hairline bg-ink-base/60">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[11px] font-semibold text-sub">{label}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-[11px] text-brand hover:underline"
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6 text-slate-300">
        {text}
      </pre>
    </div>
  );
}

/**
 * 記事・X投稿・LINE配信をまとめて作る。
 * ブランディングと登録済みアフィリエイトを前提に生成される。
 */
export function Composer({
  genres,
  seed,
  onUsed,
}: {
  genres: Genre[];
  /** ネタ帳から「書く」で渡されたネタ */
  seed: Idea | null;
  onUsed: () => void;
}) {
  const [title, setTitle] = useState("");
  const [genreId, setGenreId] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<ComposeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"generate" | "edit" | "import">("generate");

  // ネタ帳から渡ってきたら入力欄へ流し込む
  useEffect(() => {
    if (!seed) return;
    setTitle(seed.title);
    setGenreId(seed.genreId);
    setTakeaway(seed.takeaway ?? "");
    setResult(null);
    onUsed();
  }, [seed, onUsed]);

  async function generate() {
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/note/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          genreId: genreId || genres[0]?.id,
          takeaway,
          context,
        }),
      });
      const data = (await response.json()) as ComposeResponse;
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-hairline bg-ink-card p-1">
        <button onClick={() => setMode("generate")} className={`rounded-lg px-3 py-2 text-sm ${mode === "generate" ? "bg-brand font-bold text-white" : "text-sub"}`}>
          AIで大枠から生成
        </button>
        <button onClick={() => setMode("edit")} className={`rounded-lg px-3 py-2 text-sm ${mode === "edit" ? "bg-brand font-bold text-white" : "text-sub"}`}>
          本人原稿を添削
        </button>
        <button onClick={() => setMode("import")} className={`rounded-lg px-3 py-2 text-sm ${mode === "import" ? "bg-brand font-bold text-white" : "text-sub"}`}>
          完成原稿を登録
        </button>
      </div>
      {mode === "edit" ? <LocalAiEditor /> : mode === "import" ? <CompletedDraftImporter /> : <>
      <Card>
        <CardHeader
          title="記事を作る"
          hint="ブランディングと登録済みアフィリエイトを前提に、note記事・X投稿・LINE文をまとめて作ります"
        />

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-sub">タイトル *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：AIで議事録作成を10分に短縮した手順"
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] text-sub">ジャンル</label>
              <select
                value={genreId || genres[0]?.id || ""}
                onChange={(e) => setGenreId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-hairline bg-ink-card px-3 py-2 text-sm text-white outline-none"
              >
                {genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-sub">読者が持ち帰ること</label>
              <input
                value={takeaway}
                onChange={(e) => setTakeaway(e.target.value)}
                placeholder="例：議事録を10分で終わらせる手順が分かる"
                className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-sub">
              自分の実体験・材料（ここが濃いほど記事が具体的になります）
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={5}
              placeholder="実際にやったこと、使ったツール、詰まった点、かかった時間など"
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-sub/70 focus:border-brand/50"
            />
          </div>

          <button
            onClick={generate}
            disabled={loading || !title.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand/85 disabled:opacity-40"
          >
            <PenLine className="h-4 w-4" />
            {loading ? "AIが書いています…" : "記事・X・LINEをまとめて作る"}
          </button>
          {error && <p className="text-xs text-loss">{error}</p>}
        </div>
      </Card>

      {loading && <Skeleton className="h-64 rounded-2xl" />}

      {result && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{result.genre.label}</Badge>
              {result.needsDisclosure ? (
                <span className="flex items-center gap-1 rounded-full border border-gain/25 bg-gain/10 px-2 py-0.5 text-[11px] text-gain">
                  <ShieldCheck className="h-3 w-3" />
                  PR表記あり（{result.usedAffiliateIds.length}件のリンク使用）
                </span>
              ) : (
                <span className="text-[11px] text-sub">
                  アフィリエイトなし（このジャンルの使える案件: {result.availableAffiliates}件）
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-sub">
              本文に登録外のURLが含まれていた場合は自動で取り除いています。公開前に内容をご確認ください。
            </p>
          </Card>

          <CopyBlock label="note記事" text={result.article} />

          {result.xPosts.length > 0 && (
            <Card padded={false}>
              <div className="px-5 pt-5">
                <CardHeader
                  title="X投稿案"
                  hint={
                    result.xAccount
                      ? `${result.xAccount.label}${result.xAccount.handle ? `（@${result.xAccount.handle}）` : ""} 向け`
                      : "このジャンルはまだXアカウントに割り当てられていません（ブランディング画面で設定できます）"
                  }
                />
              </div>
              <ul className="divide-y divide-hairline/60">
                {result.xPosts.map((post, i) => (
                  <li key={i} className="px-5 py-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                      {post}
                    </p>
                    <button
                      onClick={() => navigator.clipboard.writeText(post)}
                      className="mt-1.5 text-[11px] text-brand hover:underline"
                    >
                      コピー
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {result.lineMessage && <CopyBlock label="公式LINE配信文" text={result.lineMessage} />}
        </>
      )}
      </>}
    </div>
  );
}

function CompletedDraftImporter() {
  const [title, setTitle] = useState("");
  const [article, setArticle] = useState("");
  const [xText, setXText] = useState("");
  const [needsDisclosure, setNeedsDisclosure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function saveDraft() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/note/content/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          article,
          needsDisclosure,
          genreId: "reading",
          xPosts: xText.split(/\n-{3,}\n/).map((text) => text.trim()).filter(Boolean),
        }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message ?? "下書きへ保存しました");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="完成した原稿を下書きへ登録"
        hint="AIで書き換えず、入力した文章をそのまま保存します。自動公開はしません"
      />
      <div className="space-y-3">
        <FieldLabel label="noteタイトル">
          <input value={title} onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] px-3 py-2 text-sm outline-none" />
        </FieldLabel>
        <FieldLabel label="note本文">
          <textarea value={article} onChange={(event) => setArticle(event.target.value)} rows={18}
            placeholder="完成した本文を貼り付けます"
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] p-3 text-sm leading-6 outline-none" />
        </FieldLabel>
        <FieldLabel label="X投稿案（複数ある場合は --- だけの行で区切る）">
          <textarea value={xText} onChange={(event) => setXText(event.target.value)} rows={8}
            className="mt-1 w-full rounded-xl border border-hairline bg-white/[0.03] p-3 text-sm outline-none" />
        </FieldLabel>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={needsDisclosure} onChange={(event) => setNeedsDisclosure(event.target.checked)} />
          アフィリエイト広告を含む（PR表記が必要）
        </label>
        <button onClick={saveDraft} disabled={busy || !title.trim() || !article.trim()}
          className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "保存しています…" : "note・Xの下書きへ保存"}
        </button>
        {message && <p className="text-xs text-gain">{message}</p>}
      </div>
    </Card>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[11px] text-sub">{label}{children}</label>;
}
