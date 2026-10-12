import type { RoomStatus, RoomTheme } from "./roomModel";

/** 部屋ごとの雰囲気（背景色調・壁の色）。Business Logicではなく見た目だけの定義。 */
export const ROOM_THEME: Record<RoomTheme, { wall: string; floor: string; accent: string; furniture: string }> = {
  lobby: { wall: "border-amber-300/40", floor: "bg-amber-400/[0.07]", accent: "text-amber-200", furniture: "🛋️" },
  content: { wall: "border-pink-400/30", floor: "bg-pink-400/[0.05]", accent: "text-pink-200", furniture: "🖋️" },
  investment: { wall: "border-emerald-400/30", floor: "bg-emerald-400/[0.05]", accent: "text-emerald-200", furniture: "📈" },
  knowledge: { wall: "border-violet-400/30", floor: "bg-violet-400/[0.05]", accent: "text-violet-200", furniture: "📚" },
  ops: { wall: "border-slate-400/30", floor: "bg-slate-400/[0.05]", accent: "text-slate-200", furniture: "🗂️" },
  gate: { wall: "border-rose-400/30", floor: "bg-rose-400/[0.05]", accent: "text-rose-200", furniture: "🚪" },
  automation: { wall: "border-sky-400/30", floor: "bg-sky-400/[0.05]", accent: "text-sky-200", furniture: "⚙️" },
  infra: { wall: "border-cyan-400/30", floor: "bg-cyan-400/[0.05]", accent: "text-cyan-200", furniture: "🖥️" },
  personal: { wall: "border-teal-400/30", floor: "bg-teal-400/[0.05]", accent: "text-teal-200", furniture: "🪴" },
};

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  active: "稼働中",
  attention: "確認必要",
  idle: "待機中",
  unavailable: "取得エラー",
  unknown: "UNKNOWN",
};

export const ROOM_STATUS_DOT: Record<RoomStatus, string> = {
  active: "bg-sky-400",
  attention: "bg-amber-400",
  idle: "bg-slate-500",
  unavailable: "bg-loss",
  unknown: "bg-slate-600",
};
