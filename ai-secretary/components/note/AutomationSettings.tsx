"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useResearchSettings } from "@/app/note/useResearch";
import type { SocialOperationMode } from "@/app/lib/note/research/types";
import {
  APPROVAL_MODE_LABELS,
  type ApprovalMode,
} from "@/app/lib/review/approvalPolicy";
import { REVIEW_PHASE_LABELS, REVIEW_PHASE_ORDER } from "@/app/lib/review/types";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

type AutomationStatus = {
  mode: SocialOperationMode;
  buffer: { configured: boolean };
  serpApi: { configured: boolean };
  xResearch: { enabled: boolean; mode: string };
  investing: { portfolioAvailable: boolean; newsAvailable: boolean };
  performanceSync: { lastRunAt: string | null };
};

/** 接続状態を表示専用で取得する（設定は変更しない） */
function useAutomationStatus() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  useEffect(() => {
    fetch("/api/note/automation/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => undefined);
  }, []);
  return status;
}

const MODE_LABEL: Record<SocialOperationMode, string> = {
  autopilot: "AUTOPILOT（全自動投稿）",
  review: "REVIEW（下書き保存＋人間承認後に投稿）",
  draft: "DRAFT（下書き保存のみ・投稿しない）",
};

/** リサーチと自動投稿の設定を一か所で管理する画面 */
export function AutomationSettings() {
  const settings = useResearchSettings();
  const status = useAutomationStatus();

  if (settings.loading || !settings.x || !settings.flags) {
    return <Skeleton className="h-80 rounded-xl" />;
  }

  const { x, flags } = settings;
  const numberValue = (value: string, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="最初は、この2つだけ確認してください" hint="難しい設定は後から変更できます" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="無料のX作業画面を使う"
            hint="おすすめ。Xを見て文章を作り、最後の投稿ボタンだけ本人が押します"
            checked={flags.xFreeWorkspaceEnabled}
            disabled={settings.saving}
            onChange={(xFreeWorkspaceEnabled) => settings.save({ flags: { xFreeWorkspaceEnabled } })}
          />
          <Toggle
            label="MacのAIで文章を整える"
            hint="前川さんの原稿をOllamaで添削します。勝手に公開はしません"
            checked={flags.localAiEditorEnabled}
            disabled={settings.saving}
            onChange={(localAiEditorEnabled) =>
              settings.save({ flags: { localAiEditorEnabled } })
            }
          />
        </div>
        <p className="mt-3 rounded-lg bg-gain/5 px-3 py-2 text-[11px] leading-relaxed text-sub">
          この2つをONにしても自動投稿はされません。X公式画面で前川さんが確認し、
          最後に「ポストする」を押す安全な使い方です。
        </p>
      </Card>

      <details className="rounded-2xl border border-hairline bg-ink-card">
        <summary className="cursor-pointer list-none px-5 py-4">
          <p className="text-sm font-semibold text-white">高度なリサーチ設定</p>
          <p className="mt-1 text-[11px] text-sub">
            外部の検索APIやX APIを契約している場合だけ開いてください。通常は変更不要です。
          </p>
        </summary>
        <div className="px-1 pb-1">
      <Card>
        <CardHeader
          title="APIを使った自動リサーチ"
          hint="無料X作業画面とは別の、外部サービスを使う上級者向け機能です"
          action={
            <span className="text-[10px] text-sub">
              {x.lastRunAt ? `最終実行 ${new Date(x.lastRunAt).toLocaleString("ja-JP")}` : "未実行"}
            </span>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="API自動リサーチを有効にする"
            hint="契約済みのAPI設定がある場合だけONにします"
            checked={x.enabled}
            disabled={settings.saving}
            onChange={(enabled) => settings.save({ x: { enabled } })}
          />
          <Field label="利用する外部サービス" hint="どちらも別途キーや契約が必要です">
            <select
              value={x.mode}
              disabled={settings.saving}
              onChange={(event) =>
                settings.save({ x: { mode: event.target.value as "free" | "official-api" } })
              }
              className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
            >
              <option value="free">検索API（SerpAPI）</option>
              <option value="official-api">X公式API（有料の場合あり）</option>
            </select>
            {x.mode === "free" && status && (
              <p
                className={`mt-2 text-[11px] leading-relaxed ${
                  status.serpApi.configured ? "text-gain" : "text-loss"
                }`}
              >
                SerpAPI: {status.serpApi.configured
                  ? "✅ 接続済み"
                  : "⚠️ VercelのSERPAPI_ENABLED / SERPAPI_KEYを確認してください"}
              </p>
            )}
          </Field>
          <NumberField
            label="月額API予算（USD）"
            hint={`現在の推定使用額 $${x.currentEstimatedSpendUsd}`}
            value={x.monthlyBudgetUsd}
            min={0}
            max={1000}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({
                x: { monthlyBudgetUsd: numberValue(value, x.monthlyBudgetUsd, 0, 1000) },
              })
            }
          />
          <NumberField
            label="調査対象期間（時間）"
            hint="直近何時間の投稿を調べるか"
            value={x.lookbackHours}
            min={1}
            max={720}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({ x: { lookbackHours: numberValue(value, x.lookbackHours, 1, 720) } })
            }
          />
          <NumberField
            label="1回の参考アカウント数"
            hint="一度に調べるアカウントの上限"
            value={x.maxReferenceAccountsPerRun}
            min={1}
            max={50}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({
                x: {
                  maxReferenceAccountsPerRun: numberValue(
                    value,
                    x.maxReferenceAccountsPerRun,
                    1,
                    50
                  ),
                },
              })
            }
          />
          <NumberField
            label="アカウントごとの投稿数"
            hint="各アカウントから取得する件数"
            value={x.maxPostsPerAccount}
            min={1}
            max={20}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({
                x: { maxPostsPerAccount: numberValue(value, x.maxPostsPerAccount, 1, 20) },
              })
            }
          />
        </div>
      </Card>
        </div>
      </details>

      <Card>
        <CardHeader
          title="運用モード"
          hint="AUTOPILOTは全自動、REVIEWは下書き保存後に人間が承認、DRAFTは下書き保存のみです"
          action={<ShieldCheck className="h-4 w-4 text-gain" />}
        />
        <Field label="現在のモード" hint="切り替えると即座に反映されます（次回の自動実行から適用）">
          <select
            value={flags.socialOperationMode}
            disabled={settings.saving}
            onChange={(event) =>
              settings.save({
                flags: { socialOperationMode: event.target.value as SocialOperationMode },
              })
            }
            className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
          >
            <option value="draft">{MODE_LABEL.draft}</option>
            <option value="review">{MODE_LABEL.review}</option>
            <option value="autopilot">{MODE_LABEL.autopilot}</option>
          </select>
        </Field>
        <PhaseApprovalSettings settings={settings} />

        {status && (
          <div className="mt-3 grid gap-2 rounded-lg border border-hairline bg-white/[0.02] p-3 text-[11px] text-sub sm:grid-cols-2">
            <span>Buffer接続: {status.buffer.configured ? "✅ 設定済み" : "⚠️ 未設定"}</span>
            <span>SerpAPI: {status.serpApi.configured ? "✅ 設定済み" : "⚠️ 未設定"}</span>
            <span>X Research: {status.xResearch.enabled ? `✅ ON（${status.xResearch.mode}）` : "OFF"}</span>
            <span>投資Portfolio: {status.investing.portfolioAvailable ? "✅ 取込済み" : "⚠️ 未取込"}</span>
            <span>投資News: {status.investing.newsAvailable ? "✅ 取得可能" : "⚠️ 未取得"}</span>
            <span>
              Performance Sync:{" "}
              {status.performanceSync.lastRunAt
                ? `✅ 最終実行 ${new Date(status.performanceSync.lastRunAt).toLocaleString("ja-JP")}`
                : "未実行"}
            </span>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="公開の安全設定"
          hint="運用モードがdraft/reviewの間は、下の設定に関係なくBufferへは送りません"
          action={<ShieldCheck className="h-4 w-4 text-gain" />}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="投資→X連携"
            hint="ONだと信頼枠（12:15）でPortfolio/Newsから投資投稿を試みます。材料が無い日は通常投稿にfallbackします"
            checked={flags.investmentBridgeEnabled}
            disabled={settings.saving}
            onChange={(investmentBridgeEnabled) =>
              settings.save({ flags: { investmentBridgeEnabled } })
            }
          />
          <Toggle
            label="note自動公開"
            hint="OFFならnoteは自動公開しません"
            checked={flags.noteAutoPublish}
            disabled={settings.saving}
            onChange={(noteAutoPublish) => settings.save({ flags: { noteAutoPublish } })}
          />
          <Toggle
            label="note下書きのみ"
            hint="ONなら公開せず、下書き保存までで停止します"
            checked={flags.noteDraftOnly}
            disabled={settings.saving}
            onChange={(noteDraftOnly) => settings.save({ flags: { noteDraftOnly } })}
          />
          <NumberField
            label="1日のX投稿上限"
            hint="最初は1件を推奨します"
            value={flags.maxXPostsPerDay}
            min={1}
            max={20}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({
                flags: {
                  maxXPostsPerDay: numberValue(value, flags.maxXPostsPerDay, 1, 20),
                },
              })
            }
          />
          <NumberField
            label="Buffer予約上限"
            hint="自動で埋めてよい予約枠の最大数"
            value={flags.maxBufferScheduled}
            min={1}
            max={100}
            disabled={settings.saving}
            onChange={(value) =>
              settings.save({
                flags: {
                  maxBufferScheduled: numberValue(value, flags.maxBufferScheduled, 1, 100),
                },
              })
            }
          />
        </div>
        {settings.saving && <p className="mt-3 text-xs text-sub">保存中...</p>}
        {settings.error && <p className="mt-3 text-xs text-loss">{settings.error}</p>}
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="rounded-xl border border-hairline bg-white/[0.02] p-3">
      <span className="block text-xs font-medium text-white">{label}</span>
      <span className="mb-2 block text-[10px] leading-relaxed text-sub">{hint}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
      />
    </Field>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-white">{label}</span>
        <span className="block text-[10px] leading-relaxed text-sub">{hint}</span>
      </span>
    </label>
  );
}

/**
 * 工程ごとの承認要否（要件10）。
 * ここを「自動承認」にしても、自動テストを全て通過した項目だけが対象になる。
 * 通っていないものは自動的に人間承認へ回る。
 */
function PhaseApprovalSettings({
  settings,
}: {
  settings: ReturnType<typeof useResearchSettings>;
}) {
  const policy = settings.approvalPolicy;
  if (!policy) return null;

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="text-xs font-semibold text-white">工程ごとの承認</p>
      <p className="mt-1 text-[11px] leading-relaxed text-sub">
        「自動承認」にしても、自動テストを全て通過した項目だけがスキップされます。
        1つでも落ちた項目・未検証の項目は人間承認へ回ります。
      </p>

      <div className="mt-3 space-y-2">
        {REVIEW_PHASE_ORDER.map((phase) => (
          <div key={phase} className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300">{REVIEW_PHASE_LABELS[phase]}</span>
            <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
              {(["auto", "human"] as ApprovalMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={settings.saving}
                  onClick={() => settings.save({ approvalPolicy: { [phase]: mode } })}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    policy[phase] === mode
                      ? "bg-brand text-white"
                      : "text-sub hover:text-white"
                  }`}
                >
                  {APPROVAL_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
