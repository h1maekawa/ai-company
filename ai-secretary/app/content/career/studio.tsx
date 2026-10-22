"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CareerKnowledgeItem, CareerPost, CareerState } from "@/app/lib/content/career/types";
import { careerCarouselHtml, careerSlideOverflow } from "@/app/lib/content/career/renderer";
import type { BufferDryRunReport } from "@/app/lib/content/career/bufferGate";

type Data = {
  state: CareerState;
  publishEnabled: false;
  brand: {
    publicName: string;
    privacyPolicy: string;
  };
};

const empty: CareerState = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };

export default function CareerStudio() {
  const [state, setState] = useState<CareerState>(empty);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<"transcript" | "note">("transcript");
  const [weekStartDate, setWeek] = useState(nextMonday());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationModel, setGenerationModel] = useState<"template" | "ollama">("ollama");
  const [preview, setPreview] = useState<CareerPost | null>(null);
  const [dryRunReport, setDryRunReport] = useState<BufferDryRunReport | null>(null);
  const [renderingImages, setRenderingImages] = useState<string | null>(null);
  const [renderedPostImages, setRenderedPostImages] = useState<Record<string, number>>({});

  // 要件定義AI用
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqPrompt, setReqPrompt] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqGenerating, setReqGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<{ id: string; markdownContent: string } | null>(null);

  const refresh = async () => {
    const response = await fetch("/api/content/career");
    if (!response.ok) throw new Error((await response.json()).error ?? "Career store unavailable");
    const data = await response.json() as Data;
    setState(data.state);
  };

  useEffect(() => {
    refresh().catch((reason) => setError(String(reason))).finally(() => setLoading(false));
  }, []);

  const knowledge = useMemo(() => state.knowledgeItems.filter((item) => item.divisionId === "career"), [state.knowledgeItems]);

  async function submit(url: string, payload: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function ingest(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccessMsg("");
    try {
      await submit("/api/content/career", { action: "ingest", type: sourceType, title: title || "就活経験の文字起こし", text });
      setText("");
      setTitle("");
      setSuccessMsg("就活ナレッジを取り込みました。");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function seedWeek1() {
    setError("");
    setSuccessMsg("");
    try {
      const result = await submit("/api/content/career/seed", {});
      setSuccessMsg(`初週コンテンツ14件（X 7本・Instagram 7本×5スライド）をインポートしました。`);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function generate() {
    setError("");
    setSuccessMsg("");
    setGenerating(true);
    try {
      if (generationModel === "ollama") {
        await submit("/api/content/career/generate", { weekStartDate, knowledgeItemIds: selected });
        setSuccessMsg("ローカルOllama (qwen3:8b) により週次14投稿（X 7本 + IG 35枚）を生成しました。");
      } else {
        await submit("/api/content/career/batches", { weekStartDate, knowledgeItemIds: selected });
        setSuccessMsg("テンプレートにより週次14投稿を生成しました。");
      }
      setSelected([]);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setGenerating(false);
    }
  }

  async function approve(post: CareerPost) {
    setError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`/api/content/career/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccessMsg(`投稿「${post.title}」を承認しました。`);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function editPost(post: CareerPost) {
    let payload: { body: string } | { caption: string; slides: Array<{ headline: string; body: string }> };
    if (post.platform === "x") {
      const body = window.prompt("X本文を編集（編集すると承認は失効します）", post.body);
      if (body === null) return;
      payload = { body };
    } else {
      const caption = window.prompt("Instagramキャプションを編集", post.caption);
      if (caption === null) return;
      payload = {
        caption,
        slides: post.slides.map((slide) => ({
          headline: window.prompt(`スライド${slide.position} 見出し`, slide.headline) ?? slide.headline,
          body: window.prompt(`スライド${slide.position} 本文`, slide.body) ?? slide.body,
        })),
      };
    }
    setError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`/api/content/career/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccessMsg("投稿を更新しました（承認状態はリセットされました）。");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function renderImages(postId: string) {
    setError("");
    setSuccessMsg("");
    setRenderingImages(postId);
    try {
      const res = await submit(`/api/content/career/posts/${postId}/images`, {});
      setRenderedPostImages((prev) => ({ ...prev, [postId]: res.result.images.length }));
      setSuccessMsg(`1080x1350 PNG画像 5枚のレンダリングが完了しました。`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRenderingImages(null);
    }
  }

  async function runDryRun() {
    setError("");
    setSuccessMsg("");
    try {
      const res = await submit("/api/content/career/dry-run", {});
      setDryRunReport(res.report);
      setSuccessMsg("Buffer Dry-Run検証が完了しました。");
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleGenerateReq() {
    setError("");
    setReqGenerating(true);
    try {
      const res = await submit("/api/content/career/requirements", {
        action: "generate",
        requestText: reqPrompt,
        title: reqTitle || "就活SNS新機能要件",
      });
      setGeneratedDoc(res.doc);
      setSuccessMsg("要件定義書（REQ/AC/テスト項目）をOllamaで生成しました。");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setReqGenerating(false);
    }
  }

  async function handleApproveReq(id: string) {
    setError("");
    try {
      await submit("/api/content/career/requirements", { action: "approve", id });
      setSuccessMsg("要件定義書を承認しました。開発エージェントへ引き継ぎ可能です。");
      setShowReqModal(false);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function reviewKnowledge(item: CareerKnowledgeItem) {
    const revised = window.prompt("個人を特定できる箇所を削除・一般化した本文に編集してください", item.bodyPrivate);
    if (revised === null) return;
    setError("");
    try {
      const response = await fetch(`/api/content/career/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyPrivate: revised }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  const postsByBatch = [...state.batches].map((batch) => ({
    batch,
    posts: batch.postIds.map((id) => state.posts.find((post) => post.id === id)).filter((post): post is CareerPost => Boolean(post)),
  }));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[.18em] text-brand">CAREER SNS DIVISION</p>
            <h1 className="mt-2 text-2xl font-bold">就活SNS事業部 · 就活攻略ラボ</h1>
            <p className="mt-2 text-sm text-sub">
              公式ブランド：就活攻略ラボ｜就活初心者のためのES・面接対策 · 完全ローカルAI運用 · 実投稿機能は常時安全無効
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={smallButton} onClick={seedWeek1}>初週14投稿（CSV）をインポート</button>
            <button className={smallButton} onClick={() => setShowReqModal(true)}>要件定義AIを起動</button>
            <button className={smallButton} onClick={runDryRun}>Buffer Dry-Run検証</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-hairline bg-black/20 p-3">
            <p className="text-[11px] text-sub">X アカウント</p>
            <p className="mt-1 text-sm font-semibold">@shukatsu_koryaku</p>
            <span className="mt-1 inline-block text-[10px] text-yellow-400">ID未確認・手動照合待ち</span>
          </div>
          <div className="rounded-xl border border-hairline bg-black/20 p-3">
            <p className="text-[11px] text-sub">Instagram アカウント</p>
            <p className="mt-1 text-sm font-semibold">@shukatsu.lab</p>
            <span className="mt-1 inline-block text-[10px] text-yellow-400">ID未確認・手動照合待ち</span>
          </div>
          <div className="rounded-xl border border-hairline bg-black/20 p-3">
            <p className="text-[11px] text-sub">Buffer Channel ID</p>
            <p className="mt-1 text-sm font-semibold">未接続 (Unconnected)</p>
            <span className="mt-1 inline-block text-[10px] text-gain">実送信完全遮断（Fail-closed）</span>
          </div>
          <div className="rounded-xl border border-hairline bg-black/20 p-3">
            <p className="text-[11px] text-sub">ローカルAI環境</p>
            <p className="mt-1 text-sm font-semibold">Ollama (qwen3:8b)</p>
            <span className="mt-1 inline-block text-[10px] text-gain">外部有料API無断利用ゼロ</span>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{error}</p>}
      {successMsg && <p role="status" className="rounded-xl border border-gain/40 bg-gain/10 p-3 text-sm text-gain">{successMsg}</p>}

      {/* 要件定義AIモーダル */}
      {showReqModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4">
          <div className="mx-auto max-w-3xl rounded-2xl bg-ink-card p-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">要件定義AI（Ollamaローカル駆動）</h2>
              <button className={smallButton} onClick={() => setShowReqModal(false)}>閉じる</button>
            </div>
            <p className="mt-2 text-xs text-sub">ユーザーの要望から要件定義書・受入条件（AC）・テスト項目をローカルLLMで自動生成し、承認後に開発へ引き継ぎます。</p>
            <div className="mt-4 space-y-3">
              <input className={input} placeholder="要件タイトル（例：面接逆質問の業界別パターン展開）" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} />
              <textarea className={`${input} min-h-32`} placeholder="機能の要望やユーザーの悩みを自由に入力してください..." value={reqPrompt} onChange={(e) => setReqPrompt(e.target.value)} />
              <button className={button} onClick={handleGenerateReq} disabled={reqGenerating || reqPrompt.trim().length < 10}>
                {reqGenerating ? "Ollama要件定義書生成中..." : "要件定義書を生成"}
              </button>
            </div>
            {generatedDoc && (
              <div className="mt-6 rounded-xl border border-hairline bg-black/30 p-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm">生成された要件定義書 ({generatedDoc.id})</h3>
                  <button className={`${button} text-xs py-1 px-3`} onClick={() => handleApproveReq(generatedDoc.id)}>人間承認して確定</button>
                </div>
                <pre className="mt-3 max-h-96 overflow-auto text-xs whitespace-pre-wrap font-mono leading-5 text-gray-300">
                  {generatedDoc.markdownContent}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buffer Dry-run結果レポートモーダル/カード */}
      {dryRunReport && (
        <section className="rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Buffer Dry-Run 検証レポート</h2>
            <button className={smallButton} onClick={() => setDryRunReport(null)}>非表示</button>
          </div>
          <p className="mt-1 text-sm text-yellow-300 font-medium">{dryRunReport.summaryMessage}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-xl border border-hairline p-3">総チェック投稿: <strong>{dryRunReport.totalPostsChecked}</strong> 件</div>
            <div className="rounded-xl border border-hairline p-3">未承認による除外: <strong>{dryRunReport.excludedCount}</strong> 件</div>
            <div className="rounded-xl border border-hairline p-3 text-loss">安全ブロック: <strong>{dryRunReport.blockedCount}</strong> 件</div>
            <div className="rounded-xl border border-hairline p-3 text-gain">実送信ブロック: <strong>常時有効 (100%安全)</strong></div>
          </div>
          <div className="mt-4 max-h-60 overflow-auto space-y-2">
            {dryRunReport.items.map((item) => (
              <div key={item.postId} className="rounded-lg border border-hairline/60 bg-black/20 p-2 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold uppercase text-brand mr-2">[{item.platform}]</span>
                  <span>{item.title}</span>
                  {item.blockReasons.length > 0 && (
                    <p className="mt-1 text-[11px] text-loss">{item.blockReasons.join(" / ")}</p>
                  )}
                </div>
                <Pill>{item.status}</Pill>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ① ナレッジ取込 */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <h2 className="text-lg font-semibold">① 就活経験・ナレッジを取り込む</h2>
        <p className="mt-1 text-xs text-sub">文字起こしまたはメモを直接入力します。氏名・大学名・企業名などは自動で検知され、非公開のまま安全に管理されます。</p>
        <form onSubmit={ingest} className="mt-4 space-y-3">
          <select className={input} value={sourceType} onChange={(event) => setSourceType(event.target.value as "transcript" | "note")}>
            <option value="transcript">文字起こし (Transcript)</option>
            <option value="note">メモ・ノウハウ (Note)</option>
          </select>
          <input className={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="記録タイトル（例：ガクチカで深掘りされた質問）" />
          <textarea className={`${input} min-h-32`} value={text} onChange={(event) => setText(event.target.value)} placeholder="就活生のノウハウや本人の経験をそのまま入力。" />
          <button className={button} disabled={text.trim().length < 30}>非公開ナレッジとして取込</button>
        </form>
      </section>

      {/* ② 週次投稿生成 */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">② ナレッジ選択・週次14投稿生成</h2>
            <p className="mt-1 text-xs text-sub">異なる7テーマを選択。X 7本 ＋ Instagram 7本（各5枚＝35枚）を一括生成します。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-sub flex items-center gap-2">
              生成エンジン:
              <select className={input} value={generationModel} onChange={(e) => setGenerationModel(e.target.value as "template" | "ollama")}>
                <option value="ollama">Ollama (qwen3:8b)</option>
                <option value="template">高速テンプレート</option>
              </select>
            </label>
            <label className="text-xs text-sub">
              週開始日
              <input className={`${input} mt-1`} type="date" value={weekStartDate} onChange={(event) => setWeek(event.target.value)} />
            </label>
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-sub">読み込み中…</p>
        ) : knowledge.length ? (
          <div className="mt-4 space-y-2">
            {knowledge.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-xl border border-hairline p-3">
                <input
                  aria-label={`${item.title}を選択`}
                  type="checkbox"
                  disabled={item.privacyRisk !== "clear" || item.verificationStatus !== "human_verified"}
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.topic} · {item.title}</span>
                  <span className="mt-1 block text-xs text-sub">{item.summary}</span>
                  <span className={`mt-1 block text-[11px] ${item.privacyRisk === "clear" ? "text-gain" : "text-loss"}`}>
                    匿名性: {item.privacyRisk} · 根拠: {item.evidenceType === "general_advice" ? "実践アドバイス" : "個人体験"}
                    {item.verificationStatus === "human_verified" ? " · 本人確認済" : " · 未確認"}
                  </span>
                </span>
                {(item.privacyRisk !== "clear" || item.verificationStatus !== "human_verified") && (
                  <button type="button" className={smallButton} onClick={() => void reviewKnowledge(item)}>
                    {item.privacyRisk !== "clear" ? "匿名化して確認" : "経験を確認"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-hairline p-4 text-center">
            <p className="text-sm text-sub">ナレッジがありません。上の「初週14投稿（CSV）をインポート」ボタンで即座に読み込めます。</p>
          </div>
        )}

        <button className={`${button} mt-4`} onClick={generate} disabled={selected.length !== 7 || generating}>
          {generating ? "Ollamaローカル生成中..." : `X + Instagramの下書き14本を生成（選択 ${selected.length}/7）`}
        </button>
      </section>

      {/* ③ 下書きプレビュー・画像出力・承認 */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <h2 className="text-lg font-semibold">③ プレビュー・画像レンダリング・編集・承認</h2>
        <p className="mt-1 text-xs text-sub">実投稿・予約は完全停止。Instagramカルーセルは1080x1350 PNG画像としてローカル出力可能です。</p>

        {postsByBatch.length === 0 ? (
          <p className="mt-3 text-sm text-sub">生成済み週次バッチはありません。</p>
        ) : (
          <div className="mt-4 space-y-6">
            {postsByBatch.map(({ batch, posts }) => (
              <div key={batch.id} className="rounded-xl border border-hairline p-4">
                <div className="flex flex-wrap justify-between gap-2 border-b border-hairline pb-3">
                  <div>
                    <strong className="text-base">{batch.weekStartDate} 開始週バッチ ({posts.length} 投稿)</strong>
                    <span className="ml-3 text-xs text-sub">タイムゾーン: {batch.timezone} · モデル: {batch.generationModel}</span>
                  </div>
                  <Pill>{batch.status}</Pill>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {posts.map((post) => (
                    <article key={post.id} className="rounded-xl border border-hairline/60 bg-black/20 p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="text-sm font-semibold">{post.platform.toUpperCase()} · {post.title}</strong>
                          <p className="text-xs text-sub mt-0.5">{new Date(post.scheduledAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
                        </div>
                        <Pill>{post.status}</Pill>
                      </div>

                      {post.platform === "x" ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 bg-white/[0.02] p-3 rounded-lg border border-hairline/40">
                          {post.body}
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-sub whitespace-pre-wrap bg-white/[0.02] p-2.5 rounded-lg border border-hairline/40">{post.caption}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {post.slides.map((slide) => (
                              <button key={slide.position} onClick={() => setPreview(post)} className={smallButton}>
                                {slide.position}. {slide.headline}
                              </button>
                            ))}
                          </div>
                          <div className="pt-2 flex items-center gap-2">
                            <button
                              className={smallButton}
                              onClick={() => renderImages(post.id)}
                              disabled={renderingImages === post.id}
                            >
                              {renderingImages === post.id ? "PNG生成中..." : "1080x1350 PNG画像5枚を出力"}
                            </button>
                            {renderedPostImages[post.id] ? (
                              <span className="text-xs text-gain">✔ 5枚出力済</span>
                            ) : null}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline/40 pt-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] ${post.anonymityCheck === "clear" ? "text-gain" : "text-loss"}`}>
                            匿名性: {post.anonymityCheck}
                          </span>
                          <span className={`text-[11px] ${post.factualityCheck === "clear" ? "text-gain" : "text-loss"}`}>
                            事実性: {post.factualityCheck}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className={smallButton} onClick={() => editPost(post)}>編集</button>
                          {post.status !== "approved" ? (
                            <button className={`${smallButton} border-gain/50 text-gain hover:bg-gain/10`} onClick={() => approve(post)}>
                              本人確認・承認
                            </button>
                          ) : (
                            <span className="text-xs text-gain font-medium">✔ 承認済み</span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ④ KPI・投稿結果カード */}
      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["予約状況", "N/A · Buffer未接続（安全停止）"],
          ["公開実績", "N/A · 外部実投稿0件（保護中）"],
          ["閲覧・保存数", "N/A · 実測データなし"],
          ["フォロワー推移", "N/A · アカウント未公開"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-hairline bg-ink-card p-4">
            <p className="text-xs text-sub">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {/* Instagram カルーセル スライドプレビュー */}
      {preview && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4" onClick={() => setPreview(null)}>
          <div className="mx-auto max-w-5xl rounded-2xl bg-ink-card p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-lg">Instagramカルーセルプレビュー · {preview.title}</h2>
                <p className="text-xs text-sub">4:5比率 (1080×1350px) 基準 · 日本語文字溢れ検査付き</p>
              </div>
              <button className={smallButton} onClick={() => setPreview(null)}>閉じる</button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {careerCarouselHtml(preview).map((html, index) => {
                const slide = preview.slides[index];
                const overflow = slide ? careerSlideOverflow(slide) : false;
                return (
                  <div key={index} className="space-y-1">
                    <iframe title={`Slide ${index + 1}`} sandbox="" srcDoc={html} className="aspect-[4/5] w-full rounded-xl border border-hairline bg-[#f6f1e9]" />
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[11px] text-sub">スライド {index + 1} / 5</span>
                      {overflow ? (
                        <span className="text-[11px] text-loss">文字溢れ警告（要短縮）</span>
                      ) : (
                        <span className="text-[11px] text-gain">レイアウトOK</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nextMonday() {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] text-brand">{children}</span>;
}

const input = "w-full rounded-xl border border-hairline bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-brand/60";
const button = "rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-brand/90 transition-colors";
const smallButton = "rounded-lg border border-hairline px-3 py-1.5 text-xs hover:border-brand/50 hover:bg-white/[0.03] transition-colors";
