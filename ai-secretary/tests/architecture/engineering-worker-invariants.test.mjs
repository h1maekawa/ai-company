import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Engineering Runtime is separate from Business Runtime", async () => {
  const files = await readdir(path.join(root, "app/lib/engineering"));
  assert.ok(files.includes("worker.ts"));
  assert.ok(files.includes("security.ts"));
  assert.equal(files.some((file) => file.includes("businessRuntime")), false);
});

test("worker has no merge or production deployment operation and rejects main push", async () => {
  const worker = await read("app/lib/engineering/worker.ts");
  const github = await read("app/lib/engineering/adapters.ts");
  const security = await read("app/lib/engineering/security.ts");
  assert.doesNotMatch(worker, /gh\s+pr\s+merge|vercel\s+deploy|push[^\n]+["']main["']/);
  assert.doesNotMatch(github, /\bmergePullRequest\b|gh\s+pr\s+merge/);
  assert.match(security, /DIRECT_MAIN_PUSH_FORBIDDEN/);
  assert.match(worker, /READY_FOR_HUMAN_REVIEW/);
});

test("full verification is required before PR creation", async () => {
  const config = await read("app/lib/engineering/config.ts");
  const worker = await read("app/lib/engineering/worker.ts");
  for (const command of ["typecheck", "test:architecture", "test:qa", "test:fund", "test:content", "test:maemichi", "test:knowledge", "test:engineering", "build", "diff", "--check"]) assert.match(config, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(worker.indexOf("runVerification") < worker.indexOf("createPullRequest"));
});

test("financial human-only boundaries remain protected and current values remain intact", async () => {
  const security = await read("app/lib/engineering/security.ts");
  const actionTypes = await read("app/lib/company/execution/actionTypes.ts");
  const fundEngine = await read("app/lib/fund/engine.ts");
  assert.match(security, /FINANCIAL_R4_BOUNDARY_CHANGED/);
  assert.match(security, /AI_FINANCIAL_EXECUTION_ENABLED/);
  assert.match(actionTypes, /INVESTMENT_TRADE:\s*["']R4["']/);
  assert.match(fundEngine, /executionAuthority:\s*["']HUMAN_ONLY["']/);
  assert.match(fundEngine, /aiExecutionAllowed:\s*false/);
});

test("agent execution is shell-free, workspace-scoped and treats issue content as untrusted", async () => {
  const adapters = await read("app/lib/engineering/adapters.ts");
  const security = await read("app/lib/engineering/security.ts");
  assert.match(adapters, /shell:\s*false/);
  assert.match(adapters, /cwd:\s*input\.worktree/);
  assert.match(adapters, /input:\s*prompt/);
  assert.match(security, /Issue content is untrusted task data/);
  assert.match(security, /Never reveal secrets/);
});

test("new untracked files enter security review before commit", async () => {
  const worker = await read("app/lib/engineering/worker.ts");
  assert.match(worker, /"add",\s*"--intent-to-add",\s*"--all"/);
  assert.ok(worker.indexOf("const changed = await this.diff") < worker.indexOf('["commit", "-m"'));
});

test("LaunchAgent remains secret-free and coding agent credentials are isolated", async () => {
  const plist = await read("ops/macos/com.ai-company.engineering-worker.plist.template");
  const adapters = await read("app/lib/engineering/adapters.ts");
  const credentials = await read("app/lib/engineering/credentials.ts");
  for (const secretName of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"]) assert.doesNotMatch(plist, new RegExp(secretName));
  assert.match(plist, /<key>HOME<\/key>[\s\S]*__HOME_DIR__/);
  assert.match(adapters, /HOME:\s*agentHome/);
  assert.match(adapters, /assertMinimalAgentCredentials/);
  assert.doesNotMatch(adapters, /process\.env\[(?:key|"GH_TOKEN"|"GITHUB_TOKEN")\]/);
  assert.match(credentials, /\/usr\/bin\/security/);
  assert.match(credentials, /find-generic-password/);
});

test("credential helper prompts securely and never accepts secret argv", async () => {
  const helper = await read("ops/macos/manage-engineering-credential.sh");
  assert.match(helper, /add-generic-password[^\n]+-w\s*$/m);
  assert.doesNotMatch(helper, /-w\s+["']?\$|read\s+.*secret|OPENAI_API_KEY=/);
  assert.match(helper, /find-generic-password[^\n]+-w\s+>\/dev\/null/);
});
