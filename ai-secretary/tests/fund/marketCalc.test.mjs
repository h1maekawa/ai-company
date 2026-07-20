/**
 * 市場データ計算関数のテスト（docs/12_FUND_POLICY_ENGINE.md §6, §7）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST =
  process.env.FUND_DIST ??
  new URL("../../.test-dist", import.meta.url).pathname;
const {
  rvol20,
  adtv20,
  atr14,
  changePct,
  marketEnv,
  spreadPct,
  shortExitPct,
  rvolLabel,
} = await import(pathToFileURL(`${DIST}/marketData/calc.js`).href);

function makeBars(n, { close = 100, volume = 1_000_000, closeFn, volumeFn } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const c = closeFn ? closeFn(i) : close;
    return {
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      open: c,
      high: c * 1.01,
      low: c * 0.99,
      close: c,
      volume: volumeFn ? volumeFn(i) : volume,
    };
  });
}

test("rvol20: 当日出来高を過去20日平均で割る（当日は平均に含めない）", () => {
  const bars = makeBars(21, { volumeFn: (i) => (i === 20 ? 2_000_000 : 1_000_000) });
  assert.equal(rvol20(bars), 2.0);
});

test("rvol20: 20本未満はnull", () => {
  assert.equal(rvol20(makeBars(20)), null);
});

test("adtv20: 平均終値×平均出来高", () => {
  const bars = makeBars(20, { close: 50, volume: 400_000 });
  assert.equal(adtv20(bars), 50 * 400_000);
});

test("atr14: 一定価格ならATRはレンジ幅相当", () => {
  const bars = makeBars(15, { close: 100 });
  const atr = atr14(bars);
  assert.ok(atr !== null && atr > 0 && atr < 3);
});

test("changePct: 前日比騰落率", () => {
  const bars = makeBars(2, { closeFn: (i) => (i === 0 ? 100 : 110) });
  assert.equal(changePct(bars), 10);
});

test("marketEnv: 上昇トレンドでRISK_ON、下落でRISK_OFF、データ不足でUNKNOWN", () => {
  const rising = makeBars(210, { closeFn: (i) => 100 + i });
  assert.equal(marketEnv(rising), "RISK_ON");
  const falling = makeBars(210, { closeFn: (i) => 400 - i });
  assert.equal(marketEnv(falling), "RISK_OFF");
  assert.equal(marketEnv(makeBars(100)), "UNKNOWN");
});

test("spreadPct: (ask-bid)/mid×100、異常値はnull", () => {
  assert.equal(spreadPct(99.95, 100.05), 0.1);
  assert.equal(spreadPct(0, 100), null);
  assert.equal(spreadPct(101, 100), null);
});

test("shortExitPct: 1.5×ATRを5〜10%へクランプ", () => {
  const cfg = { atrMult: 1.5, minPct: 5, maxPct: 10 };
  assert.equal(shortExitPct(100, 1, cfg), 5); // 1.5% → 下限5%
  assert.equal(shortExitPct(100, 10, cfg), 10); // 15% → 上限10%
  assert.equal(shortExitPct(100, 5, cfg), 7.5); // 7.5%はそのまま
});

test("rvolLabel: 帯の境界", () => {
  const bands = { lowMax: 0.8, normalMax: 1.2, elevatedMax: 1.5, highMax: 2.0 };
  assert.equal(rvolLabel(0.5, bands), "低調");
  assert.equal(rvolLabel(1.0, bands), "通常");
  assert.equal(rvolLabel(1.3, bands), "増加");
  assert.equal(rvolLabel(1.7, bands), "高い");
  assert.equal(rvolLabel(2.5, bands), "異常な注目");
});
