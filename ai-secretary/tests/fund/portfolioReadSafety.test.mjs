import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("portfolio GET reads history and does not call the Vault snapshot writer", () => {
  const source = fs.readFileSync("app/api/investing/portfolio/route.ts", "utf8");
  assert.match(source, /computeTodayChange, loadHistory/);
  assert.doesNotMatch(source, /recordSnapshot/);
});

test("the existing investing snapshot cron remains the explicit history writer", () => {
  const source = fs.readFileSync("app/api/cron/investing-snapshot/route.ts", "utf8");
  assert.match(source, /recordSnapshot\(portfolio\.summary\.totalValueJpy/);
});
