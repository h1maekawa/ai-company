"use client";

/**
 * FIRE・財務設定 — Phase 5 §36 / §39
 *
 * どの項目も必須ではない。未入力は「未設定」のまま保たれ、
 * FIRE進捗は NOT_CONFIGURED を維持する（推測で目標額を決めない）。
 */

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";

type Settings = {
  annualLivingCostYen: number | null;
  targetAssetAmountYen: number | null;
  monthlyIncomeYen: number | null;
  monthlyExpenseYen: number | null;
  cashBalanceYen: number | null;
};

const FIELDS: { key: keyof Settings; label: string; hint?: string }[] = [
  { key: "annualLivingCostYen", label: "年間生活費", hint: "FIRE目標額の算出に使います" },
  { key: "targetAssetAmountYen", label: "目標資産額", hint: "未設定なら年間生活費から算出します" },
  { key: "monthlyIncomeYen", label: "月間収入" },
  { key: "monthlyExpenseYen", label: "月間支出" },
  { key: "cashBalanceYen", label: "現金残高" },
];

export function FinancialSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/company/settings/financial")
      .then((r) => r.json())
      .then((json: Settings) => setSettings(json))
      .catch(() => undefined);
  }, []);

  if (!settings) return null;

  const update = (key: keyof Settings, raw: string) => {
    setSaved(false);
    setSettings({ ...settings, [key]: raw === "" ? null : Number(raw) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/company/settings/financial", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const configured = FIELDS.filter((f) => settings[f.key] !== null).length;

  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <Settings2 className="h-4 w-4 text-sub" />
          FIRE・財務設定
        </span>
        <span className="text-[11px] text-sub">
          {configured}/{FIELDS.length} 設定済み {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-sub">
            入力は任意です。未入力の項目は「未設定」として扱われ、0円とは区別されます。
            目標資産額を入れない場合、年間生活費から年4%の取り崩しを前提に算出します。
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-[10px] text-sub">
                  {field.label}
                  {field.hint ? `（${field.hint}）` : ""}
                </span>
                <input
                  type="number"
                  min={0}
                  value={settings[field.key] ?? ""}
                  placeholder="未設定"
                  onChange={(e) => update(field.key, e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-ink-base px-3 py-2 text-sm text-white outline-none"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            {saved && <span className="text-[11px] text-gain">保存しました</span>}
          </div>
        </>
      )}
    </section>
  );
}
