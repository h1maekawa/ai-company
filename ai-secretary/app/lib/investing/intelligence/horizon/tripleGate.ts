import type { HorizonGate, TripleGate } from "./types";

/**
 * Combines the three HorizonGate values into one TripleGate, per INVESTMENT_THINKING_MODEL.md
 * §Triple Gate. If any horizon is DATA_INCOMPLETE, the combined call stays DATA_INCOMPLETE: a
 * confident Triple Gate call cannot be made while one horizon still lacks sufficient evidence.
 */
export function deriveTripleGate(short: HorizonGate, mid: HorizonGate, long: HorizonGate): TripleGate {
  if (short === "DATA_INCOMPLETE" || mid === "DATA_INCOMPLETE" || long === "DATA_INCOMPLETE") return "DATA_INCOMPLETE";

  const isGo = (gate: HorizonGate) => gate === "GO_CANDIDATE";
  if (isGo(short) && isGo(mid) && isGo(long)) return "TRIPLE_GO";
  if (!isGo(short) && isGo(mid) && isGo(long)) return "MID_LONG_GO";
  if (isGo(short) && !isGo(mid) && !isGo(long)) return "SHORT_ONLY";
  if (isGo(long) && !isGo(short) && !isGo(mid)) return "LONG_ONLY";
  if (!isGo(short) && !isGo(mid) && !isGo(long)) return "NO_GO";
  return "MIXED";
}
