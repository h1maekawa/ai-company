import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
test("local storage persists immutable learning and rejects corruption and symlink writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase7-storage-"));
  const module = path.join(
    process.env.QA_DIST,
    "out/app/lib/company/execution/store.js",
  );
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `
 const fs=require('node:fs/promises'), path=require('node:path'), assert=require('node:assert/strict');
 const store=require(${JSON.stringify(module)});
 (async()=>{
  const state=store.emptyExecutionState();
  state.runtime={runs:{},executions:[],artifacts:[],learning:[{id:'e1',type:'MISSION_SUCCEEDED',at:'2026-09-13'}]};
  await store.saveExecutionState(state);
  assert.deepEqual((await store.loadExecutionState()).runtime.learning,state.runtime.learning);
  const audit=await fs.readdir(path.join(process.env.VAULT_ROOT,'memory/learning'));
  assert.equal(audit.length,1);
  const changed=structuredClone(state); changed.runtime.learning[0].type='MISSION_FAILED';
  await assert.rejects(store.saveExecutionState(changed),/LEARNING_APPEND_ONLY/);
  const file=path.join(process.env.VAULT_ROOT,'memory/personal/company/execution.md');
  await fs.writeFile(file,'corrupt'); await assert.rejects(store.loadExecutionState(),/INVALID_EXECUTION_STATE/);
  await fs.unlink(file); const protectedFile=path.join(process.env.VAULT_ROOT,'protected.txt');
  await fs.writeFile(protectedFile,'protected'); await fs.symlink(protectedFile,file);
  await assert.rejects(store.saveExecutionState(state),/UNSAFE_EXECUTION_STORAGE/);
  assert.equal(await fs.readFile(protectedFile,'utf8'),'protected');
 })().catch(e=>{console.error(e);process.exitCode=1});
 `,
    ],
    { env: { PATH: process.env.PATH, VAULT_ROOT: root }, encoding: "utf8" },
  );
  try {
    assert.equal(child.status, 0, child.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
