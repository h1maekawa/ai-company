import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = process.env.ENGINEERING_DIST;
if (!dist) throw new Error("ENGINEERING_DIST is required");
const control = require(path.join(dist, "activeMachineControl.js"));

const response = (status, payload) => new Response(payload === undefined ? null : JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function githubHarness({ current = "none", running = [], credential = true, updateStatus = 204 } = {}) {
  const calls = [];
  const dependencies = {
    credentialAvailable: () => credential,
    async github(requestPath, init = {}) {
      calls.push({ path: requestPath, method: init.method || "GET", body: init.body });
      if (requestPath.includes("/actions/variables/")) {
        if (init.method === "PATCH") return response(updateStatus);
        return response(200, { name: "ENGINEERING_ACTIVE_MACHINE", value: current });
      }
      if (requestPath.startsWith("/issues?")) return response(200, running);
      return response(404, {});
    },
  };
  return { calls, dependencies };
}

test("GET logic returns the current allowlisted Active Machine", async () => {
  const harness = githubHarness({ current: "home-mac" });
  assert.equal(await control.readEngineeringActiveMachine(harness.dependencies), "home-mac");
  assert.deepEqual(harness.calls.map((call) => call.method), ["GET"]);
});

test("invalid repository Active Machine state fails closed", async () => {
  const harness = githubHarness({ current: "unexpected-machine" });
  await assert.rejects(
    () => control.readEngineeringActiveMachine(harness.dependencies),
    /ACTIVE_MACHINE_STATE_INVALID/
  );
});

for (const machine of ["home-mac", "mobile-mac"]) {
  test(`none -> ${machine} is allowed when no ai-running issue exists`, async () => {
    const harness = githubHarness({ current: "none" });
    assert.equal(await control.updateEngineeringActiveMachine(machine, harness.dependencies), machine);
    assert.deepEqual(harness.calls.map((call) => call.method), ["GET", "GET", "PATCH"]);
    assert.equal(JSON.parse(harness.calls[2].body).value, machine);
  });
}

test("none is always available as Emergency Stop, including while a task is running", async () => {
  const harness = githubHarness({ current: "home-mac", running: [{ number: 96 }] });
  assert.equal(await control.updateEngineeringActiveMachine("none", harness.dependencies), "none");
  assert.deepEqual(harness.calls.map((call) => call.method), ["PATCH"]);
  assert.ok(!harness.calls.some((call) => call.path.startsWith("/issues?")));
});

test("invalid machine values are rejected", () => {
  assert.throws(() => control.assertActiveMachineMutationRequest({ sameOrigin: true, confirmedByHuman: true, machine: "other-mac" }), /INVALID_ACTIVE_MACHINE/);
});

test("human confirmation is required", () => {
  assert.throws(() => control.assertActiveMachineMutationRequest({ sameOrigin: true, confirmedByHuman: false, machine: "none" }), /HUMAN_CONFIRMATION_REQUIRED/);
});

test("cross-origin mutation is rejected", () => {
  assert.throws(() => control.assertActiveMachineMutationRequest({ sameOrigin: false, confirmedByHuman: true, machine: "none" }), /ORIGIN_DENIED/);
});

test("missing GitHub credential fails closed before GitHub access", async () => {
  const harness = githubHarness({ credential: false });
  await assert.rejects(() => control.readEngineeringActiveMachine(harness.dependencies), /GITHUB_CREDENTIAL_UNAVAILABLE/);
  await assert.rejects(() => control.updateEngineeringActiveMachine("none", harness.dependencies), /GITHUB_CREDENTIAL_UNAVAILABLE/);
  assert.deepEqual(harness.calls, []);
});

test("machine activation is rejected while an OPEN ai-running issue exists", async () => {
  const harness = githubHarness({ current: "none", running: [{ number: 96 }] });
  await assert.rejects(() => control.updateEngineeringActiveMachine("home-mac", harness.dependencies), /ENGINEERING_TASK_RUNNING/);
  assert.ok(!harness.calls.some((call) => call.method === "PATCH"));
});

for (const [current, target] of [["home-mac", "mobile-mac"], ["mobile-mac", "home-mac"]]) {
  test(`${current} -> ${target} direct switch is rejected`, async () => {
    const harness = githubHarness({ current });
    await assert.rejects(() => control.updateEngineeringActiveMachine(target, harness.dependencies), /DIRECT_MACHINE_SWITCH_DENIED/);
    assert.ok(!harness.calls.some((call) => call.method === "PATCH"));
  });
}

test("route uses same-origin protection and returns only safe state fields", () => {
  const source = readFileSync(path.join(process.cwd(), "app/api/engineering/active-machine/route.ts"), "utf8");
  assert.match(source, /isSameOriginMutation\(req\)/);
  assert.match(source, /confirmedByHuman/);
  assert.match(source, /\{ activeMachine:/);
  assert.ok(
    source.split("\n").some(
      (line) => line.includes("ACTIVE_MACHINE_STATE_INVALID") && line.includes("return 503")
    )
  );
  assert.doesNotMatch(source, /GITHUB_TOKEN|GH_TOKEN|authorization/i);
});

test("browser control requires confirm and never receives GitHub credentials", () => {
  const source = readFileSync(path.join(process.cwd(), "components/mobile-ceo/EngineeringWorkerControl.tsx"), "utf8");
  assert.match(source, /window\.confirm/);
  assert.match(source, /confirmedByHuman: true/);
  assert.match(source, /activeMachine === null \? "UNKNOWN"/);
  assert.match(source, /machine !== "none"/);
  assert.doesNotMatch(source, /GITHUB_TOKEN|GH_TOKEN|authorization/i);
});
