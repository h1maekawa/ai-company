/**
 * 取込前後の保有差分（TASK-F4）
 *
 * 比較するのは「保有」（銘柄・数量）だけ。
 * 評価額は表示のたびに現在値で計算し直すため（TASK-F1）、差分の対象にしない。
 * これにより「前回の取込からトレードがあったか」だけが一目で分かる。
 */

import type { Holding } from "./rakutenCsv";

export type HoldingsDiff = {
  previousImportedAt: string | null;
  added: { name: string; code: string; quantity: number | null }[];
  removed: { name: string; code: string; quantity: number | null }[];
  changed: { name: string; code: string; from: number | null; to: number | null }[];
};

const keyOf = (h: Holding) => `${h.code || ""}|${h.name}`;

export function diffHoldings(
  previous: Holding[],
  next: Holding[],
  previousImportedAt: string | null
): HoldingsDiff {
  const before = new Map(previous.map((h) => [keyOf(h), h]));
  const after = new Map(next.map((h) => [keyOf(h), h]));

  const added = next
    .filter((h) => !before.has(keyOf(h)))
    .map((h) => ({ name: h.name, code: h.code, quantity: h.quantity }));

  const removed = previous
    .filter((h) => !after.has(keyOf(h)))
    .map((h) => ({ name: h.name, code: h.code, quantity: h.quantity }));

  const changed = next
    .filter((h) => {
      const old = before.get(keyOf(h));
      return old !== undefined && old.quantity !== h.quantity;
    })
    .map((h) => ({
      name: h.name,
      code: h.code,
      from: before.get(keyOf(h))?.quantity ?? null,
      to: h.quantity,
    }));

  return { previousImportedAt, added, removed, changed };
}
