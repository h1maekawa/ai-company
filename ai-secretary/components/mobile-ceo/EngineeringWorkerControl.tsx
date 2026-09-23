"use client";

import { useCallback, useEffect, useState } from "react";

type ActiveMachine = "home-mac" | "mobile-mac" | "none";

const labels: Record<ActiveMachine, string> = {
  "home-mac": "home-mac に切替",
  "mobile-mac": "mobile-mac に切替",
  none: "全停止",
};

export function EngineeringWorkerControl() {
  const [activeMachine, setActiveMachine] = useState<ActiveMachine | null>(null);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/engineering/active-machine", { cache: "no-store" });
      const payload = await response.json() as { activeMachine?: ActiveMachine; error?: string };
      if (!response.ok || !payload.activeMachine) throw new Error(payload.error || "ACTIVE_MACHINE_LOOKUP_FAILED");
      setActiveMachine(payload.activeMachine);
      setError("");
    } catch (reason) {
      setActiveMachine(null);
      setError(reason instanceof Error ? reason.message : "ACTIVE_MACHINE_LOOKUP_FAILED");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function changeMachine(machine: ActiveMachine) {
    const prompt = machine === "none" ? "Engineering Workerを全停止しますか？" : `${machine} に切り替えますか？`;
    if (!window.confirm(prompt)) return;
    setUpdating(true);
    try {
      const response = await fetch("/api/engineering/active-machine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machine, confirmedByHuman: true }),
      });
      const payload = await response.json() as { activeMachine?: ActiveMachine; error?: string };
      if (!response.ok || !payload.activeMachine) throw new Error(payload.error || "ACTIVE_MACHINE_UPDATE_FAILED");
      setActiveMachine(payload.activeMachine);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ACTIVE_MACHINE_UPDATE_FAILED");
    } finally {
      setUpdating(false);
    }
  }

  const canActivate = activeMachine === "none";
  return <section aria-labelledby="engineering-worker-control" className="rounded-2xl border border-amber-800 bg-slate-900/70 p-4">
    <h2 id="engineering-worker-control" className="text-base font-bold">Engineering Worker — HUMAN_ONLY</h2>
    <p className="mt-1 text-xs text-slate-400">Machine間の切替は、全停止 → ai-runningなし → 対象Machineの順で行います。</p>
    <p className="mt-3 text-sm">現在のActive Machine: <strong>{activeMachine ?? "UNKNOWN"}</strong></p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      {(["home-mac", "mobile-mac"] as const).map((machine) => <div key={machine} className="rounded-xl border border-slate-700 p-3"><span>{machine}</span><strong className="mt-1 block">{activeMachine === null ? "UNKNOWN" : activeMachine === machine ? "ACTIVE" : "STANDBY"}</strong></div>)}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {(["home-mac", "mobile-mac", "none"] as const).map((machine) => {
        const disabled = updating || (machine !== "none" && (activeMachine === null || (!canActivate && activeMachine !== machine)));
        return <button key={machine} type="button" disabled={disabled} onClick={() => void changeMachine(machine)} className="min-h-11 rounded-xl border border-slate-700 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{labels[machine]}</button>;
      })}
    </div>
    {activeMachine !== null && activeMachine !== "none" ? <p className="mt-2 text-xs text-amber-300">別Machineへ切り替える前に「全停止」を実行してください。</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-300">状態を安全に確認できません: {error}</p> : null}
  </section>;
}
