import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const compiled = (relative) => path.join(process.env.QA_DIST, "out/app/lib", relative);

test("two independent execution readers cannot overwrite a prior writer", async () => {
  const facade = await import(compiled("company/execution/store.js"));
  const { ExecutionConflictError } = await import(compiled("company/runtime/runtimeTypes.js"));
  let snapshot = { state: facade.emptyExecutionState(), version: 0, schemaVersion: "test", updatedAt: "test" };
  const store = {
    kind: "durable",
    async load() { return { ...snapshot, state: structuredClone(snapshot.state) }; },
    async save(state, options) {
      if (options.expectedVersion !== snapshot.version) throw new ExecutionConflictError(snapshot.version);
      snapshot = { ...snapshot, state: structuredClone(state), version: snapshot.version + 1 };
      return { ...snapshot, state: structuredClone(snapshot.state) };
    },
  };
  facade.setExecutionStoreForTests(store);
  try {
    const first = await facade.loadExecutionState();
    const second = await facade.loadExecutionState();
    await facade.saveExecutionState({ ...first, plans: [{ id: "first" }] });
    await assert.rejects(facade.saveExecutionState({ ...second, plans: [{ id: "second" }] }), /CONFLICT/);
    assert.equal(snapshot.state.plans[0].id, "first");
    await assert.rejects(facade.saveExecutionState(facade.emptyExecutionState()), /EXECUTION_EXPECTED_VERSION_REQUIRED/);
  } finally { facade.setExecutionStoreForTests(); }
});

test("durable execution snapshot uses one atomic Redis read", async () => {
  const script = `
    const assert=require('node:assert/strict');
    const {DurableExecutionStore}=require(${JSON.stringify(compiled("company/runtime/durableExecutionStore.js"))});
    const {RUNTIME_SCHEMA_VERSION}=require(${JSON.stringify(compiled("company/runtime/deploymentMetadata.js"))});
    const state={missions:[],actionRequests:[],approvals:[],plans:[],contentDraftCandidates:[],skillCandidates:[],skillEngineeringSpecifications:[],skillEngineeringHandoffs:[],companyImprovementSpecifications:[],companyImprovementHandoffs:[]};
    let reads=0;
    const redis={eval:async(_script,keys)=>{reads++;assert.equal(keys.length,3);return [JSON.stringify(state),'7',RUNTIME_SCHEMA_VERSION]},get:async()=>{throw Error('non-atomic GET called')}};
    new DurableExecutionStore(redis,'test').load().then(snapshot=>{assert.equal(reads,1);assert.equal(snapshot.version,7);assert.deepEqual(snapshot.state.missions,[])}).catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules") } });
  assert.equal(result.status, 0, result.stderr);
});

test("durable execution snapshot accepts Upstash auto-deserialized JSON", async () => {
  const script = `
    const assert=require('node:assert/strict');
    const {DurableExecutionStore}=require(${JSON.stringify(compiled("company/runtime/durableExecutionStore.js"))});
    const {RUNTIME_SCHEMA_VERSION}=require(${JSON.stringify(compiled("company/runtime/deploymentMetadata.js"))});
    const state={missions:[],actionRequests:[],approvals:[],plans:[],contentDraftCandidates:[],skillCandidates:[],skillEngineeringSpecifications:[],skillEngineeringHandoffs:[],companyImprovementSpecifications:[],companyImprovementHandoffs:[]};
    const redis={eval:async()=>[state,7,RUNTIME_SCHEMA_VERSION]};
    new DurableExecutionStore(redis,'test').load().then(snapshot=>{assert.equal(snapshot.version,7);assert.deepEqual(snapshot.state.missions,[]);assert.deepEqual(snapshot.state.companyImprovementHandoffs,[])}).catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules") } });
  assert.equal(result.status, 0, result.stderr);
});

test("vault retries only a pure transformation on freshly read content", () => {
  const script = `
    const assert=require('node:assert/strict');
    const vault=require(${JSON.stringify(compiled("vault.js"))});
    let calls=0;
    global.fetch=async (_url, opts)=>{
      calls++;
      if(opts.method==='GET') return {status:200,ok:true,json:async()=>({content:Buffer.from(calls===1?'A':'AB').toString('base64'),sha:calls===1?'s1':'s2'})};
      const body=JSON.parse(opts.body);
      if(calls===2) { assert.equal(body.sha,'s1'); return {status:409,ok:false}; }
      assert.equal(body.sha,'s2'); assert.equal(Buffer.from(body.content,'base64').toString(),'AB!');
      return {status:200,ok:true,json:async()=>({content:{sha:'s3'}})};
    };
    vault.updateVaultFile('memory/test.md', value=>value+'!').then(result=>{assert.equal(result.sha,'s3'); assert.equal(calls,4)}).catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, GITHUB_OWNER: "example", GITHUB_REPO: "example", GITHUB_TOKEN: "fake", GITHUB_BRANCH: "test-branch" } });
  assert.equal(result.status, 0, result.stderr);
});

test("GitHub 422 remains a distinct error and is never retried", () => {
  const script = `
    const assert=require('node:assert/strict');
    const vault=require(${JSON.stringify(compiled("vault.js"))});
    let calls=0;
    global.fetch=async()=>{calls++;return {status:422,ok:false}};
    vault.saveVaultFile('memory/test.md','x','sha').then(()=>{process.exitCode=1}).catch(e=>{assert.equal(e.status,422);assert.equal(calls,1)});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, GITHUB_OWNER: "example", GITHUB_REPO: "example", GITHUB_TOKEN: "fake", GITHUB_BRANCH: "test-branch" } });
  assert.equal(result.status, 0, result.stderr);
});
test("missing Vault file is created only after repository accessibility is verified", () => {
  const script = `
    const assert=require('node:assert/strict'); const vault=require(${JSON.stringify(compiled("vault.js"))}); let calls=[];
    global.fetch=async(url,opts)=>{ calls.push([url,opts.method]); if(opts.method==='GET'&&url.includes('/contents/'))return {status:404,ok:false}; if(opts.method==='GET')return {status:200,ok:true}; return {status:201,ok:true,json:async()=>({content:{sha:'created'}})}; };
    vault.saveVaultFile('memory/new.md','new').then(result=>{assert.equal(result.sha,'created');assert.equal(calls.filter(([,m])=>m==='PUT').length,1);assert.ok(calls.some(([u])=>!u.includes('/contents/')))}).catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath,["-e",script],{encoding:"utf8",env:{...process.env,GITHUB_OWNER:"example",GITHUB_REPO:"vault",GITHUB_TOKEN:"fake",GITHUB_BRANCH:"test-branch"}}); assert.equal(result.status,0,result.stderr);
});
test("missing Vault file never attempts create when repository is inaccessible", () => {
  const script = `
    const assert=require('node:assert/strict'); const vault=require(${JSON.stringify(compiled("vault.js"))}); let put=0;
    global.fetch=async(url,opts)=>{if(opts.method==='PUT')put++;return {status:404,ok:false}};
    vault.saveVaultFile('memory/new.md','new').then(()=>{process.exitCode=1}).catch(e=>{assert.equal(e.failureCode,'REPOSITORY_NOT_ACCESSIBLE');assert.equal(put,0)});
  `;
  const result = spawnSync(process.execPath,["-e",script],{encoding:"utf8",env:{...process.env,GITHUB_OWNER:"example",GITHUB_REPO:"vault",GITHUB_TOKEN:"fake",GITHUB_BRANCH:"test-branch"}}); assert.equal(result.status,0,result.stderr);
});

test("hosted ContextBus does not treat Redis failure as an empty bus or successful save", () => {
  const script = `
    const assert=require('node:assert/strict');
    const redis=require(${JSON.stringify(compiled("utils/redis.js"))});
    let fail=false;
    redis.getRedisClient=()=>({eval:async()=>{if(fail)throw Error('offline');return [null,null,null,null,null]}});
    const bus=require(${JSON.stringify(compiled("context/bus-server.js"))});
    (async()=>{
      const loaded=await bus.loadBus();
      fail=true;
      await assert.rejects(bus.loadBus(),/BUS_REDIS_READ_FAILED/);
      await assert.rejects(bus.saveBus(loaded),/BUS_REDIS_WRITE_FAILED/);
    })().catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules"), VERCEL_ENV: "preview" } });
  assert.equal(result.status, 0, result.stderr);
});

test("hosted ContextBus accepts Upstash auto-deserialized JSON", () => {
  const script = `
    const assert=require('node:assert/strict');
    const redis=require(${JSON.stringify(compiled("utils/redis.js"))});
    const queues=[[],[],[],[]];
    const snapshot={company:{inboxQueue:[],taskPipeline:[]},personal:{inboxQueue:[],taskPipeline:[]}};
    redis.getRedisClient=()=>({eval:async()=>[...queues,3,snapshot]});
    const bus=require(${JSON.stringify(compiled("context/bus-server.js"))});
    bus.loadBus().then(loaded=>{assert.deepEqual(loaded.company.inboxQueue,[]);assert.deepEqual(loaded.personal.taskPipeline,[])}).catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules"), VERCEL_ENV: "preview" } });
  assert.equal(result.status, 0, result.stderr);
});
