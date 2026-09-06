/**
 * 家計の「月」はJSTで決まる。UTCで数えると月初・月末が1日ずれて
 * 台帳のファイル名（YYYY-MM.md）と集計対象が食い違うので、ここに集約する。
 */

function jstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

/** JSTの当月キー（YYYY-MM） */
export function currentMonth(): string {
  const d = jstNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 直近nヶ月のキーを新しい順で返す（0番目が当月） */
export function monthKeysBack(n: number): string[] {
  const jst = jstNow();
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** JSTの前月キー（YYYY-MM） */
export function previousMonth(): string {
  return monthKeysBack(2)[1];
}

/** 月キーからその月の日付範囲（両端含む）を作る */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
