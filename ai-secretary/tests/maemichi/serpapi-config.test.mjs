import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const serpapi = await import(path.join(DIST, "note/research/serpapi.js"));

function withEnv(vars, fn) {
  const original = { SERPAPI_ENABLED: process.env.SERPAPI_ENABLED, SERPAPI_KEY: process.env.SERPAPI_KEY };
  Object.assign(process.env, vars);
  for (const key of Object.keys(vars)) {
    if (vars[key] === undefined) delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("SERPAPI_ENABLED=true かつ KEYありならconfigured=true", () => {
  withEnv({ SERPAPI_ENABLED: "true", SERPAPI_KEY: "dummy-key" }, () => {
    assert.equal(serpapi.isSerpApiConfigured(), true);
    assert.deepEqual(serpapi.serpApiStatus(), { configured: true });
  });
});

test("SERPAPI_ENABLED=falseならconfigured=false", () => {
  withEnv({ SERPAPI_ENABLED: "false", SERPAPI_KEY: "dummy-key" }, () => {
    assert.equal(serpapi.isSerpApiConfigured(), false);
  });
});

test("SERPAPI_KEYが無ければconfigured=false", () => {
  withEnv({ SERPAPI_ENABLED: "true", SERPAPI_KEY: undefined }, () => {
    assert.equal(serpapi.isSerpApiConfigured(), false);
  });
});

test("両方未設定でもconfigured=false（例外を投げない）", () => {
  withEnv({ SERPAPI_ENABLED: undefined, SERPAPI_KEY: undefined }, () => {
    assert.equal(serpapi.isSerpApiConfigured(), false);
    assert.deepEqual(serpapi.serpApiStatus(), { configured: false });
  });
});
