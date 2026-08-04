"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/primitives";

type Analytics = {
  records: Array<{ contentId: string; measuredAt: string; measurementWindow?: string; impressions?: number; replies?: number; bookmarks?: number; profileClicks?: number; followsFromPost?: number; rates: { replyRate?: number; bookmarkRate?: number; profileClickRate?: number; followConversionRate?: number } }>;
  summary: { postCount: number; totalImpressions?: number; enoughForTrend: boolean; recommendedConfidence: string; noteRevenue?: number; affiliateRevenue?: number; byTimeBand: Array<{ band: string; posts: number; averageImpressions?: number }> };
  pillarBalance: Array<{ id: string; label: string; targetRatio: number; currentRatio: number; difference: number }>;
  learning: { message: string; genres: Array<{ id: string; posts: number; averageImpressions: number }>; patterns: Array<{ id: string; posts: number; averageImpressions: number }> };
};
type Monetization = {
  progress: { organicImpressions90Days?: number; requiredOrganicImpressions: number; verifiedFollowers?: number; requiredVerifiedFollowers: number; premiumActive?: boolean; stripeConnected?: boolean; identityVerified?: boolean; accountInGoodStanding?: boolean; eligibleCountry?: boolean; lastCheckedAt: string };
  projection: { remainingImpressions?: number; requiredDailyAverage?: number; verifiedFollowersRemaining?: number };
  disclaimer: string;
  rules: Array<{ program: "revenue-sharing" | "subscriptions"; sourceLabel: string; verifiedAt: string; active: boolean }>;
};

export function GrowthInsights() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [monetization, setMonetization] = useState<Monetization | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [progressDraft, setProgressDraft] = useState({ organicImpressions90Days: "", verifiedFollowers: "" });
  const [snapshot, setSnapshot] = useState({ contentId: "", platform: "x", genreId: "daily-thoughts", pattern: "daily", length: "short", publishedAt: "", measurementWindow: "24h", impressions: "", likes: "", replies: "", reposts: "", quotes: "", bookmarks: "", profileClicks: "", followsFromPost: "", urlClicks: "", noteRevenue: "", affiliateRevenue: "" });

  async function reload() {
    setLoading(true);
    const [a, m] = await Promise.all([
      fetch("/api/note/x/analytics").then((response) => response.json()),
      fetch("/api/note/x/monetization").then((response) => response.json()),
    ]);
    setAnalytics(a);
    setMonetization(m);
    setProgressDraft({
      organicImpressions90Days: String(m.progress?.organicImpressions90Days ?? ""),
      verifiedFollowers: String(m.progress?.verifiedFollowers ?? ""),
    });
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  async function saveSnapshot() {
    const numeric = (value: string) => value === "" ? undefined : Number(value);
    const response = await fetch("/api/note/x/analytics/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: snapshot.contentId,
        platform: snapshot.platform,
        purpose: "reach",
        genreId: snapshot.genreId,
        pattern: snapshot.pattern,
        length: snapshot.length,
        publishedAt: new Date(snapshot.publishedAt).toISOString(),
        measuredAt: new Date().toISOString(),
        measurementWindow: snapshot.measurementWindow,
        impressions: numeric(snapshot.impressions),
        likes: numeric(snapshot.likes),
        replies: numeric(snapshot.replies),
        reposts: numeric(snapshot.reposts),
        quotes: numeric(snapshot.quotes),
        bookmarks: numeric(snapshot.bookmarks),
        profileClicks: numeric(snapshot.profileClicks),
        followsFromPost: numeric(snapshot.followsFromPost),
        urlClicks: numeric(snapshot.urlClicks),
        noteRevenue: numeric(snapshot.noteRevenue),
        affiliateRevenue: numeric(snapshot.affiliateRevenue),
      }),
    });
    const body = await response.json();
    setNotice(response.ok ? "投稿結果を記録しました" : body.error);
    if (response.ok) await reload();
  }

  async function saveProgress(patch: Record<string, unknown>) {
    await fetch("/api/note/x/monetization", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    await reload();
  }

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {notice && <p className="rounded-xl bg-gain/10 p-3 text-xs text-gain">{notice}</p>}
      <Card>
        <CardHeader title="投稿結果の分析" hint="30分後から7日後まで、同じ投稿を何度でも記録できます。" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="記録したX投稿" value={`${analytics?.summary.postCount ?? 0}件`} />
          <Metric label="合計表示数" value={format(analytics?.summary.totalImpressions)} />
          <Metric label="分析の信頼度" value={analytics?.summary.recommendedConfidence ?? "—"} />
          <Metric label="利用目安" value={analytics?.summary.enoughForTrend ? "時間帯比較可能" : "10投稿から表示"} />
          <Metric label="note売上" value={format(analytics?.summary.noteRevenue)} />
          <Metric label="アフィリエイト売上" value={format(analytics?.summary.affiliateRevenue)} />
        </div>
        <p className="mt-3 text-[10px] text-sub">最低10投稿で参考傾向、30投稿以上で比較の信頼度を上げます。少数データから断定しません。</p>
        <p className="mt-2 rounded-lg bg-brand/5 p-2 text-[10px] text-brand-light">{analytics?.learning.message}</p>
        {analytics?.learning.patterns?.[0] && <p className="mt-2 text-[10px] text-sub">現在もっとも平均表示数が高い型: {analytics.learning.patterns[0].id}（{analytics.learning.patterns[0].posts}件の参考値）</p>}
        {(analytics?.summary.byTimeBand ?? []).length > 0 && (
          <div className="mt-4 space-y-2">
            {analytics!.summary.byTimeBand.map((row) => <div key={row.band} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-xs"><span>{row.band}（{row.posts}件）</span><span>{row.averageImpressions === undefined ? "未取得" : `平均 ${Math.round(row.averageImpressions).toLocaleString()} Imp`}</span></div>)}
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(analytics?.pillarBalance ?? []).map((pillar) => (
            <div key={pillar.id} className="rounded-lg border border-hairline px-3 py-2 text-xs">
              <div className="flex justify-between"><span>{pillar.label}</span><span>目標 {pillar.targetRatio}%／現在 {pillar.currentRatio}%</span></div>
              {pillar.difference <= -10 && <p className="mt-1 text-[10px] text-brand-light">次の候補として増やしてもよいジャンルです（強制ではありません）。</p>}
            </div>
          ))}
        </div>
        {(analytics?.records ?? []).slice(0, 5).map((record) => (
          <div key={`${record.contentId}-${record.measuredAt}`} className="mt-2 rounded-lg border border-hairline p-2 text-[10px] text-sub">
            <p className="font-semibold text-slate-200">{record.contentId}・{record.measurementWindow ?? "計測"}</p>
            <p className="mt-1">返信率 {percent(record.rates.replyRate)}／保存率 {percent(record.rates.bookmarkRate)}／プロフィール率 {percent(record.rates.profileClickRate)}／フォロー転換 {percent(record.rates.followConversionRate)}</p>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader title="投稿結果を手動で記録" hint="X APIなしでも、Xの画面を見ながら入力できます。空欄は0ではなく未取得として保存します。" />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input label="投稿IDまたはURL" value={snapshot.contentId} onChange={(contentId) => setSnapshot({ ...snapshot, contentId })} />
          <label className="text-[10px] text-sub">媒体<select value={snapshot.platform} onChange={(event) => setSnapshot({ ...snapshot, platform: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-ink-card px-2 py-2 text-xs text-white"><option value="x">X</option><option value="note">note</option></select></label>
          <label className="text-[10px] text-sub">ジャンル<select value={snapshot.genreId} onChange={(event) => setSnapshot({ ...snapshot, genreId: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-ink-card px-2 py-2 text-xs text-white"><option value="daily-thoughts">日常・考えたこと</option><option value="personal-development">人生・価値観</option><option value="ai">AI</option><option value="career">仕事・キャリア</option><option value="investing">投資・資産形成</option><option value="reading">読書</option><option value="side-business">副業・発信</option></select></label>
          <label className="text-[10px] text-sub">投稿の型<select value={snapshot.pattern} onChange={(event) => setSnapshot({ ...snapshot, pattern: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-ink-card px-2 py-2 text-xs text-white"><option value="daily">日常型</option><option value="reflection">気づき型</option><option value="conversation">会話型</option><option value="opinion">意見型</option><option value="save">保存型</option></select></label>
          <label className="text-[10px] text-sub">長さ<select value={snapshot.length} onChange={(event) => setSnapshot({ ...snapshot, length: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-ink-card px-2 py-2 text-xs text-white"><option value="short">短文</option><option value="medium">標準</option><option value="thread">スレッド</option></select></label>
          <Input label="投稿日時" type="datetime-local" value={snapshot.publishedAt} onChange={(publishedAt) => setSnapshot({ ...snapshot, publishedAt })} />
          <label className="text-[10px] text-sub">計測タイミング
            <select value={snapshot.measurementWindow} onChange={(event) => setSnapshot({ ...snapshot, measurementWindow: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-ink-card px-2 py-2 text-xs text-white">
              <option value="30m">30分後</option><option value="1h">1時間後</option><option value="3h">3時間後</option><option value="24h">24時間後</option><option value="72h">72時間後</option><option value="7d">7日後</option>
            </select>
          </label>
          {([["impressions", "インプレッション"], ["likes", "いいね"], ["replies", "返信"], ["reposts", "リポスト"], ["quotes", "引用"], ["bookmarks", "ブックマーク"], ["profileClicks", "プロフィールクリック"], ["followsFromPost", "投稿経由フォロー"], ["urlClicks", "URLクリック"]] as const).map(([key, label]) => <Input key={key} label={label} type="number" value={snapshot[key]} onChange={(value) => setSnapshot({ ...snapshot, [key]: value })} />)}
          <Input label="note売上（円）" type="number" value={snapshot.noteRevenue} onChange={(noteRevenue) => setSnapshot({ ...snapshot, noteRevenue })} />
          <Input label="アフィリエイト売上（円）" type="number" value={snapshot.affiliateRevenue} onChange={(affiliateRevenue) => setSnapshot({ ...snapshot, affiliateRevenue })} />
        </div>
        <button onClick={() => void saveSnapshot()} disabled={!snapshot.contentId || !snapshot.publishedAt} className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-bold disabled:opacity-40">記録する</button>
      </Card>

      {monetization && <Card>
        <CardHeader title="収益化の進捗" hint="X収益配分とサブスクリプションは別制度として管理します。" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="90日表示数" value={format(monetization.progress.organicImpressions90Days)} />
          <Metric label="500万まで" value={format(monetization.projection.remainingImpressions)} />
          <Metric label="認証済みフォロワー" value={format(monetization.progress.verifiedFollowers)} />
          <Metric label="500人まで" value={format(monetization.projection.verifiedFollowersRemaining)} />
          <Metric label="必要な1日平均" value={monetization.projection.requiredDailyAverage === undefined ? "未取得" : Math.ceil(monetization.projection.requiredDailyAverage).toLocaleString()} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([
            ["premiumActive", "Premium"],
            ["stripeConnected", "Stripe"],
            ["identityVerified", "本人確認"],
            ["accountInGoodStanding", "アカウント状態"],
            ["eligibleCountry", "対象国"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-hairline p-2 text-[10px]">
              <input type="checkbox" checked={Boolean(monetization.progress[key])} onChange={(event) => void saveProgress({ [key]: event.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Input label="過去90日のオーガニック表示数" type="number" value={progressDraft.organicImpressions90Days} onChange={(organicImpressions90Days) => setProgressDraft({ ...progressDraft, organicImpressions90Days })} />
          <Input label="認証済みフォロワー数" type="number" value={progressDraft.verifiedFollowers} onChange={(verifiedFollowers) => setProgressDraft({ ...progressDraft, verifiedFollowers })} />
        </div>
        <button onClick={() => void saveProgress({
          organicImpressions90Days: progressDraft.organicImpressions90Days === "" ? undefined : Number(progressDraft.organicImpressions90Days),
          verifiedFollowers: progressDraft.verifiedFollowers === "" ? undefined : Number(progressDraft.verifiedFollowers),
        })} className="mt-3 rounded-xl border border-brand/40 px-4 py-2 text-xs font-bold text-brand-light">進捗を保存</button>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {monetization.rules.map((rule) => (
            <div key={rule.program} className="rounded-xl border border-hairline p-3">
              <p className="text-xs font-semibold">{rule.program === "revenue-sharing" ? "クリエイター収益配分" : "サブスクリプション"}</p>
              <p className="mt-1 text-[10px] text-sub">{rule.sourceLabel}</p>
              <p className="mt-1 text-[10px] text-sub">条件確認日: {new Date(rule.verifiedAt).toLocaleDateString("ja-JP")}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-amber-200">{monetization.disclaimer} 条件は変更されるため、最終確認日は {new Date(monetization.progress.lastCheckedAt).toLocaleDateString("ja-JP")} です。</p>
      </Card>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-hairline bg-white/[0.02] p-3"><p className="text-[10px] text-sub">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-[10px] text-sub">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-white/[0.03] px-2 py-2 text-xs text-white" /></label>;
}
function format(value?: number): string { return value === undefined ? "未取得" : Math.round(value).toLocaleString(); }
function percent(value?: number): string { return value === undefined ? "未取得" : `${(value * 100).toFixed(2)}%`; }
