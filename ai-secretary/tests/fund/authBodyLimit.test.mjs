import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST = process.env.FUND_DIST ?? new URL("../../.test-dist", import.meta.url).pathname;
const { readLimitedBody } = await import(pathToFileURL(`${DIST}/mw/read-limited-body.js`).href);

test("body reader stops at the byte limit without Content-Length", async () => {
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(2048)); },
  });
  const request = new Request("https://example.com/login", { method: "POST", body, duplex: "half" });
  assert.equal(await readLimitedBody(request, 4096), null);
  assert.ok(reads <= 4);
});

test("body reader counts UTF-8 bytes and returns valid small input", async () => {
  const request = new Request("https://example.com/login", { method: "POST", body: "日本語" });
  assert.equal(await readLimitedBody(request, 9), "日本語");
});
