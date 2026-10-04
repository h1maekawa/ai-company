import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { probeGithubVault, vaultEnvironmentPresence } = require(path.join(process.env.QA_DIST, "out/app/lib/system/vaultDiagnostics.js"));
const response = (status) => ({ status, ok: status >= 200 && status < 300 });
const run = async (statuses) => { let index = 0; return probeGithubVault({ owner:"owner", repo:"vault", token:"secret-token", branch:"main", fetchImpl:async()=>response(statuses[index++]) }); };

test("Vault probes distinguish repository auth, access, branch and path failures", async () => {
  assert.equal((await run([200,200,200,200])).ok, true);
  assert.equal((await run([401])).failureCode, "TOKEN_INVALID");
  assert.equal((await run([403])).failureCode, "TOKEN_FORBIDDEN");
  assert.equal((await run([404])).failureCode, "REPOSITORY_NOT_ACCESSIBLE");
  assert.equal((await run([200,404])).failureCode, "BRANCH_NOT_FOUND");
  const missing = await run([200,200,200,404]); assert.equal(missing.failureCode, "VAULT_PATH_NOT_FOUND"); assert.equal(missing.failedProbe, "knowledge");
});
test("Vault environment report contains presence booleans and never values", () => {
  const result = vaultEnvironmentPresence({ GITHUB_OWNER:"private-owner", GITHUB_REPO:"private-repo", GITHUB_BRANCH:"main", GITHUB_PRODUCTION_BRANCH:"main", GITHUB_TOKEN:"super-secret" });
  assert.deepEqual(result, { GITHUB_OWNER:true, GITHUB_REPO:true, GITHUB_BRANCH:true, GITHUB_PRODUCTION_BRANCH:true, GITHUB_TOKEN:true });
  assert.doesNotMatch(JSON.stringify(result), /private-owner|private-repo|super-secret/);
});
