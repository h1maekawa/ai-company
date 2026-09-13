import path from "node:path";
const base = path.join(process.env.QA_DIST, "out/app/lib/company");
export const runner = await import(path.join(base, "execution/agentRunner.js"));
export const actions = await import(
  path.join(base, "execution/executeAction.js")
);
export const registry = await import(
  path.join(base, "execution/executorRegistry.js")
);
export const learning = await import(path.join(base, "execution/learning.js"));
export const performance = await import(
  path.join(base, "execution/performance.js")
);
export const lifecycle = await import(
  path.join(base, "opportunity/lifecycle.js")
);
export const agent = {
  id: "a",
  granted: ["vault.write", "publish.publish", "gmail.send"],
  riskLevel: "R3",
  skillIds: [],
};
export function fixture(
  steps = [
    { type: "generate" },
    { type: "review" },
    { type: "action", actionType: "INTERNAL_REPORT_CREATE" },
  ],
) {
  return {
    missions: [
      {
        id: "m",
        title: "Report",
        description: "Evidence",
        category: "money",
        status: "ACTIVE",
        assignedAgentId: "a",
        traceId: "t",
        executionPlanId: "p",
        history: [],
        actionRequestIds: [],
        createdAt: new Date().toISOString(),
      },
    ],
    plans: [
      {
        id: "p",
        missionId: "m",
        agentId: "a",
        objective: "Report",
        expectedOutputs: ["Report"],
        steps: steps.map((s, i) => ({
          id: String(i),
          order: i,
          title: s.type,
          status: "PENDING",
          ...s,
        })),
      },
    ],
    approvals: [],
    actionRequests: [],
  };
}
export const worker = async () => "Report: evidence and draft";
export function submit(s, type, payload = {}, a = agent) {
  return actions.submitAction(
    s,
    {
      missionId: "m",
      traceId: "t",
      agent: a,
      actionType: type,
      payloadSummary: JSON.stringify(payload),
    },
    payload,
  );
}
