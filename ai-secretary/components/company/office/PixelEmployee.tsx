import type { PixelPose } from "./types";

const SCREEN: Record<PixelPose, string> = {
  working: "bg-sky-300 animate-pulse motion-reduce:animate-none",
  review: "bg-violet-300/70",
  alert: "bg-loss",
  idle: "bg-slate-600",
};

/**
 * 会社員風のPixel Art。
 *
 * Animationは状態理解の補助なので、主役にしない（v2方針）。
 * 状態そのものはバッジとテキストが伝え、ここは雰囲気だけを担う。
 */
export function PixelEmployee({ pose }: { pose: PixelPose }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg border border-hairline bg-[#172238]"
      style={{ imageRendering: "pixelated" }}
    >
      {/* 床と机 */}
      <div className="absolute bottom-0 left-0 h-2 w-full bg-[#25334a]" />
      <div className="absolute bottom-1 right-0 h-1 w-10 bg-[#9b6c45]" />

      {/* 頭・胴・腕 */}
      <div className="absolute left-3 top-2 h-3 w-3 bg-[#e3af83] shadow-[4px_0_0_#e3af83]" />
      <div className="absolute left-3 top-5 h-6 w-5 bg-[#526b91]" />
      <div
        className={`absolute left-5 top-5 h-6 w-1 bg-[#dbeafe] ${
          pose === "working" ? "animate-office-type motion-reduce:animate-none" : ""
        }`}
      />

      {/* モニター */}
      <div className="absolute bottom-2 right-2 h-5 w-7 border-2 border-[#7d91ad] bg-[#0d1524]" />
      <div className={`absolute bottom-4 right-4 h-1.5 w-3 ${SCREEN[pose]}`} />

      {/* レビュー中は資料を持つ */}
      {pose === "review" && (
        <div className="absolute left-8 top-4 h-4 w-3 rotate-6 border border-[#cbd5e1] bg-[#e2e8f0]" />
      )}

      {/* 問題ありは席で止まっている。コーヒーは置かない */}
      {pose === "alert" && (
        <div className="absolute left-8 top-3 h-3 w-3 rounded-full border border-loss text-[8px] leading-[10px] text-loss">
          <span className="absolute inset-0 text-center">!</span>
        </div>
      )}

      {/* 待機中はコーヒー */}
      {pose === "idle" && (
        <>
          <div className="absolute bottom-2 left-2 h-2 w-2 bg-[#c98a5b]" />
          <div className="absolute bottom-4 left-2 h-1 w-2 bg-[#64748b]/60" />
        </>
      )}
    </div>
  );
}
