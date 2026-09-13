const base = (process.env.APP_BASE_URL || "https://ai-company-ilqd.vercel.app").replace(/\/$/, "");
const cookie = process.env.SMOKE_SESSION_COOKIE;

async function get(path, authenticated = false) {
  const response = await fetch(base + path, {
    redirect: "manual",
    headers: authenticated && cookie ? { cookie } : {},
  });
  return { response, body: await response.text() };
}

const company = await get("/company");
if (![200, 302, 307, 308].includes(company.response.status)) throw new Error(`COMPANY_ROUTE_${company.response.status}`);

const health = await get("/api/company/runtime/health");
if (health.response.status !== 200) throw new Error(`RUNTIME_HEALTH_${health.response.status}:${health.body.slice(0, 300)}`);
const payload = JSON.parse(health.body);
for (const key of ["redisConnectivity", "missionRead", "approvalRead", "revenueRead"]) {
  if (payload.smokeTest?.[key] !== "ok") throw new Error(`SMOKE_${key}_${payload.smokeTest?.[key] ?? "missing"}`);
}
if (payload.authority !== "vercel" || payload.deployment?.environment !== "production") throw new Error("PRODUCTION_AUTHORITY_INVALID");
if (payload.canary === "enabled") {
  if (payload.latestCanary?.status !== "PASS") throw new Error(`CANARY_${payload.latestCanary?.status ?? "missing"}`);
  if (!payload.latestCanary.schemaValidated || !payload.latestCanary.redisPersisted) throw new Error("CANARY_VALIDATION_INCOMPLETE");
  if (payload.latestCanary.reviewVerdict !== "PASS" || payload.latestCanary.security?.status !== "PASS") throw new Error("CANARY_REVIEW_OR_SECURITY_FAILED");
  if (payload.latestCanary.externalActionCount !== 0) throw new Error("CANARY_EXTERNAL_ACTION_DETECTED");
}

for (const path of ["/api/company/execution", "/api/company/approvals", "/api/company/revenue"]) {
  const result = await get(path, true);
  const expected = cookie ? 200 : 401;
  if (result.response.status !== expected) throw new Error(`${path}_${result.response.status}`);
}

console.log(JSON.stringify({ ok: true, base, commit: payload.deployment?.commitSha, runtime: payload.deployment?.runtimeVersion, authenticatedChecks: Boolean(cookie) }));
