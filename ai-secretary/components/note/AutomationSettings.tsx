"use client";

import { ShieldCheck } from "lucide-react";
import { useResearchSettings } from "@/app/note/useResearch";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

/** リサーチと自動投稿の設定を一か所で管理する画面 */
export function AutomationSettings() {
  const settings = useResearchSettings();

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
        <CardHeader
          title="Xリサーチ"
          hint="毎日の投稿候補を作るための情報収集"
          action={
            <span className="text-[10px] text-sub">
              {x.lastRunAt ? `最終実行 ${new Date(x.lastRunAt).toLocaleString("ja-JP")}` : "未実行"}
            </span>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="無料Xワークスペース"
            hint="公式埋め込みとWeb Intentsのみ。X API・SerpAPI・Bufferは使いません"
            checked={flags.xFreeWorkspaceEnabled}
            disabled={settings.saving}
            onChange={(xFreeWorkspaceEnabled) => settings.save({ flags: { xFreeWorkspaceEnabled } })}
          />
          <Toggle
            label="本人原稿のLocal AI添削"
            hint="MacのWorkerで添削します。ONでも外部公開は行いません"
            checked={flags.localAiEditorEnabled}
            disabled={settings.saving}
            onChange={(localAiEditorEnabled) =>
              settings.save({ flags: { localAiEditorEnabled } })
            }
          />
          <Toggle
            label="Xリサーチを有効にする"
            hint="OFFの間は /maemichi research を実行してもXを調査しません"
            checked={x.enabled}
            disabled={settings.saving}
            onChange={(enabled) => settings.save({ x: { enabled } })}
          />
          <Field label="リサーチ方式" hint="freeはSERPAPI_KEY、公式APIはX_API_BEARER_TOKENを使用します">
            <select
              value={x.mode}
              disabled={settings.saving}
              onChange={(event) =>
                settings.save({ x: { mode: event.target.value as "free" | "official-api" } })
              }
              className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
            >
              <option value="free">free（検索API）</option>
              <option value="official-api">X公式API</option>
            </select>
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

      <Card>
        <CardHeader
          title="自動投稿の安全装置"
          hint="最初は下書きとBuffer予約を確認してから自動投稿を有効にしてください"
          action={<ShieldCheck className="h-4 w-4 text-gain" />}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="投稿全体を有効にする"
            hint="これがOFFなら、ほかの設定に関係なく投稿しません"
            checked={flags.publishingEnabled}
            disabled={settings.saving}
            onChange={(publishingEnabled) => settings.save({ flags: { publishingEnabled } })}
          />
          <Toggle
            label="X自動投稿（Buffer予約）"
            hint="ONにすると安全判定済みの投稿をBufferへ送ります"
            checked={flags.xAutoPublish}
            disabled={settings.saving}
            onChange={(xAutoPublish) => settings.save({ flags: { xAutoPublish } })}
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
