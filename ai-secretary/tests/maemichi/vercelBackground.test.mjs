import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const background = await import(
  path.join(DIST, "integrations/vercel-background.js")
);

test("Vercel request contextがあればwaitUntilへPromiseを登録する", async () => {
  const symbol = Symbol.for("@vercel/request-context");
  const original = globalThis[symbol];
  let registered;
  globalThis[symbol] = {
    get: () => ({
      waitUntil: (task) => {
        registered = task;
      },
    }),
  };
  try {
    const task = Promise.resolve("done");
    background.runInBackground(task);
    assert.equal(registered, task);
    assert.equal(await registered, "done");
  } finally {
    if (original === undefined) delete globalThis[symbol];
    else globalThis[symbol] = original;
  }
});
